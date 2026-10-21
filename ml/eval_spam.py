"""Đo bộ phát hiện spam: nhận nhầm review thật bao nhiêu, bắt được bao nhiêu spam.

Chạy: ../backend/.venv/Scripts/python -X utf8 eval_spam.py   -> reports/spam_results.md

- Review thật: 1790 review VLSP (val + test, khách thật viết trên Foody) và 150 câu ngắn ở short_test.
  Mọi review coi như cùng một tuần (trường hợp xấu nhất cho luật trùng lặp).
- Spam: các ca viết tay bên dưới, gồm cả ca khó mà bộ lọc được dự đoán sẽ bỏ sót.
- Hai luật còn lại không đo ở đây: "gửi dồn dập" là luật đếm (cùng máy >= 3 review/10 phút) nên đúng theo định nghĩa;
  "số sao ngược nội dung" cần số sao mà VLSP không có, độ đúng của nó đi theo độ đúng cảm xúc của model.
"""

import csv
import sys
from functools import lru_cache
from itertools import combinations

from data import RAW, ROOT

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services import spam  # noqa: E402
from app.services.spam import DUPLICATE_MIN_WORDS, NEAR_DUPLICATE, is_gibberish, is_near_duplicate  # noqa: E402

spam.normalize = lru_cache(maxsize=None)(spam.normalize)  # 1,9 triệu cặp: chuẩn hóa mỗi câu một lần thay vì mỗi cặp

REPORTS = ROOT / "reports"
BASE = "Quán dở tệ, phục vụ thái độ khó chịu, không bao giờ quay lại"
PROMO = "Quán ngon nhất Sài Gòn, giá rẻ bất ngờ, mọi người nhất định phải thử nhé"

# (cách biến đổi, bản gốc, bản spam): cùng một người/nhóm đăng lại, mong đợi: bắt được
DUPLICATE_SPAM = [
    ("Chép y hệt", BASE, BASE),
    ("Đổi hoa thường, dấu câu", BASE, "QUÁN DỞ TỆ!!! phục vụ thái độ khó chịu... không bao giờ quay lại"),
    ("Thêm một từ", BASE, BASE + " nữa"),
    ("Kéo dài chữ", BASE, "Quán dở tệệệ, phục vụ thái độ khó chịuuuu, không bao giờ quay lại"),
    ("Viết tắt teencode", BASE, "Quán dở tệ, pv thái độ khó chịu, ko bao giờ quay lại"),
    ("Thay một từ", BASE, "Quán dở tệ, nhân viên thái độ khó chịu, không bao giờ quay lại"),
    ("Thêm emoji", BASE, BASE + " 😡😡"),
    ("Đảo vế câu", BASE, "Phục vụ thái độ khó chịu, quán dở tệ, không bao giờ quay lại"),
    ("Bỏ dấu tiếng Việt", BASE, "Quan do te, phuc vu thai do kho chiu, khong bao gio quay lai"),
    ("Viết lại ý (paraphrase)", BASE, "Đồ ăn dở, nhân viên khó chịu, sẽ không bao giờ tới nữa"),
    ("Chép y hệt", PROMO, PROMO),
    ("Đổi hoa thường, dấu câu", PROMO, "quán ngon nhất sài gòn!! giá rẻ bất ngờ!! mọi người nhất định phải thử nhé!!!"),
    ("Thêm một từ", PROMO, "Quán ngon nhất Sài Gòn, giá rẻ bất ngờ, mọi người nhất định phải thử nhé, 10 điểm"),
    ("Kéo dài chữ", PROMO, "Quán ngon nhất Sài Gòn, giá rẻ bất ngờ, mọi người nhất định phải thử nhéee"),
    ("Viết tắt teencode", PROMO, "Quán ngon nhất SG, giá rẻ bất ngờ, mn nhất định phải thử nha"),
    ("Thay một từ", PROMO, "Quán ngon nhất Sài Gòn, giá rẻ bất ngờ, mọi người nhất định nên thử nhé"),
    ("Thêm emoji", PROMO, PROMO + " 👍👍👍"),
    ("Đảo vế câu", PROMO, "Giá rẻ bất ngờ, quán ngon nhất Sài Gòn, mọi người nhất định phải thử nhé"),
    ("Bỏ dấu tiếng Việt", PROMO, "Quan ngon nhat Sai Gon, gia re bat ngo, moi nguoi nhat dinh phai thu nhe"),
    ("Viết lại ý (paraphrase)", PROMO, "Ngon số một Sài Gòn mà rẻ cực, ai chưa ăn thì đi liền đi"),
]

