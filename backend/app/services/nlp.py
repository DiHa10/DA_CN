"""Phân tích cảm xúc + khía cạnh (ABSA) cho review tiếng Việt.

Hai nhánh, cùng chữ ký analyze_batch:
- PhoBERT (absa_model.py) khi biến NLP_MODEL_DIR trỏ tới checkpoint do ml/train_absa.py tạo;
- từ điển cảm xúc theo luật bên dưới: dự phòng khi chưa có model, và là mốc so sánh trong ml/evaluate.py.
"""

import os
import threading
import unicodedata
from collections import Counter
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

# Bộ lọc chủ đề cho PhoBERT. Model chỉ học review nhà hàng (VLSP 2018) nên coi câu nào cũng đang nói về quán:
# "Điện thoại này pin yếu quá" thành Món ăn: tiêu cực. Khía cạnh model đoán mà câu không có từ nào thuộc khía cạnh đó
# thì bỏ. Danh sách rộng hơn ASPECTS (từ điển cũ) vì chỉ cần dấu hiệu "đang nói về chuyện này", không cần chắc chắn.
# Đo ảnh hưởng: ml/eval_topic.py -> ml/reports/topic_results.md.
# shortcut: câu ngoài lề có từ trùng (ví dụ "giá điện thoại đắt") vẫn lọt; cần chặt hơn thì thêm bộ phân loại chủ đề.
CUES = {
    "food": ASPECTS["food"] + [
        "ăn", "đồ ăn", "món", "vị", "ngon", "dở", "mặn", "nhạt", "ngọt", "cay", "chua", "đắng", "béo", "ngấy", "giòn", "dai",
        "mềm", "thơm", "tươi", "ôi", "thiu", "tanh", "nguội", "nóng hổi", "đậm", "khẩu phần", "phần ăn", "suất", "topping",
        "sốt", "nước lèo", "nước chấm", "thịt", "cá", "gà", "bò", "heo", "vịt", "tôm", "cua", "mực", "ốc", "hải sản", "rau",
        "trứng", "bánh", "cháo", "miến", "hủ tiếu", "bánh mì", "xôi", "chè", "kem", "nướng", "chiên", "xào", "hấp", "luộc",
        "pizza", "burger", "sushi", "dimsum", "buffet", "menu", "thực đơn", "đầu bếp", "no", "đói", "nêm nếm",
        "vừa miệng", "lạ miệng", "nấu", "chế biến", "ướp", "nhân", "ghiền", "thèm",
    ],
    "drink": ASPECTS["drink"] + [
        "nước", "uống", "cf", "coffee", "trà", "sữa", "bia", "rượu", "soda", "matcha", "latte", "cacao", "đá", "ly", "cốc",
        "chai", "trân châu", "pha", "bạc xỉu", "nâu", "espresso", "smoothie",
    ],
    "service": ASPECTS["service"] + [
        "nhân viên", "nv", "bạn nhân viên", "chủ", "quản lý", "thu ngân", "bảo vệ", "order", "gọi món", "mang ra", "lâu",
        "nhanh", "thái độ", "nhiệt tình", "thân thiện", "niềm nở", "lễ phép", "chu đáo", "tư vấn", "tính tiền", "thanh toán",
        "ship", "shipper", "giao hàng", "giao", "đặt bàn", "dọn", "khách", "phục vụ", "bưng", "hỗ trợ", "xin lỗi",
        "bán hàng", "người bán", "cô bán", "lịch sự", "giữ xe", "dịch vụ", "nvien", "staff",
    ],
    "price": ASPECTS["price"] + [
        "giá", "tiền", "đắt", "rẻ", "mắc", "bill", "hóa đơn", "nghìn", "ngàn", "đồng", "vnđ", "đáng", "khuyến mãi", "giảm giá",
        "voucher", "phụ thu", "combo", "chát", "chặt chém", "túi tiền", "bình dân", "sinh viên", "free", "miễn phí",
    ],
    "ambience": ASPECTS["ambience"] + [
        "không gian", "sạch", "dơ", "yên tĩnh", "ồn ào", "ngồi", "bàn", "ghế", "điều hòa", "quạt", "nóng", "mát", "trang trí",
        "ánh sáng", "đèn", "thoáng", "chật", "rộng", "chill", "sống ảo", "chụp ảnh", "wc", "nhà vệ sinh", "toilet", "mùi",
        "khói", "thuốc lá", "muỗi", "ruồi", "gián", "đông", "vắng", "ấm cúng", "phòng", "tầng", "sân", "ban công", "wifi",
        "đẹp", "xinh", "nhỏ", "lụp xụp", "phong cách", "nhã nhặn", "ế", "trẻ em", "chỗ chơi", "vỉa hè", "tinh tế",
        "không khí", "học tập", "học bài", "làm việc", "tập trung", "deadline", "thoải mái", "riêng tư", "ngủ",
    ],
    "location": ASPECTS["location"] + [
        "vị trí", "địa chỉ", "để xe", "đỗ xe", "bãi xe", "xe", "hẻm", "ngõ", "đường", "mặt tiền", "gần", "xa", "trung tâm",
        "chợ", "góc", "ngã tư", "map", "bản đồ", "tìm", "chỗ đậu", "quận", "phường", "nằm", "cầu", "ngã", "đ/c", "khu",
        "đi ngang", "khuất", "gần nhà",
    ],
}
# từ cho biết câu nói về quán dù không nhắc khía cạnh nào ("quán này được", "lần sau quay lại")
GENERAL = ["quán", "nhà hàng", "tiệm", "chỗ này", "quay lại", "ghé", "lần sau", "trải nghiệm", "review"]
_CUE_RE = {a: _pattern(set(kw)) for a, kw in CUES.items()}
_GENERAL_RE = _pattern(GENERAL)


