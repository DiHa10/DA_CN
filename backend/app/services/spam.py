"""Phát hiện review nghi spam / giả. Chỉ gắn lý do; chủ quán quyết định ẩn hay không (chặn nhầm review thật tệ hơn để lọt spam).

Các hàm kiểm tra là hàm thuần (không cần DB) để test và đo độ chính xác riêng; flag_reviews lo phần lấy dữ liệu xung quanh.
"""

import hashlib
import hmac
import re
from datetime import timedelta
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Review
from ..security import SECRET_KEY
from ..timeutil import as_utc
from .nlp import normalize

DUPLICATE_DAYS = 7
DUPLICATE_MIN_WORDS = 8
NEAR_DUPLICATE = 0.9  # độ giống tối thiểu để coi là gần trùng
BURST_COUNT, BURST_MINUTES = 3, 10  # cùng một máy gửi từ 3 review trong 10 phút
MISMATCH_CONFIDENCE = 0.8

REASONS = ("duplicate", "burst", "gibberish", "rating_mismatch")


def client_hash(ip: str) -> str:
    """Băm IP kèm khóa bí mật: đủ để nhận ra cùng một máy, không lưu và không dò ngược được IP."""
    return hmac.new(SECRET_KEY.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def is_gibberish(text: str) -> bool:
    # gộp ký tự lặp trước: "ngonnnnn" -> "ngon" là khách nhấn mạnh, còn "aaaaaa" -> "a" mới là vô nghĩa
    collapsed = re.sub(r"(.)\1+", r"\1", text)
    chars = [c for c in collapsed if not c.isspace()]
    letters = sum(c.isalpha() for c in chars)
    return letters < 2 or letters / len(chars) < 0.5  # chỉ dấu câu/số/emoji, hoặc phần lớn không phải chữ


def is_near_duplicate(a: str, b: str) -> bool:
    # bỏ dấu câu: "Phở ngon!!" và "phở ngon" là cùng một câu
    wa, wb = (re.findall(r"\w+", normalize(x)) for x in (a, b))
    # câu ngắn ("Giá hợp lý", "Dễ tìm") nhiều khách thật viết y hệt nhau, không tính trùng
    if min(len(wa), len(wb)) < DUPLICATE_MIN_WORDS:
        return False
    a, b = " ".join(wa), " ".join(wb)
    if a == b:
        return True
    m = SequenceMatcher(None, a, b)
    return m.quick_ratio() >= NEAR_DUPLICATE and m.ratio() >= NEAR_DUPLICATE


def is_rating_mismatch(rating: int | None, sentiment: str | None, confidence: float | None) -> bool:
    if rating is None or sentiment is None or (confidence or 0) < MISMATCH_CONFIDENCE:
        return False
    return (rating == 5 and sentiment == "negative") or (rating == 1 and sentiment == "positive")


def _add(review: Review, reason: str) -> None:
    if reason not in (review.spam_reasons or []):
        review.spam_reasons = [*(review.spam_reasons or []), reason]  # gán list mới để SQLAlchemy thấy cột JSON đổi


def flag_reviews(db: Session, reviews: list[Review]) -> None:
    """Gắn spam_reasons cho các review vừa phân tích (đã có analysis). Không commit; không đụng tới hidden.

    Trùng lặp và gửi dồn dập đánh dấu cả nhóm: review đến trước cũng là một phần của đợt spam, dù lúc nó được
    phân tích chưa đủ dấu hiệu."""
    for r in reviews:
        r.spam_reasons = None  # phân tích lại thì tính lại từ đầu
    for r in reviews:
        created = as_utc(r.created_at)
        if is_gibberish(r.content):
            _add(r, "gibberish")
        # shortcut: so với mọi review của quán trong ±7 ngày, ổn tới vài trăm review/tuần; quán lớn hơn thì băm nội dung trước
        neighbours = db.scalars(select(Review).where(
            Review.store_id == r.store_id, Review.id != r.id,
            Review.created_at >= created - timedelta(days=DUPLICATE_DAYS),
            Review.created_at <= created + timedelta(days=DUPLICATE_DAYS))).all()
        copies = [o for o in neighbours if is_near_duplicate(r.content, o.content)]
        for x in [r, *copies] if copies else []:
            _add(x, "duplicate")
        if r.client_hash:
            window = db.scalars(select(Review).where(
                Review.store_id == r.store_id, Review.client_hash == r.client_hash,
                Review.created_at >= created - timedelta(minutes=BURST_MINUTES),
                Review.created_at <= created + timedelta(minutes=BURST_MINUTES))).all()
            if len(window) >= BURST_COUNT:
                for x in window:
                    _add(x, "burst")
        a = r.analysis
        if is_rating_mismatch(r.rating, a.sentiment if a else None, a.confidence if a else None):
            _add(r, "rating_mismatch")
