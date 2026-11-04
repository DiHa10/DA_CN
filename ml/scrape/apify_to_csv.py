"""Chuyển file xuất từ Apify (Google Maps Reviews Scraper, JSON hoặc CSV) sang CSV import được vào hệ thống.

  ../../backend/.venv/Scripts/python -X utf8 apify_to_csv.py raw/dataset.json   -> out/<tên quán>.csv

Ẩn danh: chỉ giữ nội dung, số sao, ngày và mã review (để import lại không bị trùng); bỏ tên, ảnh, link người viết.
Mỗi quán một file, vì hệ thống import theo từng quán. Bỏ review chỉ chấm sao không viết chữ.
"""

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"


def load(path: Path) -> list[dict]:
    if path.suffix.lower() == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def convert(rows: list[dict]) -> dict[str, list[dict]]:
    if rows and not {"text", "stars"} <= rows[0].keys():
        raise SystemExit(f"Không thấy cột 'text' và 'stars'. Các cột có trong file: {sorted(rows[0].keys())}")
    by_place = defaultdict(list)
    for r in rows:
        text = (r.get("text") or "").strip()
        if not text:
            continue
        by_place[r.get("title") or "quan"].append({
            "content": text,
            "rating": r.get("stars") or "",
            "created_at": r.get("publishedAtDate") or "",
            "source": "google",
            "external_id": r.get("reviewId") or "",
        })
    return by_place


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    OUT.mkdir(exist_ok=True)
    for place, reviews in convert(load(Path(sys.argv[1]))).items():
        name = re.sub(r"[^\w-]+", "_", place).strip("_")[:60] or "quan"
        path = OUT / f"{name}.csv"
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["content", "rating", "created_at", "source", "external_id"])
            w.writeheader()
            w.writerows(reviews)
        print(f"{path.name}: {len(reviews)} review")


if __name__ == "__main__":
    main()
