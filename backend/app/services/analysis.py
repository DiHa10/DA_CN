from sqlalchemy import select

from ..db import SessionLocal
from ..models import Review, ReviewAnalysis, ReviewAspect
from . import spam
from .nlp import analyze_batch, overall

BATCH_SIZE = 32


def analyze_pending() -> int:
    """Phân tích các review chưa có kết quả: phần bị bỏ dở khi server restart giữa chừng hoặc model lỗi."""
    with SessionLocal() as db:
        ids = list(db.scalars(select(Review.id).outerjoin(ReviewAnalysis).where(ReviewAnalysis.review_id.is_(None))))
    if ids:
        analyze_reviews(ids)
    return len(ids)


def analyze_reviews(review_ids: list[int]) -> None:
    """Chạy trong BackgroundTasks: phân tích và lưu kết quả, ghi đè kết quả cũ."""
    with SessionLocal() as db:
        for i in range(0, len(review_ids), BATCH_SIZE):
            reviews = db.scalars(select(Review).where(Review.id.in_(review_ids[i:i + BATCH_SIZE]))).all()
            for review, result in zip(reviews, analyze_batch([r.content for r in reviews], [r.rating for r in reviews])):
                review.analysis = ReviewAnalysis(sentiment=result["sentiment"], confidence=result["confidence"])
                review.aspects = [ReviewAspect(aspect=a, sentiment=s) for a, s in result["aspects"].items()]
                if review.corrections:  # phân tích lại không được xóa công người đã sửa nhãn
                    apply_corrections(review)
            spam.flag_reviews(db, reviews)  # cần kết quả cảm xúc để so với số sao
            db.commit()


def apply_corrections(review: Review) -> None:
    """Đè nhãn người sửa lên nhãn model, rồi tính lại cảm xúc cả review. Không commit."""
    labels = {a.aspect: a.sentiment for a in review.aspects}
    for c in review.corrections:
        if c.human_label == "none":
            labels.pop(c.aspect, None)
        else:
            labels[c.aspect] = c.human_label
    fixed = {c.aspect for c in review.corrections}
    review.aspects = [ReviewAspect(aspect=a, sentiment=s, corrected=a in fixed) for a, s in labels.items()]
    if review.analysis:
        review.analysis.sentiment = overall(labels, review.rating, review.content)
