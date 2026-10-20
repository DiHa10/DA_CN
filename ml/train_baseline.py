"""Baseline TF-IDF + Logistic Regression, mỗi khía cạnh một bộ phân loại 4 lớp.

Chạy: python ml/train_baseline.py   -> ml/models/baseline.joblib
"""

import sys
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

from data import ROOT, load

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.absa_model import ASPECTS  # noqa: E402

OUT = ROOT / "models" / "baseline.joblib"


def main():
    train = load("train")
    texts = [r["seg"] for r in train]
    models = {}
    for a in ASPECTS:
        clf = make_pipeline(
            TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
            LogisticRegression(max_iter=2000, class_weight="balanced"),
        )
        models[a] = clf.fit(texts, [r["labels"][a] for r in train])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(models, OUT)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
