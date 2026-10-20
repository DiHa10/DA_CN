from sqlalchemy import select

from ..db import SessionLocal
from ..models import Review, ReviewAnalysis, ReviewAspect
from .nlp import analyze_batch

BATCH_SIZE = 32


def analyze_reviews(review_ids: list[int]) -> None:
    """Chạy trong BackgroundTasks: phân tích và lưu kết quả, ghi đè kết quả cũ."""
    with SessionLocal() as db:
        for i in range(0, len(review_ids), BATCH_SIZE):
            reviews = db.scalars(select(Review).where(Review.id.in_(review_ids[i:i + BATCH_SIZE]))).all()
            for review, result in zip(reviews, analyze_batch([r.content for r in reviews])):
                review.analysis = ReviewAnalysis(sentiment=result["sentiment"], confidence=result["confidence"])
                review.aspects = [ReviewAspect(aspect=a, sentiment=s) for a, s in result["aspects"].items()]
            db.commit()
