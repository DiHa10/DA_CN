"""Đo bộ lọc chủ đề (backend/app/services/nlp.py: CUES, on_topic_aspects, about_store).

Ba câu hỏi:
1. Trên tập test VLSP có nhãn: lọc có làm giảm độ chính xác không (F1 trước / sau)?
2. Trên câu thật về quán (short_test, real_test, chưa có nhãn): bao nhiêu câu bị lọc mất khía cạnh model đã thấy?
3. Trên câu ngoài lề (viết tay bên dưới): còn bao nhiêu câu bị gán khía cạnh, bao nhiêu câu được nhận ra "không nói về quán"?

Chạy (trong ml/): ../backend/.venv/Scripts/python -X utf8 eval_topic.py  -> reports/topic_results.md
Nội dung review thật (real_test) chỉ được đếm, không chép vào báo cáo.
"""

import csv
import sys

from data import ROOT, load
from evaluate import PHOBERT_DIR, scores

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.absa_model import ASPECTS, AbsaPredictor  # noqa: E402
from app.services.nlp import about_store, on_topic_aspects  # noqa: E402

OFF_TOPIC = [
    "Hôm nay trời đẹp quá", "Điện thoại này pin yếu quá", "Bài giảng hôm nay rất hay", "Xe máy chạy êm, tiết kiệm xăng",
    "Đội tuyển Việt Nam thắng Thái Lan 3-0", "Thầy ơi cho em 10 điểm", "Tôi ghét thứ Hai", "Phim này hay tuyệt vời",
    "Laptop chạy chậm quá", "Cô giáo rất dễ thương", "Bộ áo này đẹp nhưng vải mỏng", "Mạng hôm nay lag kinh khủng",
    "Con mèo nhà tôi rất ngoan", "Kỳ thi khó quá", "Bài hát này nghe hoài không chán", "Sếp tôi khó tính lắm",
    "Game này đồ họa đẹp", "Tôi thích đọc sách vào buổi tối", "Chuyến bay bị hoãn hai tiếng", "Ứng dụng này hay bị lỗi",
    "Hôm qua mưa to quá", "Đồ án này làm mệt thật", "Tai nghe âm thanh trong, bass mạnh", "Khóa học online này bổ ích",
    "Bác sĩ khám rất kỹ", "Giày chạy bộ nhẹ và êm chân", "Trận đấu tối qua rất kịch tính", "Máy giặt kêu to quá",
    "Em bé ngủ ngoan cả đêm", "Cuốn tiểu thuyết kết thúc buồn",
]


def read_csv(name):
    path = ROOT / name / "sentences.csv"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [r["text"] for r in csv.DictReader(f)]


def main():
    model = AbsaPredictor(PHOBERT_DIR)
    lines = ["# Bộ lọc chủ đề cho PhoBERT", "",
             "Khía cạnh model đoán mà câu không có từ nào thuộc khía cạnh đó thì bỏ (backend/app/services/nlp.py, `CUES`).", ""]

    # 1. VLSP test
    rows = load("test")
    raw = model.predict([r["seg"] for r in rows], segmented=True)
    before = [{a: o.get(a, ("none", 0))[0] for a in ASPECTS} for o in raw]
    after = [{a: f.get(a, ("none", 0))[0] for a in ASPECTS} for f in (on_topic_aspects(r["text"], o) for r, o in zip(rows, raw))]
    sb, sa = scores(rows, before), scores(rows, after)
    lines += [f"## 1. Tập test VLSP 2018 ({len(rows)} review có nhãn)", "",
              "| Chỉ số | Không lọc | Có lọc |", "|---|---:|---:|",
              f"| F1-macro trung bình 6 khía cạnh | {sb['macro_f1']:.4f} | {sa['macro_f1']:.4f} |",
              f"| F1 phát hiện khía cạnh | {sb['detect_f1']:.4f} | {sa['detect_f1']:.4f} |",
              f"| Độ chính xác cảm xúc | {sb['polarity_acc']:.4f} | {sa['polarity_acc']:.4f} |", ""]
    dropped = sum(len(b) - len(on_topic_aspects(r["text"], b)) for r, b in zip(rows, raw))
    lines += [f"Số khía cạnh bị lọc bỏ: {dropped} / {sum(len(b) for b in raw)}.", ""]

    # 2. câu thật về quán, chưa có nhãn
    lines += ["## 2. Câu về quán chưa có nhãn", "", "| Tập | Số câu | Câu bị lọc mất ít nhất 1 khía cạnh | Câu bị coi là không nói về quán |", "|---|---:|---:|---:|"]
    examples = []
    for name in ("short_test", "real_test"):
        texts = read_csv(name)
        if not texts:
            continue
        preds = model.predict(texts)
        lost = [(t, sorted(set(p) - set(on_topic_aspects(t, p)))) for t, p in zip(texts, preds) if set(p) - set(on_topic_aspects(t, p))]
        off = sum(not (on_topic_aspects(t, p) or about_store(t)) for t, p in zip(texts, preds))
        lines.append(f"| {name} | {len(texts)} | {len(lost)} | {off} |")
        if name == "short_test":  # câu tự viết: chép ví dụ được; real_test là lời khách thật, chỉ đếm
            examples = lost
    if examples:
        lines += ["", "Ví dụ câu short_test bị lọc (để bổ sung từ vào `CUES` nếu là lọc nhầm):", ""]
        lines += [f"- {t} → bỏ {', '.join(a)}" for t, a in examples[:15]]

    # 3. câu ngoài lề
    preds = model.predict(OFF_TOPIC)
    had = sum(bool(p) for p in preds)
    has = sum(bool(on_topic_aspects(t, p)) for t, p in zip(OFF_TOPIC, preds))
    off = sum(not (on_topic_aspects(t, p) or about_store(t)) for t, p in zip(OFF_TOPIC, preds))
    lines += ["", f"## 3. Câu ngoài lề ({len(OFF_TOPIC)} câu viết tay)", "",
              "| | Không lọc | Có lọc |", "|---|---:|---:|",
              f"| Câu bị gán ít nhất 1 khía cạnh (sai) | {had} | {has} |", "",
              f"Câu được nhận ra \"không nói về quán\": {off} / {len(OFF_TOPIC)}.", ""]
    still = [(t, on_topic_aspects(t, p)) for t, p in zip(OFF_TOPIC, preds) if on_topic_aspects(t, p)]
    if still:
        lines += ["Còn lọt (câu có từ trùng với từ của quán):", ""] + [f"- {t} → {', '.join(a)}" for t, a in still]

    out = ROOT / "reports" / "topic_results.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
