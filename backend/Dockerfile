FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# torch bản CPU: nhẹ hơn bản CUDA hàng GB, chạy được trên mọi máy (Docker Desktop trên Windows không có GPU nếu không cấu hình thêm)
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
# cài thư viện trước khi chép code: sửa code không phải cài lại thư viện (Docker giữ cache lớp này)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000
# migration tự chạy lúc khởi động (app/migrate.py), không cần lệnh riêng
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
