# Hệ thống tự động đánh giá và phân tích phản hồi khách hàng

- `backend/`: FastAPI + SQLAlchemy, phân tích cảm xúc và ABSA (`app/services/nlp.py`)
- `frontend/`: Next.js
- `ml/`: train và đánh giá model ABSA (từ điển / TF-IDF / PhoBERT) trên VLSP 2018 nhà hàng

## Chạy nhanh sau khi clone (Windows)
Cần cài: Git, Python 3.12, Node.js 20 trở lên. Chạy các lệnh dưới trong **Git Bash**, tại thư mục repo.

**1. Backend** (dùng SQLite, không cần cài PostgreSQL):
```bash
cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
```
```bash
.venv/Scripts/python seed.py
```
```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```
`seed.py` tạo 300 review mẫu và tài khoản demo (email và mật khẩu ghi ở đầu file `backend/seed.py`).

**2. Frontend** (mở thêm một cửa sổ Git Bash):
```bash
cd frontend && npm install && npm run dev
```
Mở http://localhost:3000 rồi đăng nhập bằng tài khoản demo.

**3. Bật PhoBERT (không bắt buộc).** Không có model thì backend tự dùng bộ từ điển, web vẫn chạy bình thường.
- Tải `absa-model.zip` ở mục **Releases** của repo trên GitHub, giải nén vào `ml/models/` để có thư mục `ml/models/absa/`.
- Cài torch (máy không có GPU NVIDIA thì bỏ phần `--index-url ...`, pip sẽ cài bản CPU):
```bash
backend/.venv/Scripts/python -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124
```
- Chạy backend kèm biến môi trường (trong thư mục `backend`):
```bash
NLP_MODEL_DIR=../ml/models/absa .venv/Scripts/python -m uvicorn app.main:app --reload
```
Nếu `seed.py` đã chạy trước khi bật PhoBERT, xóa `backend/dev.db` rồi chạy lại `seed.py` (cũng đặt `NLP_MODEL_DIR`) để review mẫu được phân tích bằng PhoBERT.

## Train model (dùng venv của backend)
```bash
backend/.venv/Scripts/python -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124
```
```bash
backend/.venv/Scripts/python -m pip install -r ml/requirements.txt
```
```bash
cd ml
```
```bash
../backend/.venv/Scripts/python -X utf8 data.py
```
```bash
../backend/.venv/Scripts/python -X utf8 train_baseline.py
```
```bash
../backend/.venv/Scripts/python -X utf8 train_absa.py --epochs 12
```
```bash
../backend/.venv/Scripts/python -X utf8 evaluate.py
```
Kết quả: `ml/reports/results.md`, `ml/reports/confusion_phobert.png`. Dữ liệu: bản mirror `clapAI/VLSP2018_SA` trên Hugging Face (VLSP 2018, chỉ dùng cho nghiên cứu).

Bật PhoBERT trong backend: đặt biến môi trường `NLP_MODEL_DIR=D:/DA_CN/ml/models/absa` trước khi chạy uvicorn. Không đặt thì backend dùng bộ từ điển.

## Chạy backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload
```
Dữ liệu demo (300 review, tài khoản ghi trong `seed.py`): `.venv/Scripts/python seed.py`

Không đặt `DATABASE_URL` thì dùng SQLite (`backend/dev.db`).

### PostgreSQL
Bản portable nằm ở `.pg/` (PostgreSQL 16.10, chỉ nghe trên localhost, user và mật khẩu `feedback`, chỉ dùng cho dev). Bật server:
```bash
D:/DA_CN/.pg/pgsql/bin/pg_ctl.exe -D D:/DA_CN/.pg/data -l D:/DA_CN/.pg/log.txt start
```
Rồi đặt biến môi trường trước khi chạy uvicorn:
`DATABASE_URL=postgresql+psycopg://feedback:feedback@localhost:5432/feedback`.
Tắt server:
```bash
D:/DA_CN/.pg/pgsql/bin/pg_ctl.exe -D D:/DA_CN/.pg/data stop
```
Có Docker thì dùng `docker compose up -d` thay cho bản portable.

### Migration (Alembic)
Backend tự chạy `alembic upgrade head` khi khởi động (`app/migrate.py`). Đổi models thì tạo migration mới (trong thư mục `backend`, khi DB đang ở bản mới nhất):
```bash
.venv/Scripts/python -m alembic revision --autogenerate -m "mo ta thay doi"
```
Đọc lại file sinh ra trong `alembic/versions/` trước khi chạy.

Tài liệu API: http://localhost:8000/docs

## Test
```bash
cd backend
.venv/Scripts/python -m pytest tests
```
Chạy trên PostgreSQL: tạo DB riêng `feedback_test` (bị xóa sạch mỗi test), rồi đặt
`TEST_DATABASE_URL=postgresql+psycopg://feedback:feedback@localhost:5432/feedback_test`.

## Chạy frontend
```bash
cd frontend
npm run dev
```
Mở http://localhost:3000. Frontend gọi backend qua proxy `/api/backend/*` (đổi địa chỉ backend bằng biến `BACKEND_URL`).

Thử form QR trên điện thoại: mở dashboard bằng địa chỉ mạng LAN (ví dụ `http://192.168.x.x:3000`), không dùng `localhost`, để mã QR trỏ đúng máy.

## Chạy production (demo công khai)
- Đặt `APP_ENV=production` cho backend. Backend sẽ không khởi động nếu thiếu `SECRET_KEY` hoặc khóa ngắn hơn 32 ký tự, và tắt `/docs`. Tạo khóa:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```
- Đặt nginx (hoặc reverse proxy khác) trước frontend và ghi đè header `X-Forwarded-For` bằng IP thật (`proxy_set_header X-Forwarded-For $remote_addr;`). Next.js giữ nguyên header do client gửi, nên thiếu bước này thì giới hạn theo IP có thể bị lách; khi đó chỉ còn trần 30 góp ý/phút cho mỗi quán.
- Backend chỉ nghe trên `127.0.0.1` (mặc định của uvicorn), không mở cổng 8000 ra ngoài.
- Không dùng user/mật khẩu `feedback` của PostgreSQL dev.
