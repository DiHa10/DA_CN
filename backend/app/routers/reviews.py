import io
from datetime import date, datetime, timedelta, timezone

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..labels import ASPECT_VI, SENTIMENT_VI, SOURCE_VI, SPAM_VI
from ..models import AspectCorrection, Review, ReviewAnalysis, ReviewAspect, Store, User, utcnow
from ..ratelimit import SlidingWindow
from ..schemas import AspectFix, HiddenIn, ReplyDraft, ReplyIn, ReviewIn, ReviewOut
from ..security import get_current_user, manager_store, staff_store
from ..services import reply, spam
from ..services.analysis import analyze_reviews, apply_corrections
from ..services.llm import LLMError
from ..timeutil import vn_date, vn_day_start

router = APIRouter(prefix="/stores/{store_id}/reviews", tags=["reviews"])

MAX_IMPORT_ROWS = 10_000
MAX_IMPORT_BYTES = 5 * 1024 * 1024


def filtered_reviews(
    store: Store = Depends(staff_store),
    source: str | None = None,
    sentiment: str | None = None,
    aspect: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    replied: bool | None = None,
    spam: bool | None = None,
    hidden: bool | None = None,
):
    """Bộ lọc dùng chung cho danh sách và file Excel, để file xuất ra khớp đúng những gì đang xem."""
    q = select(Review).where(Review.store_id == store.id)
    if source:
        q = q.where(Review.source == source)
    if aspect:
        mentions = select(ReviewAspect.review_id).where(ReviewAspect.aspect == aspect)
        if sentiment:  # có khía cạnh thì lọc cảm xúc của khía cạnh đó: "3 lượt chê phục vụ" phải ra đúng 3 review
            mentions = mentions.where(ReviewAspect.sentiment == sentiment)
        q = q.where(Review.id.in_(mentions))
    elif sentiment:
        q = q.join(ReviewAnalysis).where(ReviewAnalysis.sentiment == sentiment)
    if date_from:
        q = q.where(Review.created_at >= vn_day_start(date_from))
    if date_to:
        q = q.where(Review.created_at < vn_day_start(date_to + timedelta(days=1)))
    if spam is not None:
        q = q.where(Review.spam_reasons.is_not(None) if spam else Review.spam_reasons.is_(None))
    if hidden is not None:
        q = q.where(Review.hidden.is_(hidden))
    if replied is not None:
        q = q.where(Review.reply_text.is_not(None) if replied else Review.reply_text.is_(None))
    return q.order_by(Review.created_at.desc(), Review.id.desc())


@router.get("", response_model=list[ReviewOut])
def list_reviews(q=Depends(filtered_reviews), db: Session = Depends(get_db),
                 limit: int = Query(50, le=200), offset: int = 0):
    return db.scalars(q.limit(limit).offset(offset)).all()


@router.get("/export.xlsx")
def export_reviews(q=Depends(filtered_reviews), store: Store = Depends(manager_store),
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
            "Nghi spam": ", ".join(SPAM_VI.get(x, x) for x in r.spam_reasons or []),
            "Ẩn khỏi thống kê": "Có" if r.hidden else "",
        })
    columns = ["Ngày", "Nguồn", "Khách", "Số sao", "Nội dung", "Cảm xúc", *ASPECT_VI.values(), "Nghi spam", "Ẩn khỏi thống kê"]
    buf = io.BytesIO()
    pd.DataFrame(rows, columns=columns).to_excel(buf, index=False, sheet_name="Đánh giá")
    filename = f"danh-gia-{store.slug}-{date.today().isoformat()}.xlsx"
    return Response(
        buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=ReviewOut, status_code=201)
def create_review(body: ReviewIn, tasks: BackgroundTasks, store: Store = Depends(manager_store),
                  db: Session = Depends(get_db)):
    review = Review(store_id=store.id, source="manual", **body.model_dump())
    db.add(review)
    db.commit()
    tasks.add_task(analyze_reviews, [review.id])
    return review