_MONEY_RE = re.compile(r"\d+\s*(?:k|đ|vnd|vnđ|nghìn|ngàn|tr|triệu)(?!\w)")  # "25k", "279 k", "40 nghìn"


def on_topic_aspects(text: str, aspects: dict) -> dict:
    """Chỉ giữ khía cạnh mà câu có ít nhất một từ thuộc khía cạnh đó (giá: cả số tiền như "25k")."""
    norm = normalize(text)
    return {a: v for a, v in aspects.items() if _CUE_RE[a].search(norm) or (a == "price" and _MONEY_RE.search(norm))}


def about_store(text: str) -> bool:
    """Câu có nói về quán không: có từ chung ("quán", "quay lại") hoặc từ của bộ từ điển hẹp ASPECTS.
    Không dùng CUES: các từ rộng như "đẹp", "nhanh" làm "Hôm nay trời đẹp quá" thành chuyện của quán.
    Kết quả phân tích còn khía cạnh sau lọc thì cũng là nói về quán (xem routers/public.py)."""
    norm = normalize(text)
    return bool(_GENERAL_RE.search(norm)) or any(r.search(norm) for r in _ASPECT_RE.values())


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).lower()  # dấu tổ hợp (NFD, hay gặp khi chép từ web) phải khớp từ điển
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


# từ không mang nghĩa ở đầu/cuối cụm: cụm "rất chậm" -> đã có "chậm"; "quán thì" -> bỏ
STOPWORDS = set("""và thì là mà của cho có được rất quá hơi lắm nhưng với này kia đó một những các mình bạn em anh chị
ạ nha nhé á ơi cũng đã đang sẽ vẫn còn nên vì để khi lúc như ở trong ra vào lên xuống nữa luôn thật_sự hết chỉ quán
mọi_người lần đi đến nói thấy làm bị trải_nghiệm đầu_tiên hôm_nay cảm_thấy""".split())


def complaint_phrases(texts: list[str], top: int = 8) -> list[dict]:
    """Cụm từ khách hay nhắc trong các vế câu chê, như "thái độ", "mùi thuốc lá", "chỗ để xe".
    Tách từ tiếng Việt trước ("thuốc_lá" là một từ) rồi đếm cụm 1–3 từ theo số review (mỗi review tính một lần).
    Cụm 1 từ chỉ lấy từ ghép (từ đơn như "quán", "món" quá chung). Bỏ cụm con nằm trong cụm dài hơn cùng số lần."""
    from underthesea import word_tokenize  # nặng, chỉ nạp khi cần

    counts: Counter = Counter()
    for text in texts:
        grams = set()
        for clause in _CLAUSE_SPLIT.split(normalize(text)):
            # vế câu từ điển thấy khen thì bỏ: "phở ngon" trong review chê phục vụ không phải lời chê
            if not clause.strip() or _clause_score(clause) > 0:
                continue
            words = [w.lower() for w in word_tokenize(clause) if re.match(r"\w", w)]
            words = [w.replace(" ", "_") for w in words]
            for n in (1, 2, 3):
                for i in range(len(words) - n + 1):
                    g = words[i:i + n]
                    if g[0] in STOPWORDS or g[-1] in STOPWORDS or (n == 1 and "_" not in g[0]):
                        continue
                    grams.add(" ".join(g).replace("_", " "))
        counts.update(grams)
    ranked = [(p, n) for p, n in counts.most_common() if n >= 2]
    kept = [(p, n) for p, n in ranked if not any(p != q and f" {p} " in f" {q} " and n == m for q, m in ranked)]
    return [{"phrase": p, "count": n} for p, n in kept[:top]]


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
_load_lock = threading.Lock()  # luồng khởi động và request đầu tiên cùng gọi: không được nạp PhoBERT (~500 MB) hai lần


def load_model():
    """Nạp PhoBERT một lần (gọi lúc khởi động). Trả None nếu không cấu hình hoặc ép dùng từ điển."""
    global _predictor
    model_dir = os.getenv("NLP_MODEL_DIR")
    if os.getenv("NLP_BACKEND") == "lexicon" or not model_dir or not (Path(model_dir) / "head.pt").exists():
        return None
    with _load_lock:
        if _predictor is None:
            from .absa_model import AbsaPredictor  # torch nặng, chỉ import khi thật sự dùng

            _predictor = AbsaPredictor(model_dir)
    return _predictor


def warm_up() -> None:
    """Nạp sẵn bộ tách từ (~3 giây) lúc khởi động, để lần mở Tổng quan đầu tiên không phải chờ."""
    from underthesea import word_tokenize

    word_tokenize("khởi động")


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
        aspects = on_topic_aspects(text, aspects)
        # VLSP không có nhãn tổng thể: suy ra từ khía cạnh; tổng bằng 0, ví dụ "Không còn gì để nói, luôn là
        # điểm dừng chân lí tưởng" (không nhắc khía cạnh nào), thì xét số sao
        probs = [p for _, p in aspects.values()]
        results.append({
            "sentiment": overall({a: label for a, (label, _) in aspects.items()}, rating, text),
            "confidence": round(sum(probs) / len(probs), 3) if probs else 0.5,
            "aspects": {a: label for a, (label, _) in aspects.items()},
        })
    return results
