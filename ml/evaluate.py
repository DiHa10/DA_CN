"""So sánh 3 cách trên tập test: từ điển (bộ cũ), TF-IDF + LR, PhoBERT.

Chạy: python ml/evaluate.py   -> ml/reports/results.md + ml/reports/confusion_phobert.png
Cách nào chưa có model thì bỏ qua.
"""

import sys
from pathlib import Path

import joblib
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

from data import ROOT, load

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.absa_model import ASPECTS, LABELS, AbsaPredictor  # noqa: E402
from app.services.nlp import analyze  # noqa: E402

REPORTS = ROOT / "reports"
PHOBERT_DIR = ROOT / "models" / "absa"
BASELINE = ROOT / "models" / "baseline.joblib"
ASPECT_VI = {"food": "Món ăn", "drink": "Đồ uống", "service": "Phục vụ", "price": "Giá cả",
             "ambience": "Không gian", "location": "Vị trí"}


def predict_lexicon(rows):
    return [{a: analyze(r["text"])["aspects"].get(a, "none") for a in ASPECTS} for r in rows]


def predict_baseline(rows):
    models = joblib.load(BASELINE)
    preds = {a: models[a].predict([r["seg"] for r in rows]) for a in ASPECTS}
    return [{a: preds[a][i] for a in ASPECTS} for i in range(len(rows))]


def predict_phobert(rows):
    out = AbsaPredictor(PHOBERT_DIR).predict([r["seg"] for r in rows], segmented=True)
    return [{a: o.get(a, ("none", 0))[0] for a in ASPECTS} for o in out]


def scores(rows, preds):
    """F1-macro 4 lớp từng khía cạnh; F1 phát hiện khía cạnh (có nhắc hay không); độ chính xác cảm xúc
    trên các khía cạnh vừa có thật vừa được phát hiện."""
    per = {a: f1_score([r["labels"][a] for r in rows], [p[a] for p in preds], labels=LABELS, average="macro", zero_division=0)
           for a in ASPECTS}
    gold = [r["labels"][a] != "none" for r in rows for a in ASPECTS]
    found = [p[a] != "none" for p in preds for a in ASPECTS]
    pairs = [(r["labels"][a], p[a]) for r, p in zip(rows, preds) for a in ASPECTS
             if r["labels"][a] != "none" and p[a] != "none"]
    return {
        "per_aspect": per,
        "macro_f1": sum(per.values()) / len(per),
        "detect_f1": f1_score(gold, found),
        "polarity_acc": accuracy_score(*zip(*pairs)) if pairs else 0.0,
    }


def main():
    rows = load("test")
    methods = {"Từ điển (bộ cũ)": predict_lexicon}
    if BASELINE.exists():
        methods["TF-IDF + Logistic Regression"] = predict_baseline
    if (PHOBERT_DIR / "head.pt").exists():
        methods["PhoBERT"] = predict_phobert

    results, phobert_preds = {}, None
    for name, fn in methods.items():
        preds = fn(rows)
        results[name] = scores(rows, preds)
        if name == "PhoBERT":
            phobert_preds = preds
        print(f"{name}: macro-F1 {results[name]['macro_f1']:.4f}")

    REPORTS.mkdir(exist_ok=True)
    names = list(results)
    lines = [
        f"# Kết quả trên tập test VLSP 2018 nhà hàng ({len(rows)} review)", "",
        "| Chỉ số | " + " | ".join(names) + " |",
        "|---|" + "---:|" * len(names),
        "| **F1-macro trung bình 6 khía cạnh** | " + " | ".join(f"**{results[n]['macro_f1']:.4f}**" for n in names) + " |",
        "| F1 phát hiện khía cạnh | " + " | ".join(f"{results[n]['detect_f1']:.4f}" for n in names) + " |",
        "| Độ chính xác cảm xúc (khía cạnh phát hiện đúng) | " + " | ".join(f"{results[n]['polarity_acc']:.4f}" for n in names) + " |",
    ]
    lines += [f"| F1-macro {ASPECT_VI[a]} | " + " | ".join(f"{results[n]['per_aspect'][a]:.4f}" for n in names) + " |"
              for a in ASPECTS]
    lines += ["", "F1-macro tính trên 4 lớp: không nhắc / tích cực / trung lập / tiêu cực."]
    (REPORTS / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    if phobert_preds:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import ConfusionMatrixDisplay

        y = [r["labels"][a] for r in rows for a in ASPECTS]
        p = [q[a] for q in phobert_preds for a in ASPECTS]
        names_vi = ["Không nhắc", "Tích cực", "Trung lập", "Tiêu cực"]
        ConfusionMatrixDisplay(confusion_matrix(y, p, labels=LABELS), display_labels=names_vi).plot(cmap="Blues", colorbar=False)
        plt.title("PhoBERT: ma trận nhầm lẫn (gộp 6 khía cạnh)")
        plt.tight_layout()
        plt.savefig(REPORTS / "confusion_phobert.png", dpi=150)
    print(f"Saved {REPORTS / 'results.md'}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
