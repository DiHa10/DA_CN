"""Lấy review thật trong DB ra 2 tập để nhóm gán nhãn: real_test (chỉ để đo) và real_train (chỉ để huấn luyện thêm).

  ../backend/.venv/Scripts/python -X utf8 export_real.py --store 3            -> real_test/, real_train/ (mỗi tập 1 nửa)
  ../backend/.venv/Scripts/python -X utf8 export_real.py --store 3 --store 5 --test 0.4

Hai tập tách hẳn nhau: đo trên chính câu đã dùng để huấn luyện thì điểm cao giả. Chỉ chọn quán có review thật
(Google Maps, QR); đừng chọn quán demo của seed.py (câu ghép từ khuôn). Chỉ xuất nội dung, không xuất tên người viết.
Thư mục real_test/, real_train/ không đưa lên git (lời khách thật): chia sẻ trong nhóm qua Drive.
Đọc DATABASE_URL như backend.
"""

import argparse
import csv
import random
import re
import sys

from data import ROOT

sys.path.insert(0, str(ROOT.parent / "backend"))
from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import Review  # noqa: E402

MIN_CHARS, MAX_CHARS = 8, 500  # quá ngắn thì không có khía cạnh, quá dài thì gán nhãn mệt và dễ lệch nhau


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--store", type=int, action="append", required=True, help="id quán (lặp lại để lấy nhiều quán)")
    ap.add_argument("--test", type=float, default=0.5, help="tỉ lệ dành cho tập đo")
    ap.add_argument("--force", action="store_true", help="ghi đè dù đã có file (mất nhãn đã gán nếu tạo lại câu)")
    args = ap.parse_args()

    out = {name: ROOT / name for name in ("real_test", "real_train")}
    if not args.force and any((d / "sentences.csv").exists() for d in out.values()):
        raise SystemExit("Đã có real_test/real_train: tạo lại sẽ lệch với nhãn nhóm đã gán. Thêm --force nếu chắc chắn.")

    with SessionLocal() as db:
        texts = db.scalars(select(Review.content).where(Review.store_id.in_(args.store), Review.hidden.is_(False))
                           .order_by(Review.id)).all()
    seen, rows = set(), []
    for t in texts:
        t = " ".join(t.split())  # bỏ xuống dòng: mỗi câu một dòng trong Excel
        key = re.sub(r"\W+", " ", t.lower()).strip()
        if MIN_CHARS <= len(t) <= MAX_CHARS and key not in seen:
            seen.add(key)
            rows.append(t)
    random.Random(42).shuffle(rows)
    cut = round(len(rows) * args.test)
    for name, part in (("real_test", rows[:cut]), ("real_train", rows[cut:])):
        out[name].mkdir(exist_ok=True)
        with open(out[name] / "sentences.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["id", "text"])
            w.writerows((i, t) for i, t in enumerate(part, 1))
        print(f"{name}: {len(part)} câu -> {out[name] / 'sentences.csv'}")
    print(f"(bỏ {len(texts) - len(rows)} câu trùng, quá ngắn hoặc quá dài)")


if __name__ == "__main__":
    main()
