"""Tóm tắt AI: đọc review tiêu cực gần đây theo từng khía cạnh, viết vấn đề chính và việc nên làm cho chủ quán."""

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..labels import ASPECT_VI
from ..models import Review, ReviewAspect, Store, StoreInsight, utcnow
from . import llm

WINDOW_DAYS = 30
PER_ASPECT = 20  # mỗi lần gọi chỉ một khía cạnh: 20 x 200 ký tự ~ 2k token, vừa sức model 3B
MAX_CHARS = 200

# Phạm vi từng khía cạnh: một review hay chê nhiều thứ, model nhỏ cần biết phần nào thuộc khía cạnh đang xét
ASPECT_SCOPE = {
    "food": "món ăn: vị, độ tươi, nhiệt độ, trình bày, khẩu phần",
    "drink": "đồ uống: cà phê, trà, bia, nước ép, đá",
    "service": "nhân viên, chủ quán, thái độ, tốc độ lên món, order sai, tính tiền",
    "price": "giá cả, phụ thu, khuyến mãi, có đáng tiền không",
    "ambience": "không gian: chỗ ngồi, trang trí, nhạc, ánh sáng, độ ồn, vệ sinh, nhà vệ sinh",
    "location": "vị trí: dễ hay khó tìm, đường vào, chỗ để xe",
}

SYSTEM = f"""Bạn là chuyên gia vận hành nhà hàng, giúp chủ quán ăn ở Việt Nam đọc góp ý tiêu cực của khách.
{llm.UNTRUSTED_NOTE}
Bạn chỉ xét MỘT khía cạnh được nêu. Một đánh giá có thể chê nhiều thứ: chỉ dùng phần nói về khía cạnh đó, bỏ qua phần còn lại.
- problem: 1-2 câu nêu điều khách phàn nàn lặp lại nhiều nhất về khía cạnh này, dựa đúng vào các đánh giá.
- actions: 2-3 việc cụ thể chủ quán làm được ngay trong quán để sửa đúng vấn đề đó, mỗi việc một câu ngắn.
Viết tiếng Việt, ngắn gọn, giọng thân thiện."""

SCHEMA = {
    "type": "object",
    "properties": {"problem": {"type": "string"}, "actions": {"type": "array", "items": {"type": "string"}}},
    "required": ["problem", "actions"],
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
            samples[aspect].append(content[:MAX_CHARS])
    return samples, counts, len({r.id for r in rows})


def generate(db: Session, store: Store) -> StoreInsight:
    samples, counts, n_reviews = collect_negative(db, store, datetime.now(timezone.utc))
    db.commit()  # trả kết nối DB về pool trước khi chờ AI (có thể tới cả phút)
    if not samples:
        raise NothingToAnalyze(f"Chưa có đánh giá tiêu cực nào trong {WINDOW_DAYS} ngày qua để phân tích")

    # một lần gọi cho mỗi khía cạnh: gộp chung thì model 3B bỏ sót khía cạnh và nói lẫn sang khía cạnh khác
    aspects = []
    for a, texts in samples.items():
        prompt = "\n".join([
            f"Quán: {json.dumps(store.name, ensure_ascii=False)}",
            f"Khía cạnh: {ASPECT_VI.get(a, a)} ({ASPECT_SCOPE.get(a, a)})",
            f"Đánh giá tiêu cực {WINDOW_DAYS} ngày qua có chê khía cạnh này (JSON):",
            json.dumps(texts, ensure_ascii=False),
        ])
        out = llm.generate_json(SYSTEM, prompt, SCHEMA)
        # số lượt chê lấy từ dữ liệu thật, không lấy từ AI
        aspects.append({"aspect": a, "problem": out["problem"], "actions": out["actions"], "mentions": counts[a]})
    aspects.sort(key=lambda x: x["mentions"], reverse=True)
    top = aspects[0]
    headline = f"Ưu tiên cải thiện {ASPECT_VI.get(top['aspect'], top['aspect']).lower()}: {top['problem']}"

    insight = db.get(StoreInsight, store.id) or StoreInsight(store_id=store.id)
    insight.content = {"headline": headline, "aspects": aspects,
                       "window_days": WINDOW_DAYS, "negative_reviews": n_reviews}
    insight.generated_at = utcnow()
    db.add(insight)
    db.commit()
    return insight
