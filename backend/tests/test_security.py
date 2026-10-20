import os
import subprocess
import sys
from pathlib import Path

from conftest import auth_headers

from app.routers import public


def test_store_cap_blocks_spam_even_with_rotating_ips(client, monkeypatch):
    h = auth_headers(client)
    client.post("/stores", json={"name": "Phở Ngon", "slug": "pho-ngon"}, headers=h)
    monkeypatch.setattr(public.per_ip, "limit", 10_000)  # mô phỏng kẻ tấn công đổi IP mỗi lần
    codes = [client.post("/public/stores/pho-ngon/reviews", json={"content": f"spam {i}"}).status_code for i in range(31)]
    assert codes[:30] == [201] * 30 and codes[30] == 429


def test_login_locks_after_repeated_failures(client):
    auth_headers(client, "victim@test.vn")
    login = lambda pw: client.post("/auth/login", data={"username": "victim@test.vn", "password": pw}).status_code
    assert [login("wrong-pass") for _ in range(10)] == [401] * 10
    assert login("12345678") == 429  # đúng mật khẩu vẫn bị chặn tới khi hết 15 phút
    assert login("wrong-pass") == 429


def test_successful_login_resets_failures(client):
    auth_headers(client, "user@test.vn")
    login = lambda pw: client.post("/auth/login", data={"username": "user@test.vn", "password": pw}).status_code
    assert [login("wrong-pass") for _ in range(9)] == [401] * 9
    assert login("12345678") == 200
    assert login("wrong-pass") == 401


def test_production_refuses_default_secret():
    env = {**os.environ, "APP_ENV": "production"}
    env.pop("SECRET_KEY", None)
    backend = Path(__file__).resolve().parents[1]
    r = subprocess.run([sys.executable, "-c", "import app.security"], cwd=backend, env=env, capture_output=True, text=True)
    assert r.returncode != 0 and "SECRET_KEY" in r.stderr
    env["SECRET_KEY"] = "x" * 48
    assert subprocess.run([sys.executable, "-c", "import app.security"], cwd=backend, env=env).returncode == 0
