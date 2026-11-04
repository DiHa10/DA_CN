from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Review, Store
from ..ratelimit import SlidingWindow
from ..schemas import DemoIn, PublicStore, ReviewIn
from ..services import spam
from ..services.analysis import analyze_reviews
from ..services.nlp import analyze_batch

router = APIRouter(prefix="/public/stores", tags=["public"])

per_ip = SlidingWindow(5, 60, "Gửi quá nhiều, thử lại sau 1 phút")
# IP qua proxy Next.js giả được (Next giữ nguyên X-Forwarded-For do client gửi), nên thêm trần theo từng quán:
# spam bằng IP giả vẫn bị chặn ở mức này. Khi deploy, đặt nginx phía trước để ghi đè X-Forwarded-For bằng IP thật.
per_store = SlidingWindow(30, 60, "Quán đang nhận quá nhiều góp ý, thử lại sau ít phút")


def _client_ip(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    # chỉ tin X-Forwarded-For khi request đến từ proxy chạy cùng máy; gọi thẳng backend từ máy khác thì dùng IP socket
    if host in ("127.0.0.1", "::1") and (fwd := request.headers.get("x-forwarded-for")):
        return fwd.split(",")[0].strip()
    return host


def _store_by_slug(slug: str, db: Session) -> Store:
    store = db.scalar(select(Store).where(Store.slug == slug))
    if not store:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cửa hàng")
    return store


@router.get("/{slug}", response_model=PublicStore)
def get_public_store(slug: str, db: Session = Depends(get_db)):
    return _store_by_slug(slug, db)


@router.post("/{slug}/reviews", status_code=201)
def submit_review(slug: str, body: ReviewIn, request: Request, tasks: BackgroundTasks,
                  db: Session = Depends(get_db)):
    ip = _client_ip(request)
    per_ip.hit(ip)
    store = _store_by_slug(slug, db)
    per_store.hit(str(store.id))
    review = Review(store_id=store.id, source="qr", client_hash=spam.client_hash(ip), **body.model_dump())
    db.add(review)
    db.commit()
    tasks.add_task(analyze_reviews, [review.id])
    return {"ok": True}


# Thử trực tiếp ở trang giới thiệu: phân tích một câu, không lưu gì. Mỗi lần gọi chạy model, nên chặn theo IP
# và thêm trần chung (IP giả qua X-Forwarded-For vẫn không làm nghẽn model).
demo = APIRouter(prefix="/public", tags=["public"])
demo_per_ip = SlidingWindow(20, 60, "Thử quá nhiều, đợi 1 phút rồi thử tiếp")
demo_all = SlidingWindow(120, 60, "Đang có nhiều người thử, đợi ít phút rồi thử tiếp")


@demo.post("/analyze")
def analyze_demo(body: DemoIn, request: Request):
    demo_per_ip.hit(_client_ip(request))
    demo_all.hit("all")
    result = analyze_batch([body.text])[0]
    return {"sentiment": result["sentiment"], "aspects": result["aspects"]}