# hai khách khác nhau viết theo cùng một khuôn nhưng ý khác: mong đợi KHÔNG bị coi là trùng
DUPLICATE_HARD_NEGATIVE = [
    ("Phở ngon, nước dùng đậm đà, nhân viên thân thiện, sẽ quay lại",
     "Phở ngon, nước dùng hơi nhạt, nhân viên thân thiện, sẽ quay lại"),
    ("Cà phê ngon, không gian yên tĩnh, rất thích hợp để làm việc",
     "Cà phê dở, không gian ồn ào, không thích hợp để làm việc"),
    ("Giá hơi cao so với chất lượng nhưng phục vụ nhanh và nhiệt tình",
     "Giá hợp lý so với chất lượng, phục vụ nhanh và nhiệt tình"),
    ("Món ăn ngon, giá cả hợp lý, nhân viên thân thiện, sẽ quay lại",
     "Món ăn ngon, giá cả hợp lý, không gian thoáng mát, sẽ quay lại ủng hộ"),
    ("Đồ ăn ngon nhưng phục vụ hơi chậm, phải đợi gần 30 phút",
     "Đồ ăn ngon nhưng phục vụ hơi chậm, phải đợi gần 45 phút"),
    ("Nhân viên rất nhiệt tình, quán sạch sẽ, đồ uống ngon, giá ổn",
     "Nhân viên không nhiệt tình, quán không sạch sẽ, đồ uống không ngon, giá không ổn"),
]

# spam nội dung rác: mong đợi bắt được
GIBBERISH_SPAM = ["aaaaaaa", "!!!!!!!!", ".", "...", "?????", "1111111", "😀😀😀😀", "👍👍👍👍", "hhhhhhh",
                  "kkkkkkkkk", "zzzzzz", "a", "12345", "@@@###", "0909 123 456", "$$$$", "-_-",
                  "asdfghjkl", "qwerty", "test", "abc xyz", "jdjdjdjd", "hdhdhdhd", "lorem ipsum"]
# câu ngắn có nghĩa (khách thật vẫn viết): mong đợi KHÔNG bị coi là rác
GIBBERISH_HARD_NEGATIVE = ["Ok", "Ngon", "Dở", "Ổn áp", "10/10", "5 sao", "👍 ngon", "ngonnnnnn", "Tuyệt vời!!!",
                           "Giá 35k ok", "10đ", "Good", "Ngon 👍👍", "Sẽ quay lại ❤️"]


def genuine_texts():
    texts = []
    for split in ("val", "test"):
        with open(RAW / f"{split}.csv", encoding="utf-8") as f:
            texts += [r["text"] for r in csv.DictReader(f)]
    with open(ROOT / "short_test" / "sentences.csv", encoding="utf-8") as f:
        texts += [r["text"] for r in csv.DictReader(f)]
    return texts


def pct(a, b):
    return f"{a}/{b} ({a / b * 100:.1f}%)" if b else "—"


