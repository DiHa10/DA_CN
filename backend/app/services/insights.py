"""Tóm tắt AI: đọc review tiêu cực gần đây theo từng khía cạnh, viết vấn đề chính và việc nên làm cho chủ quán."""

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..labels import ASPECT_VI
from ..models import Review, ReviewAspect, Store, StoreInsight, utcnow
from . import llm

WINDOW_DAYS = 30
PER_ASPECT = 40  # đủ để thấy vấn đề lặp lại, giữ prompt và chi phí nhỏ

SYSTEM = f"""Bạn là chuyên gia vận hành nhà hàng, giúp chủ quán ăn ở Việt Nam đọc góp ý tiêu cực của khách.
{llm.UNTRUSTED_NOTE}
Với mỗi khía cạnh có trong dữ liệu:
- problem: 1-2 câu nêu điều khách phàn nàn lặp lại nhiều nhất, dựa đúng vào các đánh giá, không suy diễn thêm.
- actions: 2-3 việc cụ thể chủ quán làm được ngay trong quán, mỗi việc một câu ngắn.
headline: một câu nói việc nên ưu tiên số một.
Viết tiếng Việt, ngắn gọn, giọng thân thiện. Chỉ đưa vào các khía cạnh có trong dữ liệu."""

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "aspects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "aspect": {"type": "string", "enum": list(ASPECT_VI)},
                    "problem": {"type": "string"},
                    "actions": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["aspect", "problem", "actions"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "aspects"],
    "additionalProperties": False,
}


class NothingToAnalyze(Exception):
    pass


def collect_negative(db: Session, store: Store, now: datetime) -> tuple[dict[str, list[str]], dict[str, int], int]:
    """Review tiêu cực trong WINDOW_DAYS ngày: (câu mới nhất theo khía cạnh, tổng số theo khía cạnh, số review)."""
    since = now - timedelta(days=WINDOW_DAYS)
    rows = db.execute(
        select(Review.id, Review.content, ReviewAspect.aspect)
        .join(ReviewAspect, ReviewAspect.review_id == Review.id)
        .where(Review.store_id == store.id, ReviewAspect.sentiment == "negative", Review.created_at >= since)
        .order_by(Review.created_at.desc(), Review.id.desc())
    ).all()
    samples: dict[str, list[str]] = {}
    counts: dict[str, int] = {}
    for _, content, aspect in rows:
        counts[aspect] = counts.get(aspect, 0) + 1
        if len(samples.setdefault(aspect, [])) < PER_ASPECT:
            samples[aspect].append(content)
    return samples, counts, len({r.id for r in rows})


def generate(db: Session, store: Store) -> StoreInsight:
    samples, counts, n_reviews = collect_negative(db, store, datetime.now(timezone.utc))
    if not samples:
        raise NothingToAnalyze(f"Chưa có đánh giá tiêu cực nào trong {WINDOW_DAYS} ngày qua để phân tích")

    data = {a: {"ten": ASPECT_VI.get(a, a), "so_danh_gia": counts[a], "danh_gia": texts} for a, texts in samples.items()}
    prompt = (f"Quán: {json.dumps(store.name, ensure_ascii=False)}\n"
              f"Đánh giá tiêu cực {WINDOW_DAYS} ngày qua, theo khía cạnh (JSON):\n{json.dumps(data, ensure_ascii=False)}")
    out = llm.generate_json(SYSTEM, prompt, SCHEMA, effort="medium")

    # số lượt nhắc lấy từ dữ liệu thật, không lấy từ AI; bỏ khía cạnh AI tự thêm mà dữ liệu không có
    aspects = sorted(({**x, "mentions": counts[x["aspect"]]} for x in out["aspects"] if x["aspect"] in counts),
                     key=lambda x: x["mentions"], reverse=True)
    insight = db.get(StoreInsight, store.id) or StoreInsight(store_id=store.id)
    insight.content = {"headline": out["headline"], "aspects": aspects,
                       "window_days": WINDOW_DAYS, "negative_reviews": n_reviews}
    insight.generated_at = utcnow()
    db.add(insight)
    db.commit()
    return insight
