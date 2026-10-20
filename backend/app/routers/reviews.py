import io
from datetime import date, datetime, timedelta, timezone

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Review, ReviewAnalysis, ReviewAspect, Store
from ..schemas import ReviewIn, ReviewOut
from ..security import get_owned_store
from ..services.analysis import analyze_reviews
from ..timeutil import vn_date, vn_day_start

router = APIRouter(prefix="/stores/{store_id}/reviews", tags=["reviews"])

SENTIMENT_VI = {"positive": "Tích cực", "neutral": "Trung lập", "negative": "Tiêu cực"}
SOURCE_VI = {"google": "Google Maps", "qr": "QR tại quán", "csv": "Import file", "manual": "Nhập tay"}
ASPECT_VI = {"food": "Món ăn", "drink": "Đồ uống", "service": "Phục vụ", "price": "Giá cả",
             "ambience": "Không gian", "location": "Vị trí"}

MAX_IMPORT_ROWS = 10_000
MAX_IMPORT_BYTES = 5 * 1024 * 1024


def filtered_reviews(
    store: Store = Depends(get_owned_store),
    source: str | None = None,
    sentiment: str | None = None,
    aspect: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Bộ lọc dùng chung cho danh sách và file Excel, để file xuất ra khớp đúng những gì đang xem."""
    q = select(Review).where(Review.store_id == store.id)
    if source:
        q = q.where(Review.source == source)
    if sentiment:
        q = q.join(ReviewAnalysis).where(ReviewAnalysis.sentiment == sentiment)
    if aspect:
        q = q.where(Review.id.in_(select(ReviewAspect.review_id).where(ReviewAspect.aspect == aspect)))
    if date_from:
        q = q.where(Review.created_at >= vn_day_start(date_from))
    if date_to:
        q = q.where(Review.created_at < vn_day_start(date_to + timedelta(days=1)))
    return q.order_by(Review.created_at.desc(), Review.id.desc())


@router.get("", response_model=list[ReviewOut])
def list_reviews(q=Depends(filtered_reviews), db: Session = Depends(get_db),
                 limit: int = Query(50, le=200), offset: int = 0):
    return db.scalars(q.limit(limit).offset(offset)).all()


@router.get("/export.xlsx")
def export_reviews(q=Depends(filtered_reviews), store: Store = Depends(get_owned_store),
                   db: Session = Depends(get_db)):
    rows = []
    for r in db.scalars(q):
        aspects = {a.aspect: SENTIMENT_VI[a.sentiment] for a in r.aspects}
        rows.append({
            "Ngày": vn_date(r.created_at).isoformat(),
            "Nguồn": SOURCE_VI.get(r.source, r.source),
            "Khách": _excel_safe(r.author or ""),
            "Số sao": r.rating,
            "Nội dung": _excel_safe(r.content),
            "Cảm xúc": SENTIMENT_VI[r.analysis.sentiment] if r.analysis else "Chưa phân tích",
            **{label: aspects.get(key, "") for key, label in ASPECT_VI.items()},
        })
    columns = ["Ngày", "Nguồn", "Khách", "Số sao", "Nội dung", "Cảm xúc", *ASPECT_VI.values()]
    buf = io.BytesIO()
    pd.DataFrame(rows, columns=columns).to_excel(buf, index=False, sheet_name="Đánh giá")
    filename = f"danh-gia-{store.slug}-{date.today().isoformat()}.xlsx"
    return Response(
        buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=ReviewOut, status_code=201)
def create_review(body: ReviewIn, tasks: BackgroundTasks, store: Store = Depends(get_owned_store),
                  db: Session = Depends(get_db)):
    review = Review(store_id=store.id, source="manual", **body.model_dump())
    db.add(review)
    db.commit()
    tasks.add_task(analyze_reviews, [review.id])
    return review


@router.post("/import", status_code=201)
async def import_reviews(file: UploadFile, tasks: BackgroundTasks, store: Store = Depends(get_owned_store),
                         db: Session = Depends(get_db)):
    """Nhận CSV/XLSX có cột bắt buộc `content`; cột tùy chọn: rating, author, source, created_at, external_id."""
    raw = await file.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File tối đa 5MB")
    try:
        if (file.filename or "").lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(raw))
        else:
            df = pd.read_csv(io.BytesIO(raw), encoding="utf-8-sig")
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không đọc được file CSV/Excel")
    df.columns = [str(c).strip().lower() for c in df.columns]
    if "content" not in df.columns:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File thiếu cột 'content'")
    if len(df) > MAX_IMPORT_ROWS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Tối đa {MAX_IMPORT_ROWS} dòng mỗi lần")

    existing = set(db.scalars(select(Review.external_id).where(
        Review.store_id == store.id, Review.external_id.is_not(None))).all())
    reviews, skipped = [], 0
    for row in df.to_dict("records"):
        content = str(row.get("content") or "").strip()[:2000]
        ext = _clean(row.get("external_id"))
        ext = str(ext) if ext is not None else None
        if len(content) < 2 or (ext and ext in existing):
            skipped += 1
            continue
        rating = pd.to_numeric(_clean(row.get("rating")), errors="coerce")
        created = pd.to_datetime(_clean(row.get("created_at")), errors="coerce", utc=True)
        author = _clean(row.get("author"))
        if ext:
            existing.add(ext)
        reviews.append(Review(
            store_id=store.id, content=content, external_id=ext,
            source=str(_clean(row.get("source")) or "csv")[:20],
            rating=int(rating) if not pd.isna(rating) and 1 <= rating <= 5 else None,
            author=str(author)[:200] if author is not None else None,
            created_at=created.to_pydatetime() if not pd.isna(created) else datetime.now(timezone.utc),
        ))
    db.add_all(reviews)
    db.commit()
    tasks.add_task(analyze_reviews, [r.id for r in reviews])
    return {"imported": len(reviews), "skipped": skipped}


def _excel_safe(text: str) -> str:
    # nội dung do khách gõ: chuỗi mở đầu bằng = + - @ sẽ thành công thức khi mở bằng Excel
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _clean(value):
    return None if value is None or (isinstance(value, float) and pd.isna(value)) else value