@router.post("/import", status_code=201)
async def import_reviews(file: UploadFile, tasks: BackgroundTasks, store: Store = Depends(manager_store),
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


# mỗi gợi ý chiếm GPU vài giây
draft_limit = SlidingWindow(60, 3600, "Đã gợi ý quá nhiều câu trả lời trong giờ này, thử lại sau")


def _owned_review(review_id: int, store: Store, db: Session) -> Review:
    review = db.get(Review, review_id)
    if not review or review.store_id != store.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")
    return review


@router.post("/{review_id}/reply-draft", response_model=ReplyDraft)
def reply_draft(review_id: int, store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    review = _owned_review(review_id, store, db)
    draft_limit.check(str(store.id))  # chỉ tính lượt khi AI trả kết quả thành công
    db.commit()  # trả kết nối DB về pool trước khi chờ AI (vài giây tới cả phút)
    try:
        text = reply.draft(store, review)
        draft_limit.hit(str(store.id))
        return ReplyDraft(reply_text=text)
    except LLMError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))


@router.put("/{review_id}/reply", response_model=ReviewOut)
def save_reply(review_id: int, body: ReplyIn, store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    review = _owned_review(review_id, store, db)
    text = body.reply_text.strip()
    review.reply_text, review.replied_at = (text, utcnow()) if text else (None, None)
    db.commit()
    return review


@router.put("/{review_id}/aspects/{aspect}", response_model=ReviewOut)
def fix_aspect(review_id: int, aspect: str, body: AspectFix, store: Store = Depends(manager_store),
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Sửa nhãn model đoán sai cho một khía cạnh; sửa về đúng nhãn của model thì coi như bỏ lần sửa."""
    if aspect not in ASPECT_VI:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có khía cạnh này")
    review = _owned_review(review_id, store, db)
    if not review.analysis:
        raise HTTPException(status.HTTP_409_CONFLICT, "Đánh giá đang được phân tích, thử lại sau ít giây")
    fix = next((c for c in review.corrections if c.aspect == aspect), None)
    model_label = fix.model_label if fix else next((a.sentiment for a in review.aspects if a.aspect == aspect), "none")
    if body.sentiment == model_label:
        if fix:
            review.corrections.remove(fix)
    elif fix:
        fix.human_label, fix.user_id, fix.created_at = body.sentiment, user.id, utcnow()
    else:
        review.corrections.append(AspectCorrection(aspect=aspect, model_label=model_label, human_label=body.sentiment, user_id=user.id))
    if fix and body.sentiment == model_label:
        # bỏ lần sửa: lấy lại nhãn model cho khía cạnh này trước khi áp các lần sửa còn lại
        review.aspects = [a for a in review.aspects if a.aspect != aspect]
        if model_label != "none":
            review.aspects.append(ReviewAspect(aspect=aspect, sentiment=model_label))
    apply_corrections(review)
    spam.flag_reviews(db, [review])  # cảm xúc đổi thì luật "số sao ngược nội dung" phải xét lại
    db.commit()
    db.refresh(review)
    return review


@router.put("/{review_id}/hidden", response_model=ReviewOut)
def set_hidden(review_id: int, body: HiddenIn, store: Store = Depends(manager_store), db: Session = Depends(get_db)):
    """Ẩn review (thường là spam) khỏi thống kê, tóm tắt AI và báo cáo; review vẫn còn để xem lại hoặc bỏ ẩn."""
    review = _owned_review(review_id, store, db)
    if body.hidden and not review.spam_reasons:  # ẩn tùy ý thì giấu được lời chê thật khỏi báo cáo
        raise HTTPException(400, "Chỉ ẩn được đánh giá bị nghi spam")
    review.hidden = body.hidden
    db.commit()
    return review


def _excel_safe(text: str) -> str:
    # nội dung do khách gõ: chuỗi mở đầu bằng = + - @ sẽ thành công thức khi mở bằng Excel
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _clean(value):
    return None if value is None or (isinstance(value, float) and pd.isna(value)) else value
