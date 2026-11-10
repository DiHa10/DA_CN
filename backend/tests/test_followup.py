"""Theo dõi sau phân tích: trạng thái xử lý lời chê, mốc cải thiện (trước/sau), bảng giờ × thứ của góp ý QR."""

from datetime import datetime, timedelta, timezone

from conftest import auth_headers

VN = timezone(timedelta(hours=7))


def setup(client):
    h = auth_headers(client)
    sid = client.post("/stores", json={"name": "Phở Ngon", "slug": "pho-ngon"}, headers=h).json()["id"]
    return h, f"/stores/{sid}"


def load(client, h, base, rows, header="content,created_at"):
    csv = header + "\n" + "\n".join(rows) + "\n"
    assert client.post(f"{base}/reviews/import", files={"file": ("r.csv", csv.encode())}, headers=h).status_code == 201


def test_complaint_status(client):
    h, base = setup(client)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    load(client, h, base, [f"Phục vụ chậm quá,{now}", f"Món ăn dở tệ,{now}", f"Món ăn ngon,{now}"])
    assert client.get(f"{base}/dashboard", headers=h).json()["open_complaints"] == 2

    rid = client.get(f"{base}/reviews?complaint=true&status=todo", headers=h).json()[0]["id"]
    r = client.put(f"{base}/reviews/{rid}/status", json={"status": "done", "note": " Đã gọi xin lỗi khách "}, headers=h).json()
    assert (r["status"], r["status_note"]) == ("done", "Đã gọi xin lỗi khách")
    assert [x["id"] for x in client.get(f"{base}/reviews?status=done", headers=h).json()] == [rid]
    assert rid not in [x["id"] for x in client.get(f"{base}/reviews?status=open", headers=h).json()]
    assert client.get(f"{base}/dashboard", headers=h).json()["open_complaints"] == 1
    assert client.put(f"{base}/reviews/{rid}/status", json={"status": "xong"}, headers=h).status_code == 422
    # mở lại: về chưa xử lý
    assert client.put(f"{base}/reviews/{rid}/status", json={"status": None}, headers=h).json()["status"] is None


def test_action_impact(client):
    h, base = setup(client)
    today = datetime.now(VN).date()
    day = today - timedelta(days=10)
    at = lambda d: datetime.combine(d, datetime.min.time(), VN).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # 4 tuần trước mốc: 8/10 lượt chê phục vụ; sau mốc: 1/10; review trước cửa sổ 28 ngày không tính
    rows = [f"Phục vụ chậm quá,{at(day - timedelta(days=3))}"] * 8 + [f"Phục vụ nhanh nhân viên vui vẻ,{at(day - timedelta(days=3))}"] * 2
    rows += [f"Phục vụ chậm quá,{at(day - timedelta(days=40))}"] * 5
    rows += [f"Phục vụ chậm quá,{at(day + timedelta(days=2))}"] + [f"Phục vụ nhanh nhân viên vui vẻ,{at(day + timedelta(days=2))}"] * 9
    load(client, h, base, rows)

    a = client.post(f"{base}/actions", json={"day": day.isoformat(), "aspect": "service", "note": "Thêm 1 người ca trưa"}, headers=h).json()
    assert (a["before"], a["after"], a["after_days"]) == ({"mentions": 10, "negative": 8}, {"mentions": 10, "negative": 1}, 10)
    assert a["verdict"] == "better" and a["enough"]
    # khía cạnh không ai nhắc: chưa đủ dữ liệu, không kết luận
    b = client.post(f"{base}/actions", json={"day": day.isoformat(), "aspect": "location", "note": "Thêm biển chỉ đường"}, headers=h).json()
    assert (b["enough"], b["verdict"]) == (False, None)

    assert client.post(f"{base}/actions", json={"day": (today + timedelta(days=1)).isoformat(), "note": "Sắp làm"}, headers=h).status_code == 400
    assert client.post(f"{base}/actions", json={"day": day.isoformat(), "aspect": "wifi", "note": "Lắp wifi"}, headers=h).status_code == 400
    assert [x["id"] for x in client.get(f"{base}/actions", headers=h).json()] == [b["id"], a["id"]]
    assert client.delete(f"{base}/actions/{a['id']}", headers=h).status_code == 204
    assert len(client.get(f"{base}/actions", headers=h).json()) == 1


def test_complaints_by_time(client):
    h, base = setup(client)
    # thứ Bảy 07/11/2026 theo giờ VN
    sat = lambda hh: datetime(2026, 11, 7, hh, tzinfo=VN).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = [f"Phục vụ chậm quá,qr,{sat(12)}", f"Phục vụ chậm quá,qr,{sat(13)}", f"Món ăn ngon,qr,{sat(12)}",
            f"Phục vụ chậm quá,qr,{sat(1)}",  # 1h sáng thứ Bảy: khuya của tối thứ Sáu
            f"Phục vụ chậm quá,google,{sat(12)}"]  # Google Maps không tính
    load(client, h, base, rows, header="content,source,created_at")
    t = client.get(f"{base}/dashboard", headers=h).json()["by_time"]
    assert t["total"] == 4
    assert t["slots"][1] == "Trưa 11–14h" and t["cells"][1][5] == {"total": 3, "negative": 2}
    assert t["cells"][4][4] == {"total": 1, "negative": 1}


def test_summary_previous_period_and_rating_dist(client):
    h, base = setup(client)
    now = datetime.now(timezone.utc)
    at = lambda d: (now - timedelta(days=d)).strftime("%Y-%m-%dT%H:%M:%SZ")
    # 7 ngày gần nhất: 2 review (5★, 1★); 7 ngày trước đó: 1 review 4★; cũ hơn nữa không tính
    load(client, h, base, [f"Món ăn ngon,5,{at(1)}", f"Phục vụ chậm quá,1,{at(2)}", f"Món ăn ngon,4,{at(9)}", f"Món ăn ngon,3,{at(30)}"],
         header="content,rating,created_at")
    d = client.get(f"{base}/dashboard?days=7", headers=h).json()
    assert d["total"] == 2 and d["rating_dist"] == [1, 0, 0, 0, 1]
    assert d["previous"]["total"] == 1 and d["previous"]["avg_rating"] == 4
    assert client.get(f"{base}/dashboard", headers=h).json()["previous"] is None  # toàn bộ lịch sử: không có kỳ trước
