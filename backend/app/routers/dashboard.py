from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Review, Store, counted
from ..security import staff_store
from ..timeutil import as_utc, vn_date

router = APIRouter(prefix="/stores/{store_id}/dashboard", tags=["dashboard"])

SENTIMENTS = ("positive", "neutral", "negative")


@router.get("")
def summary(store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    # shortcut: tổng hợp trong Python, ổn tới vài chục nghìn review; chuyển sang GROUP BY trong SQL nếu chậm
    reviews = db.scalars(select(Review).where(Review.store_id == store.id, counted())).all()
    analyzed = [r for r in reviews if r.analysis]

    totals = Counter(r.analysis.sentiment for r in analyzed)
    trend = defaultdict(Counter)
    aspects = defaultdict(Counter)
    latest_negative = {}  # aspect -> nội dung review tiêu cực mới nhất, để chủ quán đọc lời khách
    for r in sorted(analyzed, key=lambda r: r.created_at, reverse=True):
        day = vn_date(r.created_at)  # tuần bắt đầu thứ Hai theo giờ VN
        monday = (day - timedelta(days=day.weekday())).isoformat()
        trend[monday][r.analysis.sentiment] += 1
        for a in r.aspects:
            aspects[a.aspect][a.sentiment] += 1
            if a.sentiment == "negative":
                latest_negative.setdefault(a.aspect, {"content": r.content, "created_at": as_utc(r.created_at)})

    def row(counter):
        return {s: counter[s] for s in SENTIMENTS}

    ratings = [r.rating for r in reviews if r.rating]
    aspect_rows = [{"aspect": a, **row(c), "total": sum(c.values()), "latest_negative": latest_negative.get(a)}
                   for a, c in aspects.items()]
    return {
        "total": len(reviews),
        "analyzed": len(analyzed),
        "sentiment": row(totals),
        "rated": len(ratings),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "trend": [{"week_start": w, **row(c)} for w, c in sorted(trend.items())],
        "aspects": sorted(aspect_rows, key=lambda x: x["total"], reverse=True),
    }
