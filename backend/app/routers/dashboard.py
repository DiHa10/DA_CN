from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Review, Store, counted
from ..security import staff_store
from ..services import anomaly
from ..services.nlp import complaint_phrases
from ..timeutil import VN, as_utc, vn_date, vn_day_start

router = APIRouter(prefix="/stores/{store_id}/dashboard", tags=["dashboard"])

SENTIMENTS = ("positive", "neutral", "negative")
# khung giờ trong ngày (giờ VN) cho bảng "khách chê vào lúc nào"; giờ ngoài các khung là Khuya
SLOTS = [("Sáng", 6, 11), ("Trưa", 11, 14), ("Chiều", 14, 18), ("Tối", 18, 22), ("Khuya", 22, 6)]


def is_complaint(r: Review) -> bool:
    """Có lời chê: review tiêu cực hoặc có khía cạnh bị chê (giống bộ lọc complaint=true ở trang Đánh giá)."""
    return r.analysis.sentiment == "negative" or any(a.sentiment == "negative" for a in r.aspects)


def by_time(analyzed: list[Review]) -> dict:
    """Số góp ý và lời chê theo khung giờ × thứ. Chỉ góp ý qua QR: khách gửi ngay tại quán nên giờ gửi ~ giờ ở quán;
    review Google Maps nhập vào chỉ có ngày hoặc là giờ đăng bài, không phải giờ đến quán."""
    cells = [[{"total": 0, "negative": 0} for _ in range(7)] for _ in SLOTS]
    qr = [r for r in analyzed if r.source == "qr"]
    for r in qr:
        t = as_utc(r.created_at).astimezone(VN)
        slot = next((i for i, (_, a, b) in enumerate(SLOTS[:-1]) if a <= t.hour < b), len(SLOTS) - 1)
        # khuya sau 0h vẫn là đêm của hôm trước (quán mở tới 1h sáng thứ Bảy là tối thứ Sáu)
        day = (t.weekday() - (t.hour < 6)) % 7
        cell = cells[slot][day]
        cell["total"] += 1
        cell["negative"] += is_complaint(r)
    return {"total": len(qr), "slots": [f"{name} {a}–{b}h" for name, a, b in SLOTS], "cells": cells}


@router.get("")
def summary(days: int | None = Query(None, ge=1, le=3650), brief: bool = False,
            store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    """days: chỉ tính review trong N ngày gần nhất (theo ngày VN, tính cả hôm nay); bỏ trống là toàn bộ lịch sử.
    brief: bỏ phần tách cụm từ chê (tốn CPU nhất) cho ô "7 ngày qua" ở menu, vốn chỉ cần tổng số."""
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
    week_sources = defaultdict(Counter)  # google | qr | csv | manual theo tuần: góp ý đến từ đâu
    week_ratings = defaultdict(list)  # điểm sao theo tuần: chủ quán quen nhìn sao Google hơn tỉ lệ chê
    aspects = defaultdict(Counter)
    latest_negative = {}  # aspect -> nội dung review tiêu cực mới nhất, để chủ quán đọc lời khách
    for r in sorted(analyzed, key=lambda r: r.created_at, reverse=True):
        day = vn_date(r.created_at)  # tuần bắt đầu thứ Hai theo giờ VN
        monday = (day - timedelta(days=day.weekday())).isoformat()
        trend[monday][r.analysis.sentiment] += 1
        week_sources[monday][r.source] += 1
        if r.rating:
            week_ratings[monday].append(r.rating)
        for a in r.aspects:
            aspects[a.aspect][a.sentiment] += 1
            if a.sentiment == "negative":
                latest_negative.setdefault(a.aspect, {"content": r.content, "created_at": as_utc(r.created_at)})

    def row(counter):
        return {s: counter[s] for s in SENTIMENTS}

    complaints = [r.content for r in sorted(analyzed, key=lambda r: r.created_at, reverse=True) if is_complaint(r)]
    # shortcut: tách từ ~3ms/review nên chỉ tìm cụm trong 200 review chê gần nhất; cần cả lịch sử thì tính sẵn khi phân tích.
    # Số hiển thị đếm lại đúng như trang Đánh giá lọc (?q=cụm&complaint=true): review có lời chê chứa cụm đó, bấm vào ra đúng số ấy
    lowered = [c.lower() for c in complaints]
    phrases = [] if brief else [{"phrase": p["phrase"], "count": sum(p["phrase"] in c for c in lowered)}
                                for p in complaint_phrases(complaints[:200], top=12)]
    phrases = sorted((p for p in phrases if p["count"] >= 2), key=lambda p: -p["count"])[:8]
    ratings = [r.rating for r in reviews if r.rating]
    previous = None  # cùng độ dài ngay trước khoảng đang xem: thẻ chỉ số ghi "so với 30 ngày trước"
    if since:
        prev = db.scalars(select(Review).where(Review.store_id == store.id, counted(),
                                               Review.created_at >= vn_day_start(since - timedelta(days=days)),
                                               Review.created_at < vn_day_start(since))).all()
        prev_rated = [r.rating for r in prev if r.rating]
        previous = {"total": len(prev), "analyzed": sum(1 for r in prev if r.analysis),
                    "sentiment": row(Counter(r.analysis.sentiment for r in prev if r.analysis)),
                    "avg_rating": round(sum(prev_rated) / len(prev_rated), 2) if prev_rated else None}
    aspect_rows = [{"aspect": a, **row(c), "total": sum(c.values()), "latest_negative": latest_negative.get(a)}
                   for a, c in aspects.items()]
    return {
        "since": since.isoformat() if since else None,  # để link sang trang Đánh giá lọc đúng cùng khoảng
        "total": len(reviews),
        "analyzed": len(analyzed),
        "sentiment": row(totals),
        "rated": len(ratings),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "rating_dist": [ratings.count(n) for n in range(1, 6)],  # số lượt 1★..5★
        "previous": previous,
        "trend": [{"week_start": w, **row(c), "sources": dict(week_sources[w]), "rated": len(week_ratings[w]),
                   "avg_rating": round(sum(week_ratings[w]) / len(week_ratings[w]), 2) if week_ratings[w] else None}
                  for w, c in sorted(trend.items())],
        "aspects": sorted(aspect_rows, key=lambda x: x["total"], reverse=True),
        "complaints": phrases,
        "open_complaints": sum(1 for r in analyzed if r.status != "done" and is_complaint(r)),  # lời chê chưa xử lý xong
        "by_time": by_time(analyzed),
    }


@router.get("/anomalies")
def anomalies(store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    return anomaly.detect(db, store.id, datetime.now(timezone.utc))
