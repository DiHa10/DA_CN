"""Xuất các nhãn người dùng đã sửa (model đoán sai) ra CSV: dùng để đo lại model trên lỗi thật và huấn luyện thêm.

  ../backend/.venv/Scripts/python -X utf8 export_corrections.py   -> reports/corrections.csv

Đọc DATABASE_URL như backend (mặc định SQLite backend/dev.db). Chỉ xuất nội dung review và nhãn, không xuất tên người viết.
"""

import csv
import sys
from collections import Counter

from data import ROOT

sys.path.insert(0, str(ROOT.parent / "backend"))
from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import AspectCorrection, Review  # noqa: E402


def main():
    with SessionLocal() as db:
        rows = db.execute(select(Review.content, AspectCorrection.aspect, AspectCorrection.model_label, AspectCorrection.human_label)
                          .join(AspectCorrection, AspectCorrection.review_id == Review.id)
                          .order_by(Review.id, AspectCorrection.aspect)).all()
    out = ROOT / "reports" / "corrections.csv"
    out.parent.mkdir(exist_ok=True)
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["text", "aspect", "model_label", "human_label"])
        w.writerows(rows)
    print(f"{len(rows)} lần sửa -> {out}")
    for (m, h), n in Counter((r.model_label, r.human_label) for r in rows).most_common():
        print(f"  model {m:>8} -> người sửa {h:<8} {n}")


if __name__ == "__main__":
    main()
