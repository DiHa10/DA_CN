"""Cảnh báo bất thường: tỉ lệ chê trong 7 ngày gần nhất tăng vọt so với 8 tuần trước đó, theo từng khía cạnh và tổng thể.

Báo khi đủ cả ba điều kiện, để vài review lẻ không làm chủ quán giật mình:
- đủ dữ liệu: ít nhất MIN_MENTIONS lượt nhắc trong tuần và MIN_BASELINE lượt trong 8 tuần trước;
- tăng đáng kể: tỉ lệ chê cao hơn mức nền ít nhất MIN_JUMP (15 điểm phần trăm);
- khó là ngẫu nhiên: z = (tỉ lệ tuần - mức nền) / sai số chuẩn nhị thức >= MIN_Z.
"""

from collections import defaultdict
from datetime import datetime, timedelta
from math import sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Review, counted
from ..timeutil import as_utc, vn_date

WINDOW_DAYS = 7
BASELINE_WEEKS = 8
MIN_MENTIONS, MIN_BASELINE = 5, 10
MIN_JUMP = 0.15
MIN_Z = 2.5


def is_anomaly(neg: int, n: int, base_neg: int, base_n: int) -> tuple[bool, float]:
    """(có bất thường không, z). Hàm thuần để test riêng ngưỡng."""
    if n < MIN_MENTIONS or base_n < MIN_BASELINE:
        return False, 0.0
    rate, p0 = neg / n, base_neg / base_n
    p = min(max(p0, 0.05), 0.95)  # mức nền 0% thì sai số chuẩn bằng 0: kẹp lại để z không chia cho 0
    z = (rate - p0) / sqrt(p * (1 - p) / n)
    return rate - p0 >= MIN_JUMP and z >= MIN_Z, z


def detect(db: Session, store_id: int, now: datetime) -> dict:
    """Các khía cạnh (aspect=None là tổng thể) có tỉ lệ chê tăng bất thường trong 7 ngày trước `now`."""
    now = as_utc(now)
    start = now - timedelta(days=WINDOW_DAYS)
    base_start = start - timedelta(weeks=BASELINE_WEEKS)
    reviews = db.scalars(select(Review).where(Review.store_id == store_id, Review.created_at >= base_start,
                                              Review.created_at < now, counted())).all()
    # counts[aspect][recent] = [lượt nhắc, lượt chê]
    counts: dict[str | None, dict[bool, list[int]]] = defaultdict(lambda: {True: [0, 0], False: [0, 0]})
    for r in reviews:
        recent = as_utc(r.created_at) >= start
        if r.analysis:
            c = counts[None][recent]
            c[0] += 1
            c[1] += r.analysis.sentiment == "negative"
        for a in r.aspects:
            c = counts[a.aspect][recent]
            c[0] += 1
            c[1] += a.sentiment == "negative"

    alerts = []
    for aspect, c in counts.items():
        (n, neg), (base_n, base_neg) = c[True], c[False]
        hit, z = is_anomaly(neg, n, base_neg, base_n)
        if hit:
            alerts.append({"aspect": aspect, "mentions": n, "negative": neg, "rate": neg / n,
                           "baseline_rate": base_neg / base_n, "z": round(z, 1)})
    alerts.sort(key=lambda x: x["z"], reverse=True)
    return {"since": vn_date(start).isoformat(), "alerts": alerts}