def main():
    genuine = genuine_texts()
    gib_fp = [t for t in genuine if is_gibberish(t)]
    pairs = list(combinations(range(len(genuine)), 2))
    dup_fp = [(i, j) for i, j in pairs if is_near_duplicate(genuine[i], genuine[j])]

    dup_hits = [(name, is_near_duplicate(a, b)) for name, a, b in DUPLICATE_SPAM]
    hard_dup = [(a, b, is_near_duplicate(a, b)) for a, b in DUPLICATE_HARD_NEGATIVE]
    gib_hits = [(t, is_gibberish(t)) for t in GIBBERISH_SPAM]
    hard_gib = [(t, is_gibberish(t)) for t in GIBBERISH_HARD_NEGATIVE]

    def prf(tp, fn, fp):
        p = tp / (tp + fp) if tp + fp else 0
        r = tp / (tp + fn) if tp + fn else 0
        return p, r, (2 * p * r / (p + r) if p + r else 0)

    # precision/recall trên tập viết tay: spam + ca khó (không tính kho review thật, vì kho đó không có spam)
    d_tp = sum(h for _, h in dup_hits)
    d_p, d_r, d_f = prf(d_tp, len(dup_hits) - d_tp, sum(h for *_, h in hard_dup))
    g_tp = sum(h for _, h in gib_hits)
    g_p, g_r, g_f = prf(g_tp, len(gib_hits) - g_tp, sum(h for _, h in hard_gib))

    ok = lambda b: "bắt được" if b else "bỏ sót"
    wrong = lambda b: "nhận nhầm" if b else "đúng (không gắn)"
    lines = [
        "# Kết quả bộ phát hiện spam",
        "",
        f"Luật trùng lặp: câu từ {DUPLICATE_MIN_WORDS} từ trở lên, giống nhau >= {NEAR_DUPLICATE:.0%} "
        "(SequenceMatcher sau khi chuẩn hóa và bỏ dấu câu). Luật rác: gần như không có chữ cái.",
        "",
        "## 1. Nhận nhầm review thật",
        "",
        f"Kho review thật: {len(genuine)} review (1790 VLSP + 150 câu ngắn), so từng cặp ({len(pairs):,} cặp).",
        "",
        "| Luật | Review thật bị gắn nhầm |",
        "|---|---:|",
        f"| Nội dung vô nghĩa | {pct(len(gib_fp), len(genuine))} |",
        f"| Trùng lặp | {pct(len(dup_fp), len(pairs))} cặp |",
        "",
        *([f"- Rác nhầm: {t[:80]}" for t in gib_fp[:10]]),
        *([f"- Cặp bị gắn trùng (kiểm tra tay xem có phải trùng thật): «{genuine[i][:60]}…» ~ «{genuine[j][:60]}…»"
           for i, j in dup_fp[:10]]),
        "",
        "## 2. Tập viết tay (spam và ca khó)",
        "",
        "| Luật | Precision | Recall | F1 |",
        "|---|---:|---:|---:|",
        f"| Trùng lặp ({len(dup_hits)} cặp spam, {len(hard_dup)} cặp khó) | {d_p:.2f} | {d_r:.2f} | {d_f:.2f} |",
        f"| Nội dung vô nghĩa ({len(gib_hits)} rác, {len(hard_gib)} câu ngắn thật) | {g_p:.2f} | {g_r:.2f} | {g_f:.2f} |",
        "",
        "### Trùng lặp: spam đăng lại có biến đổi",
        "",
        "| Cách biến đổi | Mẫu gốc | Kết quả |",
        "|---|---|---|",
        *[f"| {name} | {'chê' if a == BASE else 'quảng cáo'} | {ok(h)} |"
          for (name, a, _), (_, h) in zip(DUPLICATE_SPAM, dup_hits)],
        "",
        "### Trùng lặp: hai khách khác nhau, cùng khuôn câu, khác ý",
        "",
        "| Câu 1 | Câu 2 | Kết quả |",
        "|---|---|---|",
        *[f"| {a} | {b} | {wrong(h)} |" for a, b, h in hard_dup],
        "",
        "### Nội dung vô nghĩa",
        "",
        "Bỏ sót: " + (", ".join(f"`{t}`" for t, h in gib_hits if not h) or "không"),
        "",
        "Câu thật bị nhận nhầm: " + (", ".join(f"`{t}`" for t, h in hard_gib if h) or "không"),
        "",
    ]
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "spam_results.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
