"""Chuẩn bị dữ liệu VLSP 2018 ABSA (nhà hàng) từ bản mirror clapAI/VLSP2018_SA trên Hugging Face.

Chạy: python ml/data.py   -> ml/data/processed/{train,val,test}.jsonl + in thống kê nhãn
"""

import ast
import csv
import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.absa_model import ASPECTS, segment  # noqa: E402

RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "processed"
URL = "https://huggingface.co/datasets/clapAI/VLSP2018_SA/resolve/main/vlsp2018_restaurant/{}.csv"
SPLITS = ["train", "val", "test"]

# 12 nhãn VLSP -> 6 khía cạnh của hệ thống; RESTAURANT#GENERAL/MISCELLANEOUS bỏ vì không chỉ ra điều cần sửa
GROUP = {
    "FOOD#QUALITY": "food", "FOOD#STYLE&OPTIONS": "food",
    "DRINKS#QUALITY": "drink", "DRINKS#STYLE&OPTIONS": "drink",
    "FOOD#PRICES": "price", "DRINKS#PRICES": "price", "RESTAURANT#PRICES": "price",
    "SERVICE#GENERAL": "service", "AMBIENCE#GENERAL": "ambience", "LOCATION#GENERAL": "location",
}
# nhiều nhãn trái chiều trong một nhóm: ưu tiên tiêu cực, vì mục tiêu là tìm điều cần sửa
PRIORITY = {"negative": 3, "positive": 2, "neutral": 1}


def merge(raw_labels: dict) -> dict:
    out = {}
    for cat, pol in raw_labels.items():
        a = GROUP.get(cat)
        if a and pol in PRIORITY and PRIORITY[pol] > PRIORITY.get(out.get(a), 0):
            out[a] = pol
    return {a: out.get(a, "none") for a in ASPECTS}


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for split in SPLITS:
        src = RAW / f"{split}.csv"
        if not src.exists():
            urllib.request.urlretrieve(URL.format(split), src)
        rows = []
        with open(src, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                labels = ast.literal_eval(r["label"])  # chuỗi dict Python; literal_eval không chạy code
                assert isinstance(labels, dict)
                rows.append({"text": r["text"], "seg": segment(r["text"]), "labels": merge(labels)})
        with open(OUT / f"{split}.jsonl", "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

        print(f"\n{split}: {len(rows)} review")
        for a in ASPECTS:
            c = Counter(r["labels"][a] for r in rows)
            print(f"  {a:9s} " + "  ".join(f"{k}={c[k]}" for k in ["positive", "neutral", "negative", "none"]))


def load(split: str) -> list[dict]:
    with open(OUT / f"{split}.jsonl", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
