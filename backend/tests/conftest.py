import os
import tempfile

import pytest

# mặc định SQLite tạm; đặt TEST_DATABASE_URL để chạy trên Postgres (DB riêng, mỗi test bị xóa sạch)
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL") or "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["NLP_BACKEND"] = "lexicon"  # test API cần kết quả xác định; PhoBERT có test riêng

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import auth, insights, public, reviews, stores  # noqa: E402


@pytest.fixture
def client():
    # xóa cả bảng alembic_version để mỗi test chạy migration lại từ đầu (đồng thời kiểm tra migration)
    Base.metadata.drop_all(engine)
    with engine.begin() as c:
        c.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    for limiter in (public.per_ip, public.per_store, public.demo_per_ip, public.demo_all, auth.failed_logins, insights.per_store,
                    reviews.draft_limit, stores.test_limit):
        limiter._hits.clear()
    with TestClient(app) as c:
        yield c


def auth_headers(client, email="owner@test.vn"):
    token = client.post("/auth/register", json={"email": email, "password": "12345678"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
