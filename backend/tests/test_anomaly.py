from datetime import datetime, timedelta, timezone

from conftest import auth_headers

from app.db import SessionLocal
from app.models import Store
from app.services import anomaly, weekly_report
from app.services.anomaly import is_anomaly


def test_thresholds():
    assert is_anomaly(6, 7, 8, 32)[0]  # 86% so với nền 25%
    assert not is_anomaly(4, 4, 8, 32)[0]  # quá ít lượt nhắc trong tuần
    assert not is_anomaly(6, 7, 2, 8)[0]  # chưa đủ dữ liệu nền
    assert not is_anomaly(7, 20, 8, 32)[0]  # 35% so với 25%: tăng chưa tới 15 điểm
    assert not is_anomaly(3, 5, 12, 32)[0]  # 60% so với 37,5%: tăng 22 điểm nhưng chỉ 5 lượt, z ~ 1 có thể do ngẫu nhiên
    assert is_anomaly(5, 5, 0, 40)[0]  # nền 0%: không chia cho 0


def test_endpoint_flags_rising_aspect(client, monkeypatch):
    h = auth_headers(client)
    sid = client.post("/stores", json={"name": "Phở Ngon", "slug": "pho-ngon"}, headers=h).json()["id"]
    now = datetime.now(timezone.utc)
    at = lambda days: (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for week in range(1, 9):  # 8 tuần trước: mỗi tuần 3 khen 1 chê phục vụ
        d = 7 * week + 2
        rows += [f"Phục vụ nhanh nhân viên vui vẻ,{at(d)}"] * 3 + [f"Phục vụ chậm quá,{at(d)}"]
    rows += [f"Phục vụ chậm đợi lâu,{at(1)}"] * 6 + [f"Phục vụ nhanh nhân viên vui vẻ,{at(2)}", f"Món ăn ngon,{at(1)}"]
    csv = "content,created_at\n" + "\n".join(rows) + "\n"
    assert client.post(f"/stores/{sid}/reviews/import", files={"file": ("r.csv", csv.encode())}, headers=h).status_code == 201

    out = client.get(f"/stores/{sid}/dashboard/anomalies", headers=h).json()
    assert {a["aspect"] for a in out["alerts"]} == {"service", None}  # phục vụ và tổng thể; món ăn thì không
    service = next(a for a in out["alerts"] if a["aspect"] == "service")
    assert (service["mentions"], service["negative"], service["baseline_rate"]) == (7, 6, 0.25)
    assert out["since"] == (now - timedelta(days=7)).astimezone(timezone(timedelta(hours=7))).date().isoformat()

    # email tuần dùng cùng kết quả; cửa sổ tuần trước khác 7 ngày gần nhất nên giả lập kết quả detect
    monkeypatch.setattr(anomaly, "detect", lambda *_: out)
    with SessionLocal() as db:
        body = weekly_report.build(db, db.get(Store, sid), now).get_body("plain").get_content()
    assert "Bất thường – Phục vụ: tỉ lệ chê 85,7% trong 7 lượt nhắc (8 tuần trước đó: 25,0%)" in body
    assert "Bất thường – Tổng thể:" in body
