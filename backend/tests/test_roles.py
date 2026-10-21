from conftest import auth_headers


def setup(client):
    owner = auth_headers(client, "owner@test.vn")
    manager = auth_headers(client, "manager@test.vn")
    staff = auth_headers(client, "staff@test.vn")
    outsider = auth_headers(client, "outsider@test.vn")
    store = client.post("/stores", json={"name": "Phở Ngon", "slug": "pho-ngon"}, headers=owner).json()
    sid = store["id"]
    assert store["role"] == "owner"
    for email, role in [("manager@test.vn", "manager"), ("staff@test.vn", "staff")]:
        assert client.post(f"/stores/{sid}/members", json={"email": email, "role": role}, headers=owner).status_code == 201
    client.post(f"/stores/{sid}/reviews", json={"content": "Phục vụ chậm"}, headers=owner)
    return sid, owner, manager, staff, outsider


def test_role_matrix(client):
    sid, owner, manager, staff, outsider = setup(client)
    rid = client.get(f"/stores/{sid}/reviews", headers=owner).json()[0]["id"]
    csv = {"file": ("r.csv", b"content\nNgon\n")}
    calls = {  # (method, url, kwargs) -> mã mong đợi cho staff / manager / owner
        "xem review": (("get", f"/stores/{sid}/reviews", {}), 200, 200, 200),
        "dashboard": (("get", f"/stores/{sid}/dashboard", {}), 200, 200, 200),
        "trả lời": (("put", f"/stores/{sid}/reviews/{rid}/reply", {"json": {"reply_text": "Cảm ơn"}}), 200, 200, 200),
        "import": (("post", f"/stores/{sid}/reviews/import", {"files": csv}), 403, 201, 201),
        "nhập tay": (("post", f"/stores/{sid}/reviews", {"json": {"content": "Ngon"}}), 403, 201, 201),
        "xuất Excel": (("get", f"/stores/{sid}/reviews/export.xlsx", {}), 403, 200, 200),
        "thành viên": (("get", f"/stores/{sid}/members", {}), 403, 403, 200),
        "báo cáo tuần": (("put", f"/stores/{sid}/report-settings", {"json": {"weekly_report": False}}), 403, 403, 200),
    }
    for name, ((method, url, kwargs), *expected) in calls.items():
        for headers, code in zip((staff, manager, owner), expected):
            r = getattr(client, method)(url, headers=headers, **kwargs)
            assert r.status_code == code, (name, code, r.status_code, r.text)
        assert getattr(client, method)(url, headers=outsider, **kwargs).status_code == 404, name  # không lộ quán tồn tại

    assert client.delete(f"/stores/{sid}", headers=manager).status_code == 403
    assert [s["role"] for s in client.get("/stores", headers=staff).json()] == ["staff"]
    assert client.get("/stores", headers=outsider).json() == []


def test_members_management(client):
    sid, owner, manager, staff, outsider = setup(client)
    url = f"/stores/{sid}/members"
    assert client.post(url, json={"email": "nobody@test.vn", "role": "staff"}, headers=owner).status_code == 404
    assert client.post(url, json={"email": "staff@test.vn", "role": "staff"}, headers=owner).status_code == 409
    assert client.post(url, json={"email": "x@test.vn", "role": "admin"}, headers=owner).status_code == 422

    owner_id = next(m["user_id"] for m in client.get(url, headers=owner).json() if m["role"] == "owner")
    # không bỏ / hạ được owner cuối cùng
    assert client.delete(f"{url}/{owner_id}", headers=owner).status_code == 400
    assert client.patch(f"{url}/{owner_id}", json={"role": "staff"}, headers=owner).status_code == 400
    # có owner thứ hai thì được
    manager_id = next(m["user_id"] for m in client.get(url, headers=owner).json() if m["role"] == "manager")
    client.patch(f"{url}/{manager_id}", json={"role": "owner"}, headers=owner)
    assert client.delete(f"{url}/{owner_id}", headers=owner).status_code == 200
    assert client.get(f"/stores/{sid}", headers=owner).status_code == 404  # owner cũ đã mất quyền


def test_compare_only_accessible_stores(client):
    sid, owner, manager, staff, outsider = setup(client)
    other = client.post("/stores", json={"name": "Chi nhánh 2", "slug": "chi-nhanh-2"}, headers=owner).json()
    client.post(f"/stores/{other['id']}/reviews", json={"content": "Phở ngon, nhân viên thân thiện"}, headers=owner)

    data = client.get("/stores/compare", headers=owner).json()
    by_name = {s["name"]: s for s in data["stores"]}
    assert set(by_name) == {"Phở Ngon", "Chi nhánh 2"}
    assert by_name["Phở Ngon"]["aspects"]["service"] == {"mentions": 1, "negative_rate": 1.0}
    assert by_name["Chi nhánh 2"]["aspects"]["service"] == {"mentions": 1, "negative_rate": 0.0}
    assert data["overall"]["aspects"]["service"] == {"mentions": 2, "negative_rate": 0.5}
    # staff chỉ thuộc quán đầu: không thấy chi nhánh 2
    assert [s["name"] for s in client.get("/stores/compare", headers=staff).json()["stores"]] == ["Phở Ngon"]
