"""Gợi ý câu trả lời cho một review; chủ quán đọc, sửa rồi mới lưu."""

import json

from ..labels import ASPECT_VI, SENTIMENT_VI
from ..models import Review, Store
from . import llm

SYSTEM = f"""Bạn viết nháp câu trả lời của chủ quán ăn gửi tới một khách vừa đánh giá quán.
{llm.UNTRUSTED_NOTE}
Quy tắc:
- Xưng "quán", gọi khách là "anh/chị" (hoặc tên khách nếu có). Tiếng Việt, lịch sự, chân thành, 2-4 câu.
- Cảm ơn khách. Khách khen điều gì thì nhắc đúng điều đó.
- Khách chê thì xin lỗi đúng điều bị chê và nói quán sẽ cải thiện; không đổ lỗi cho khách, không bao biện.
- Không hứa đền bù, giảm giá, quà tặng hay mời ăn miễn phí; chủ quán tự quyết định những việc đó.
- Không bịa thông tin về quán không có trong dữ liệu."""

SCHEMA = {
    "type": "object",
    "properties": {"reply": {"type": "string"}},
    "required": ["reply"],
    "additionalProperties": False,
}


def draft(store: Store, review: Review) -> str:
    data = {
        "quan": store.name,
        "ten_khach": review.author,
        "so_sao": review.rating,
        "noi_dung": review.content,
        "khia_canh": {ASPECT_VI.get(a.aspect, a.aspect): SENTIMENT_VI[a.sentiment] for a in review.aspects},
    }
    out = llm.generate_json(SYSTEM, f"Đánh giá của khách (JSON):\n{json.dumps(data, ensure_ascii=False)}",
                            SCHEMA)
    return out["reply"].strip()
