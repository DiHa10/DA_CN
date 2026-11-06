"""Phân tích cảm xúc + khía cạnh (ABSA) cho review tiếng Việt.

Hai nhánh, cùng chữ ký analyze_batch:
- PhoBERT (absa_model.py) khi biến NLP_MODEL_DIR trỏ tới checkpoint do ml/train_absa.py tạo;
- từ điển cảm xúc theo luật bên dưới: dự phòng khi chưa có model, và là mốc so sánh trong ml/evaluate.py.
"""

import os
import re
from pathlib import Path

TEENCODE = {
    "ko": "không", "k": "không", "kh": "không", "hok": "không", "khong": "không",
    "dc": "được", "đc": "được", "ok": "ổn", "oke": "ổn", "nv": "nhân viên",
    "j": "gì", "vs": "với", "bt": "bình thường", "mn": "mọi người",
}

ASPECTS = {
    "food": ["món", "món ăn", "đồ ăn", "thức ăn", "phở", "cơm", "bún", "mì", "lẩu", "thịt",
             "nước dùng", "hương vị", "ngon", "dở", "nêm"],
    "drink": ["nước uống", "đồ uống", "cà phê", "cafe", "trà", "trà sữa", "sinh tố", "bia", "nước ép"],
    "service": ["phục vụ", "nhân viên", "thái độ", "chủ quán", "lên món", "chờ", "đợi"],
    "price": ["giá", "giá cả", "tiền", "đắt", "rẻ", "mắc", "bill"],
    "ambience": ["không gian", "view", "nhạc", "sạch sẽ", "bẩn", "vệ sinh", "ồn", "chỗ ngồi", "máy lạnh", "decor"],
    "location": ["vị trí", "chỗ để xe", "gửi xe", "dễ tìm", "khó tìm", "hẻm"],
}

POSITIVE = ["ngon", "tuyệt", "tuyệt vời", "tốt", "đẹp", "sạch", "sạch sẽ", "nhanh", "rẻ", "hợp lý",
            "thân thiện", "nhiệt tình", "chu đáo", "ổn", "thích", "hài lòng", "tươi", "dễ tìm",
            "ưng", "xuất sắc", "chất lượng", "đáng tiền", "vui vẻ", "dễ thương"]
NEGATIVE = ["dở", "tệ", "chán", "chậm", "bẩn", "dơ", "đắt", "mắc", "ồn", "nguội", "mặn", "nhạt",
            "khó chịu", "thất vọng", "lâu", "khó tìm", "hôi", "kém", "cáu", "giá cao", "hơi cao",
            "lạnh nhạt", "thô lỗ", "không đáng", "tanh", "ôi thiu"]
NEGATIONS = {"không", "chẳng", "chưa", "chả", "đâu"}
# từ đệm có thể đứng giữa phủ định và từ cảm xúc: "không được ngon", "không quá đắt"
FILLERS = {"được", "quá", "lắm", "hề", "có", "hơi", "rất", "thật", "sự", "mấy"}

_CLAUSE_SPLIT = re.compile(r"[.,!?;\n]+|\bnhưng\b|\btuy nhiên\b|\bcó điều\b")


def _pattern(words):
    # cụm dài khớp trước để "sạch sẽ" không bị tính hai lần
    alts = "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True))
    return re.compile(rf"(?<!\w)(?:{alts})(?!\w)")


_POS_RE, _NEG_RE = _pattern(POSITIVE), _pattern(NEGATIVE)
_ASPECT_RE = {a: _pattern(kw) for a, kw in ASPECTS.items()}


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"(\w)\1{2,}", r"\1", text)  # "ngonnnn" -> "ngon"
    return " ".join(TEENCODE.get(w, w) for w in re.findall(r"\w+|[^\w\s]", text))


def _negated(clause: str, start: int) -> bool:
    words = clause[:start].split()
    for w in reversed(words[-3:]):
        if w in NEGATIONS:
            return True
        if w not in FILLERS:
            return False
    return False


def _clause_score(clause: str) -> int:
    score = 0
    for regex, sign in ((_POS_RE, 1), (_NEG_RE, -1)):
        for m in regex.finditer(clause):
            score += -sign if _negated(clause, m.start()) else sign
    return score


def _label(score: int) -> str:
    return "positive" if score > 0 else "negative" if score < 0 else "neutral"


def analyze(text: str) -> dict:
    total, aspect_scores = 0, {}
    for clause in _CLAUSE_SPLIT.split(normalize(text)):
        if not clause.strip():
            continue
        score = _clause_score(clause)
        total += score
        for aspect, regex in _ASPECT_RE.items():
            if regex.search(clause):
                aspect_scores[aspect] = aspect_scores.get(aspect, 0) + score
    return {
        "sentiment": _label(total),
        "confidence": min(0.5 + 0.1 * abs(total), 0.95),
        "aspects": {a: _label(s) for a, s in aspect_scores.items()},
    }


_predictor = None


def load_model():
    """Nạp PhoBERT một lần (gọi lúc khởi động). Trả None nếu không cấu hình hoặc ép dùng từ điển."""
    global _predictor
    model_dir = os.getenv("NLP_MODEL_DIR")
    if os.getenv("NLP_BACKEND") == "lexicon" or not model_dir or not (Path(model_dir) / "head.pt").exists():
        return None
    if _predictor is None:
        from .absa_model import AbsaPredictor  # torch nặng, chỉ import khi thật sự dùng

        _predictor = AbsaPredictor(model_dir)
    return _predictor


def _from_rating(rating: int | None, fallback: str) -> str:
    """Nội dung không nghiêng về bên nào (khen chung chung, không nhắc khía cạnh nào): dựa vào số sao khách chấm."""
    if not rating:
        return fallback
    return "positive" if rating >= 4 else "negative" if rating <= 2 else "neutral"


def overall(aspects: dict[str, str], rating: int | None, text: str) -> str:
    """Cảm xúc cả review từ nhãn khía cạnh: khen cộng chê trừ; hòa (hoặc không nhắc khía cạnh nào) thì xét số sao, rồi tới từ điển."""
    score = sum(1 if s == "positive" else -1 if s == "negative" else 0 for s in aspects.values())
    return _label(score) if score else _from_rating(rating, analyze(text)["sentiment"])


def analyze_batch(texts: list[str], ratings: list[int | None] | None = None) -> list[dict]:
    ratings = ratings or [None] * len(texts)
    predictor = load_model()
    if predictor is None:
        results = [analyze(t) for t in texts]
        for r, rating in zip(results, ratings):
            if r["sentiment"] == "neutral":
                r["sentiment"] = _from_rating(rating, "neutral")
        return results
    results = []
    for text, rating, aspects in zip(texts, ratings, predictor.predict(texts)):
        # VLSP không có nhãn tổng thể: suy ra từ khía cạnh; tổng bằng 0, ví dụ "Không còn gì để nói, luôn là
        # điểm dừng chân lí tưởng" (không nhắc khía cạnh nào), thì xét số sao
        probs = [p for _, p in aspects.values()]
        results.append({
            "sentiment": overall({a: label for a, (label, _) in aspects.items()}, rating, text),
            "confidence": round(sum(probs) / len(probs), 3) if probs else 0.5,
            "aspects": {a: label for a, (label, _) in aspects.items()},
        })
    return results
