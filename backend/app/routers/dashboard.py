from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Review, Store, counted
from ..security import staff_store
from ..services import anomaly
from ..timeutil import as_utc, vn_date, vn_day_start

router = APIRouter(prefix="/stores/{store_id}/dashboard", tags=["dashboard"])

SENTIMENTS = ("positive", "neutral", "negative")


@router.get("")
def summary(days: int | None = Query(None, ge=1, le=3650), store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    """days: chỉ tính review trong N ngày gần nhất (theo ngày VN, tính cả hôm nay); bỏ trống là toàn bộ lịch sử."""
    q = select(Review).where(Review.store_id == store.id, counted())
    since = None
    if days:
        since = vn_date(datetime.now(timezone.utc)) - timedelta(days=days - 1)
        q = q.where(Review.created_at >= vn_day_start(since))
    # shortcut: tổng hợp trong Python, ổn tới vài chục nghìn review; chuyển sang GROUP BY trong SQL nếu chậm
    reviews = db.scalars(q).all()
    analyzed = [r for r in reviews if r.analysis]

    totals = Counter(r.analysis.sentiment for r in analyzed)
    trend = defaultdict(Counter)
    week_ratings = defaultdict(list)  # điểm sao theo tuần: chủ quán quen nhìn sao Google hơn tỉ lệ chê
    aspects = defaultdict(Counter)
    latest_negative = {}  # aspect -> nội dung review tiêu cực mới nhất, để chủ quán đọc lời khách
    for r in sorted(analyzed, key=lambda r: r.created_at, reverse=True):
        day = vn_date(r.created_at)  # tuần bắt đầu thứ Hai theo giờ VN
        monday = (day - timedelta(days=day.weekday())).isoformat()
        trend[monday][r.analysis.sentiment] += 1
        if r.rating:
            week_ratings[monday].append(r.rating)
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
        "since": since.isoformat() if since else None,  # để link sang trang Đánh giá lọc đúng cùng khoảng
        "total": len(reviews),
        "analyzed": len(analyzed),
        "sentiment": row(totals),
        "rated": len(ratings),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "trend": [{"week_start": w, **row(c), "rated": len(week_ratings[w]),
                   "avg_rating": round(sum(week_ratings[w]) / len(week_ratings[w]), 2) if week_ratings[w] else None}
                  for w, c in sorted(trend.items())],
        "aspects": sorted(aspect_rows, key=lambda x: x["total"], reverse=True),
    }


@router.get("/anomalies")
def anomalies(store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    return anomaly.detect(db, store.id, datetime.now(timezone.utc))
