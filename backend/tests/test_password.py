import re
from email import message_from_bytes, policy

from conftest import auth_headers

from app.services import weekly_report


def login(client, password):
    return client.post("/auth/login", data={"username": "owner@test.vn", "password": password})


def test_change_password(client):
    h = auth_headers(client)  # mật khẩu 12345678
    assert client.post("/auth/change-password", json={"current_password": "sai-mat-khau", "new_password": "abcdefgh"},
                       headers=h).status_code == 400
    assert client.post("/auth/change-password", json={"current_password": "12345678", "new_password": "abcdefgh"},
                       headers=h).status_code == 200
    assert login(client, "12345678").status_code == 401
    assert login(client, "abcdefgh").status_code == 200


def test_forgot_and_reset(client, monkeypatch, tmp_path):
    monkeypatch.setattr(weekly_report, "OUTBOX", tmp_path)
    auth_headers(client)
    # có tài khoản hay không đều trả cùng một câu; chỉ tài khoản có thật mới nhận email
    assert client.post("/auth/forgot", json={"email": "khong-co@test.vn"}).json() == {"ok": True}
    assert client.post("/auth/forgot", json={"email": "Owner@Test.vn"}).json() == {"ok": True}
    mails = list(tmp_path.glob("*.eml"))
    assert len(mails) == 1
    body = message_from_bytes(mails[0].read_bytes(), policy=policy.default).get_body().get_content()
    token = re.search(r"token=([\w.-]+)", body).group(1)

    # token đặt lại không dùng thay token đăng nhập được
    assert client.get("/stores", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    assert client.post("/auth/reset", json={"token": token, "password": "mat-khau-moi"}).status_code == 200
    assert login(client, "mat-khau-moi").status_code == 200
    # dùng lại link cũ: mật khẩu đã đổi nên token hết hiệu lực
    assert client.post("/auth/reset", json={"token": token, "password": "lan-hai-123"}).status_code == 400
    assert client.post("/auth/reset", json={"token": "rac", "password": "lan-hai-123"}).status_code == 400

    for _ in range(2):
        client.post("/auth/forgot", json={"email": "owner@test.vn"})
    assert client.post("/auth/forgot", json={"email": "owner@test.vn"}).status_code == 429


def test_password_change_ends_other_sessions(client):
    h = auth_headers(client)
    other_device = {"Authorization": "Bearer " + login(client, "12345678").json()["access_token"]}
    client.post("/auth/change-password", json={"current_password": "12345678", "new_password": "abcdefgh"}, headers=h)
    assert client.get("/stores", headers=other_device).status_code == 401
    assert client.get("/stores", headers=h).status_code == 401  # cả phiên vừa đổi: đăng nhập lại bằng mật khẩu mới
    fresh = {"Authorization": "Bearer " + login(client, "abcdefgh").json()["access_token"]}
    assert client.get("/stores", headers=fresh).status_code == 200
