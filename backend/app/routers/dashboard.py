from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Review, Store
from ..security import get_owned_store

router = APIRouter(prefix="/stores/{store_id}/dashboard", tags=["dashboard"])

SENTIMENTS = ("positive", "neutral", "negative")


@router.get("")
def summary(store: Store = Depends(get_owned_store), db: Session = Depends(get_db)):
    # shortcut: tổng hợp trong Python, ổn tới vài chục nghìn review; chuyển sang GROUP BY trong SQL nếu chậm
    reviews = db.scalars(select(Review).where(Review.store_id == store.id)).all()
    analyzed = [r for r in reviews if r.analysis]

    totals = Counter(r.analysis.sentiment for r in analyzed)
    trend = defaultdict(Counter)
    aspects = defaultdict(Counter)
    latest_negative = {}  # aspect -> nội dung review tiêu cực mới nhất, để chủ quán đọc lời khách
    for r in sorted(analyzed, key=lambda r: r.created_at, reverse=True):
        monday = (r.created_at - timedelta(days=r.created_at.weekday())).date().isoformat()
        trend[monday][r.analysis.sentiment] += 1
        for a in r.aspects:
            aspects[a.aspect][a.sentiment] += 1
            if a.sentiment == "negative":
                latest_negative.setdefault(a.aspect, {"content": r.content, "created_at": r.created_at})

    def row(counter):
        return {s: counter[s] for s in SENTIMENTS}

    ratings = [r.rating for r in reviews if r.rating]
    aspect_rows = [{"aspect": a, **row(c), "total": sum(c.values()), "latest_negative": latest_negative.get(a)}
                   for a, c in aspects.items()]
    # "cần cải thiện": khía cạnh có tỉ lệ tiêu cực cao nhất, bỏ khía cạnh quá ít dữ liệu
    improve = sorted((x for x in aspect_rows if x["negative"] and x["total"] >= 3),
                     key=lambda x: x["negative"] / x["total"], reverse=True)[:3]
    return {
        "total": len(reviews),
        "analyzed": len(analyzed),
        "sentiment": row(totals),
        "rated": len(ratings),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "trend": [{"week_start": w, **row(c)} for w, c in sorted(trend.items())],
        "aspects": sorted(aspect_rows, key=lambda x: x["total"], reverse=True),
        "improve": [{"aspect": x["aspect"], "negative_rate": round(x["negative"] / x["total"], 3)} for x in improve],
    }
