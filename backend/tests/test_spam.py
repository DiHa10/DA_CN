from conftest import auth_headers

from app.routers import public
from app.services.spam import is_gibberish, is_near_duplicate, is_rating_mismatch


def test_gibberish():
    for text in ["!!!!!!111", "aaaaaaa", "😀😀😀😀", "$$$ 0909 123 456", "."]:
        assert is_gibberish(text), text
    for text in ["Phở ngon", "ngonnnnnnn", "Ok", "Giá 50k hơi mắc", "10/10 sẽ quay lại"]:
        assert not is_gibberish(text), text


def test_near_duplicate():
    assert is_near_duplicate("Quán dở tệ, phục vụ thái độ khó chịu!!", "quán dở tệ phục vụ thái độ khó chịu")  # giống hệt sau khi chuẩn hóa
    assert is_near_duplicate("Quán ăn ngon nhất quận, ai cũng nên thử", "Quán ăn ngon nhất quận, ai cũng nên thử nha")
    assert not is_near_duplicate("Nhân viên thái độ khó chịu.", "Nhân viên thái độ khó chịu.")  # câu ngắn trùng nhau là chuyện thường
    assert not is_near_duplicate("Phục vụ chậm, đợi lâu quá", "Phở ngon, nước dùng đậm đà")


def test_rating_mismatch():
    assert is_rating_mismatch(5, "negative", 0.9)
    assert is_rating_mismatch(1, "positive", 0.85)
    assert not is_rating_mismatch(5, "negative", 0.6)  # model không chắc: không kết luận
    assert not is_rating_mismatch(4, "negative", 0.95)
    assert not is_rating_mismatch(None, "negative", 0.95)


def test_flags_hide_and_stats(client, monkeypatch):
    owner = auth_headers(client)
    sid = client.post("/stores", json={"name": "Phở Ngon", "slug": "pho-ngon"}, headers=owner).json()["id"]
    base = f"/stores/{sid}/reviews"
    monkeypatch.setattr(public.per_ip, "limit", 100)  # cho phép gửi dồn để thử phát hiện

    client.post(base, json={"content": "Phở ngon, nhân viên thân thiện"}, headers=owner)  # review thật
    for _ in range(3):  # cùng một máy gửi 3 lần trong vài giây, cùng nội dung chê
        client.post("/public/stores/pho-ngon/reviews", json={"content": "Quán dở tệ, phục vụ thái độ khó chịu"})
    client.post(base, json={"content": "!!!!!!!!"}, headers=owner)

    flagged = client.get(base, params={"spam": "true"}, headers=owner).json()
    reasons = {r["content"]: set(r["spam_reasons"]) for r in flagged}
    assert reasons["Quán dở tệ, phục vụ thái độ khó chịu"] == {"duplicate", "burst"}
    assert reasons["!!!!!!!!"] == {"gibberish"}
    assert len(flagged) == 4  # cả 3 bản spam đều bị gắn, kể cả 2 bản đến trước
    assert all(not r["hidden"] for r in flagged)  # chỉ gắn nhãn, không tự ẩn
    assert client.get(base, params={"spam": "false"}, headers=owner).json()[0]["content"] == "Phở ngon, nhân viên thân thiện"

    # phân tích lại: bỏ cờ cũ phải về NULL thật, không thành JSON null làm hỏng bộ lọc
    real = client.get(base, params={"spam": "false"}, headers=owner).json()[0]
    from app.db import SessionLocal
    from app.models import Review
    from app.services import spam
    with SessionLocal() as db:
        r = db.get(Review, real["id"])
        r.spam_reasons = ["gibberish"]
        db.commit()
        spam.flag_reviews(db, [r])
        db.commit()
    assert client.get(base, params={"spam": "false"}, headers=owner).json()[0]["id"] == real["id"]
    assert client.put(f"{base}/{real['id']}/hidden", json={"hidden": True}, headers=owner).status_code == 400

    dash = lambda: client.get(f"/stores/{sid}/dashboard", headers=owner).json()
    assert dash()["total"] == 5
    for r in flagged:  # chủ quán ẩn spam: thống kê chỉ còn review thật
        assert client.put(f"{base}/{r['id']}/hidden", json={"hidden": True}, headers=owner).json()["hidden"]
    assert dash()["total"] == 1 and dash()["sentiment"]["negative"] == 0

    staff = auth_headers(client, "staff@test.vn")
    client.post(f"/stores/{sid}/members", json={"email": "staff@test.vn", "role": "staff"}, headers=owner)
    assert client.put(f"{base}/{flagged[0]['id']}/hidden", json={"hidden": False}, headers=staff).status_code == 403


def test_big_import_still_flags_exact_copies(client, monkeypatch):
    """Nhập file lớn cùng ngày: không so từng cặp (O(n²)) nữa, nhưng bản sao y hệt vẫn bị gắn cờ."""
    from app.services import spam
    monkeypatch.setattr(spam, "NEAR_LIMIT", 3)
    h = auth_headers(client)
    sid = client.post("/stores", json={"name": "Phở Ngon", "slug": "pho-ngon"}, headers=h).json()["id"]
    copy = "Quán dở tệ, phục vụ thái độ khó chịu, không bao giờ quay lại"
    rows = [copy, copy.upper() + "!!", "Phở ngon nước dùng đậm đà vừa miệng, sẽ quay lại lần nữa",
            "Nhân viên dễ thương, quán sạch sẽ thoáng mát, giá hợp lý với sinh viên", "Ngon"]
    csv = "content\n" + "\n".join(f'"{r}"' for r in rows) + "\n"  # không có cột ngày: mọi dòng cùng thời điểm
    client.post(f"/stores/{sid}/reviews/import", files={"file": ("r.csv", csv.encode())}, headers=h)
    flagged = {r["content"] for r in client.get(f"/stores/{sid}/reviews", params={"spam": "true"}, headers=h).json()}
    assert flagged == {copy, copy.upper() + "!!"}
