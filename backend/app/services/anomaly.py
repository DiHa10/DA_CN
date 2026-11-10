"""Cảnh báo bất thường: tỉ lệ chê trong 7 ngày gần nhất tăng vọt so với 8 tuần trước đó, theo từng khía cạnh và tổng thể.

Báo khi đủ cả ba điều kiện, để vài review lẻ không làm chủ quán giật mình:
- đủ dữ liệu: ít nhất MIN_MENTIONS lượt nhắc trong tuần và MIN_BASELINE lượt trong 8 tuần trước;
- tăng đáng kể: tỉ lệ chê cao hơn mức nền ít nhất MIN_JUMP (15 điểm phần trăm);
- khó là ngẫu nhiên: z của kiểm định hai tỉ lệ (tuần này so với 8 tuần trước) >= MIN_Z;
- kéo dài: cửa sổ 7 ngày tính tới hôm nay và tính tới hôm qua đều đạt hai điều kiện trên (PERSIST_DAYS).
  Dashboard tính lại mỗi ngày trên 7 dãy nên một lần vượt ngưỡng do ngẫu nhiên rất dễ gặp; cần 2 ngày liền thì
  báo nhầm còn khoảng một nửa (ml/reports/anomaly_results.md).
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
PERSIST_DAYS = 2


def is_anomaly(neg: int, n: int, base_neg: int, base_n: int) -> tuple[bool, float]:
    """(có bất thường không, z). Hàm thuần để test riêng ngưỡng."""
    if n < MIN_MENTIONS or base_n < MIN_BASELINE:
        return False, 0.0
    z = z_score(neg, n, base_neg, base_n)
    return neg / n - base_neg / base_n >= MIN_JUMP and z >= MIN_Z, z


def z_score(neg: int, n: int, base_neg: int, base_n: int) -> float:
    """z của kiểm định hai tỉ lệ (neg/n so với base_neg/base_n); dương là tỉ lệ chê tăng. Cần n, base_n > 0."""
    # mức nền cũng chỉ là ước lượng từ mẫu; bỏ qua nhiễu của nó thì báo nhầm 2-4%/lần (ml/eval_anomaly.py)
    p = (neg + base_neg) / (n + base_n)
    p = min(max(p, 0.05), 0.95)  # tỉ lệ gộp 0% thì sai số chuẩn bằng 0: kẹp lại để z không chia cho 0
    return (neg / n - base_neg / base_n) / sqrt(p * (1 - p) * (1 / n + 1 / base_n))


def _counts(reviews, end: datetime) -> dict:
    """counts[aspect][trong 7 ngày trước end?] = [lượt nhắc, lượt chê]; aspect=None là tổng thể."""
    start = end - timedelta(days=WINDOW_DAYS)
    base_start = start - timedelta(weeks=BASELINE_WEEKS)
    counts: dict[str | None, dict[bool, list[int]]] = defaultdict(lambda: {True: [0, 0], False: [0, 0]})
    for r in reviews:
        t = as_utc(r.created_at)
        if not base_start <= t < end:
            continue
        recent = t >= start
        labels = [(None, r.analysis.sentiment)] if r.analysis else []
        for aspect, sentiment in labels + [(a.aspect, a.sentiment) for a in r.aspects]:
            c = counts[aspect][recent]
            c[0] += 1
            c[1] += sentiment == "negative"
    return counts


def detect(db: Session, store_id: int, now: datetime) -> dict:
    """Các khía cạnh có tỉ lệ chê tăng bất thường trong 7 ngày trước `now`, và đã như vậy liền PERSIST_DAYS ngày."""
    now = as_utc(now)
    ends = [now - timedelta(days=k) for k in range(PERSIST_DAYS)]
    earliest = ends[-1] - timedelta(days=WINDOW_DAYS, weeks=BASELINE_WEEKS)
    reviews = db.scalars(select(Review).where(Review.store_id == store_id, Review.created_at >= earliest,
                                              Review.created_at < now, counted())).all()
    days = [_counts(reviews, end) for end in ends]

    def check(c):
        (n, neg), (base_n, base_neg) = c[True], c[False]
        return is_anomaly(neg, n, base_neg, base_n)

    alerts = []
    for aspect, c in days[0].items():
        (n, neg), (base_n, base_neg) = c[True], c[False]
        hit, z = check(c)
        if hit and all(check(d[aspect])[0] for d in days[1:]):
            alerts.append({"aspect": aspect, "mentions": n, "negative": neg, "rate": neg / n,
                           "baseline_rate": base_neg / base_n, "z": round(z, 1)})
    alerts.sort(key=lambda x: x["z"], reverse=True)
    return {"since": vn_date(ends[0] - timedelta(days=WINDOW_DAYS)).isoformat(), "alerts": alerts}
