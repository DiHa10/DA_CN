from pathlib import Path

import pytest

MODEL_DIR = Path(__file__).resolve().parents[2] / "ml" / "models" / "absa"
pytestmark = pytest.mark.skipif(not (MODEL_DIR / "head.pt").exists(), reason="chưa train PhoBERT (ml/train_absa.py)")


def test_phobert_splits_mixed_review():
    from app.services.absa_model import AbsaPredictor

    out = AbsaPredictor(MODEL_DIR).predict(["Phở rất ngon nhưng nhân viên phục vụ chậm và thái độ khó chịu"])[0]
    assert out["food"][0] == "positive"
    assert out["service"][0] == "negative"
