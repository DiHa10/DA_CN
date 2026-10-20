from conftest import auth_headers


def make_store(client, headers, slug="pho-ngon"):
    return client.post("/stores", json={"name": "Phở Ngon", "slug": slug}, headers=headers).json()


def test_auth_required(client):
    assert client.get("/stores").status_code == 401


def test_owner_isolation(client):
    store = make_store(client, auth_headers(client))
    other = auth_headers(client, "other@test.vn")
    assert client.get(f"/stores/{store['id']}", headers=other).status_code == 404
    assert client.get(f"/stores/{store['id']}/reviews", headers=other).status_code == 404


def test_qr_review_is_analyzed_and_on_dashboard(client):
    h = auth_headers(client)
    store = make_store(client, h)
    assert client.get("/public/stores/pho-ngon").json()["name"] == "Phở Ngon"
    r = client.post("/public/stores/pho-ngon/reviews", json={"content": "Phở ngon nhưng phục vụ chậm", "rating": 3})
    assert r.status_code == 201

    reviews = client.get(f"/stores/{store['id']}/reviews", headers=h).json()
    assert reviews[0]["source"] == "qr"
    assert {a["aspect"]: a["sentiment"] for a in reviews[0]["aspects"]} == {"food": "positive", "service": "negative"}

    dash = client.get(f"/stores/{store['id']}/dashboard", headers=h).json()
    assert dash["total"] == 1 and dash["analyzed"] == 1
    assert dash["avg_rating"] == 3 and dash["rated"] == 1
    service = next(a for a in dash["aspects"] if a["aspect"] == "service")
    assert service["latest_negative"]["content"] == "Phở ngon nhưng phục vụ chậm"
    assert dash["trend"][0]["neutral"] == 1  # "ngon" và "chậm" bù nhau


def test_csv_import_dedup_and_filters(client):
    h = auth_headers(client)
    store = make_store(client, h)
    csv = ("content,rating,external_id,created_at\n"
           "Đồ ăn rất ngon,5,g1,2026-10-01\n"
           "Nhân viên thô lỗ,1,g2,2026-10-05\n"
           "x,3,g3,2026-10-05\n").encode()
    url = f"/stores/{store['id']}/reviews/import"
    assert client.post(url, files={"file": ("r.csv", csv)}, headers=h).json() == {"imported": 2, "skipped": 1}
    assert client.post(url, files={"file": ("r.csv", csv)}, headers=h).json() == {"imported": 0, "skipped": 3}

    base = f"/stores/{store['id']}/reviews"
    assert len(client.get(base, params={"sentiment": "negative"}, headers=h).json()) == 1
    assert len(client.get(base, params={"aspect": "service"}, headers=h).json()) == 1
    assert len(client.get(base, params={"date_from": "2026-10-03"}, headers=h).json()) == 1


def test_export_xlsx_matches_filter_and_blocks_formulas(client):
    import io

    import openpyxl

    h = auth_headers(client)
    store = make_store(client, h)
    base = f"/stores/{store['id']}/reviews"
    client.post(base, json={"content": "Đồ ăn rất ngon", "rating": 5}, headers=h)
    client.post("/public/stores/pho-ngon/reviews", json={"content": "=HYPERLINK(\"http://x\") phục vụ chậm"})

    r = client.get(f"{base}/export.xlsx", params={"sentiment": "negative"}, headers=h)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
    header = [c.value for c in ws[1]]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    assert len(rows) == 1  # chỉ review tiêu cực
    content = rows[0][header.index("Nội dung")]
    assert content.startswith("'=") and ws.cell(2, header.index("Nội dung") + 1).data_type == "s"
    assert rows[0][header.index("Phục vụ")] == "Tiêu cực"

    other = auth_headers(client, "other@test.vn")
    assert client.get(f"{base}/export.xlsx", headers=other).status_code == 404


def test_import_rejects_missing_column(client):
    h = auth_headers(client)
    store = make_store(client, h)
    r = client.post(f"/stores/{store['id']}/reviews/import", files={"file": ("r.csv", b"text\nabc\n")}, headers=h)
    assert r.status_code == 400


def test_dates_follow_vietnam_time(client):
    h = auth_headers(client)
    store = make_store(client, h)
    base = f"/stores/{store['id']}/reviews"
    # 23:30 UTC ngày 04/10 = 06:30 sáng 05/10 giờ Việt Nam
    csv = "content,created_at\nPhở ngon,2026-10-04T23:30:00Z\n".encode()
    client.post(f"{base}/import", files={"file": ("r.csv", csv)}, headers=h)

    rows = client.get(base, params={"date_from": "2026-10-05", "date_to": "2026-10-05"}, headers=h).json()
    assert len(rows) == 1
    from datetime import datetime, timezone

    created = datetime.fromisoformat(rows[0]["created_at"].replace("Z", "+00:00"))
    assert created.tzinfo is not None  # có múi giờ, trình duyệt đổi đúng giờ (Postgres trả +07:00, SQLite +00:00)
    assert created == datetime(2026, 10, 4, 23, 30, tzinfo=timezone.utc)
    assert client.get(base, params={"date_to": "2026-10-04"}, headers=h).json() == []

    import io

    import openpyxl
    ws = openpyxl.load_workbook(io.BytesIO(client.get(f"{base}/export.xlsx", headers=h).content)).active
    assert ws.cell(2, 1).value == "2026-10-05"
    # 05/10/2026 là thứ Hai: review thuộc tuần bắt đầu 05/10, không phải tuần trước
    assert client.get(f"/stores/{store['id']}/dashboard", headers=h).json()["trend"][0]["week_start"] == "2026-10-05"


def test_pending_reviews_are_analyzed_on_startup(client):
    from app.db import SessionLocal
    from app.models import Review
    from app.services.analysis import analyze_pending

    h = auth_headers(client)
    store = make_store(client, h)
    with SessionLocal() as db:  # review đã lưu nhưng chưa phân tích, như khi server tắt giữa chừng
        db.add(Review(store_id=store["id"], source="csv", content="Nhân viên thái độ khó chịu"))
        db.commit()
    assert analyze_pending() == 1
    assert analyze_pending() == 0
    review = client.get(f"/stores/{store['id']}/reviews", headers=h).json()[0]
    assert review["analysis"]["sentiment"] == "negative"


def test_rate_limiter_forgets_expired_keys(monkeypatch):
    import itertools

    from app import ratelimit
    from app.ratelimit import SlidingWindow

    clock = itertools.count()  # đồng hồ giả, mỗi lần gọi tăng 1 giây
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: next(clock))
    limiter = SlidingWindow(5, 60, "x")
    for i in range(SlidingWindow.SWEEP_EVERY * 3):
        limiter.hit(f"ip-gia-{i}")  # mỗi lượt một IP giả, không bao giờ quay lại
    assert len(limiter._hits) < SlidingWindow.SWEEP_EVERY  # không giữ cả 3072 khóa
