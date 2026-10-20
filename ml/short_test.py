"""Tập test review ngắn (kiểu khách gửi qua QR), do nhóm tự gán nhãn.

  python ml/short_test.py init Khang An Binh   -> tạo ml/short_test/labels_<tên>.csv cho từng người
  python ml/short_test.py eval                 -> độ đồng thuận + điểm 3 cách -> ml/reports/short_results.md

Mỗi người gán nhãn độc lập (không xem file của nhau). Mã nhãn: k = khen, c = chê, t = trung lập, để trống = không nhắc.
"""

import csv
import sys
from collections import Counter
from itertools import combinations

from sklearn.metrics import cohen_kappa_score

from data import ROOT
from evaluate import ASPECT_VI, BASELINE, PHOBERT_DIR, REPORTS, predict_baseline, predict_lexicon, predict_phobert, scores

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.absa_model import ASPECTS, segment  # noqa: E402

DIR = ROOT / "short_test"
COLUMNS = {"food": "mon_an", "drink": "do_uong", "service": "phuc_vu", "price": "gia_ca",
           "ambience": "khong_gian", "location": "vi_tri"}
CODES = {"k": "positive", "c": "negative", "t": "neutral", "": "none"}


def load_sentences():
    with open(DIR / "sentences.csv", encoding="utf-8") as f:
        return {r["id"]: r["text"] for r in csv.DictReader(f)}


def init(names):
    sentences = load_sentences()
    for name in names:
        path = DIR / f"labels_{name}.csv"
        if path.exists():
            print(f"Bỏ qua {path.name}: đã có, không ghi đè nhãn đã gán")
            continue
        with open(path, "w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig: Excel hiện đúng tiếng Việt
            w = csv.writer(f)
            w.writerow(["id", "text", *COLUMNS.values()])
            for i, text in sentences.items():
                w.writerow([i, text, *[""] * len(COLUMNS)])
        print(f"Tạo {path}")


def read_labels(path, ids):
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            labels = {}
            for a, col in COLUMNS.items():
                code = (r.get(col) or "").strip().lower()
                if code not in CODES:
                    raise SystemExit(f"{path.name}, câu {r['id']}, cột {col}: mã '{code}' không hợp lệ (k / c / t / trống)")
                labels[a] = CODES[code]
            out[r["id"]] = labels
    if missing := ids - out.keys():
        raise SystemExit(f"{path.name} thiếu câu: {sorted(missing, key=int)[:10]}")
    return out


def evaluate():
    sentences = load_sentences()
    files = sorted(DIR.glob("labels_*.csv"))
    if len(files) < 2:
        raise SystemExit("Cần ít nhất 2 file labels_*.csv để tính độ đồng thuận")
    names = [p.stem.removeprefix("labels_") for p in files]
    annot = {n: read_labels(p, sentences.keys()) for n, p in zip(names, files)}
    ids = sorted(sentences, key=int)

    # độ đồng thuận: Cohen's kappa từng cặp người, trung bình theo cặp, cho từng khía cạnh
    kappa = {}
    for a in ASPECTS:
        pairs = [cohen_kappa_score([annot[x][i][a] for i in ids], [annot[y][i][a] for i in ids])
                 for x, y in combinations(names, 2)]
        kappa[a] = sum(pairs) / len(pairs)

    # nhãn chuẩn = đa số; câu có khía cạnh không ai chiếm đa số thì loại cả câu
    gold, dropped = [], []
    for i in ids:
        labels = {}
        for a in ASPECTS:
            (label, n), = Counter(annot[x][i][a] for x in names).most_common(1)
            if n * 2 <= len(names):
                break
            labels[a] = label
        else:
            gold.append({"text": sentences[i], "seg": segment(sentences[i]), "labels": labels})
            continue
        dropped.append(i)

    methods = {"Từ điển (bộ cũ)": predict_lexicon}
    if BASELINE.exists():
        methods["TF-IDF + Logistic Regression"] = predict_baseline
    if (PHOBERT_DIR / "head.pt").exists():
        methods["PhoBERT"] = predict_phobert
    results = {name: scores(gold, fn(gold)) for name, fn in methods.items()}

    cols = list(results)
    lines = [
        f"# Kết quả trên tập review ngắn ({len(gold)}/{len(ids)} câu, {len(names)} người gán nhãn)", "",
        f"Người gán nhãn: {', '.join(names)}. Nhãn chuẩn lấy theo đa số; loại {len(dropped)} câu không có đa số"
        + (f" (id: {', '.join(dropped)})" if dropped else "") + ".", "",
        "## Độ đồng thuận giữa người gán nhãn (Cohen's kappa trung bình từng cặp)", "",
        "| Khía cạnh | Kappa |", "|---|---:|",
        *[f"| {ASPECT_VI[a]} | {kappa[a]:.3f} |" for a in ASPECTS],
        f"| **Trung bình** | **{sum(kappa.values()) / len(kappa):.3f}** |", "",
        "## Điểm mô hình", "",
        "| Chỉ số | " + " | ".join(cols) + " |", "|---|" + "---:|" * len(cols),
        "| **F1-macro trung bình 6 khía cạnh** | " + " | ".join(f"**{results[c]['macro_f1']:.4f}**" for c in cols) + " |",
        "| F1 phát hiện khía cạnh | " + " | ".join(f"{results[c]['detect_f1']:.4f}" for c in cols) + " |",
        "| Độ chính xác cảm xúc (khía cạnh phát hiện đúng) | " + " | ".join(f"{results[c]['polarity_acc']:.4f}" for c in cols) + " |",
        *[f"| F1-macro {ASPECT_VI[a]} | " + " | ".join(f"{results[c]['per_aspect'][a]:.4f}" for c in cols) + " |" for a in ASPECTS],
        "", "Kappa trên 0,6 thường được xem là đồng thuận tốt; dưới 0,4 thì hướng dẫn gán nhãn cần rõ hơn.",
    ]
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "short_results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "init" and len(sys.argv) > 2:
        init(sys.argv[2:])
    elif cmd == "eval":
        evaluate()
    else:
        raise SystemExit(__doc__)
