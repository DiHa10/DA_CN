"""Tạo tài khoản demo + 1 cửa hàng + review mẫu để xem dashboard.

Chạy: .venv/Scripts/python seed.py   (tài khoản: demo@example.test / demo12345)
"""

import random
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.migrate import migrate
from app.models import Review, Store, User
from app.security import hash_password
from app.services.analysis import analyze_reviews

EMAIL, PASSWORD = "demo@example.test", "demo12345"

PARTS = {
    "food": (["Phở rất ngon", "nước dùng đậm đà ngon", "đồ ăn tươi"], ["đồ ăn nguội", "phở hơi nhạt", "thịt không tươi"]),
    "service": (["nhân viên thân thiện", "phục vụ nhanh", "chủ quán nhiệt tình"], ["phục vụ chậm", "đợi lâu quá", "nhân viên thái độ khó chịu"]),
    "price": (["giá hợp lý", "giá rẻ"], ["giá hơi cao", "hơi đắt so với chất lượng"]),
    "ambience": (["không gian đẹp", "quán sạch sẽ"], ["quán hơi ồn", "bàn ghế bẩn"]),
    "location": (["dễ tìm"], ["chỗ để xe khó tìm"]),
}
# tỉ lệ khen theo khía cạnh, để dashboard có điểm "cần cải thiện" rõ ràng
POSITIVE_RATE = {"food": 0.8, "service": 0.45, "price": 0.6, "ambience": 0.7, "location": 0.6}


def main(n=300):
    migrate()
    rng = random.Random(42)
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == EMAIL)):
            print("Đã có dữ liệu demo, bỏ qua.")
            return
        user = User(email=EMAIL, password_hash=hash_password(PASSWORD))
        db.add(user)
        db.flush()
        store = Store(owner_id=user.id, name="Phở Ngon Quận 1", slug="pho-ngon-q1")
        db.add(store)
        db.flush()

        now = datetime.now(timezone.utc)
        for i in range(n):
            aspects = rng.sample(list(PARTS), k=rng.randint(1, 3))
            good = [rng.random() < POSITIVE_RATE[a] for a in aspects]
            text = ", ".join(rng.choice(PARTS[a][0 if g else 1]) for a, g in zip(aspects, good))
            rating = max(1, min(5, round(1 + 4 * sum(good) / len(good) + rng.uniform(-0.5, 0.5))))
            db.add(Review(store_id=store.id, source=rng.choice(["google", "google", "qr", "csv"]),
                          content=text.capitalize() + ".", rating=rating, external_id=f"seed-{i}",
                          created_at=now - timedelta(days=rng.randint(0, 90))))
        db.commit()
        ids = list(db.scalars(select(Review.id).where(Review.store_id == store.id)))
    analyze_reviews(ids)
    print(f"Đã tạo {len(ids)} review cho {EMAIL}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252, không in được tiếng Việt
    main()
