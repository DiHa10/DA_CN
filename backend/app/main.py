import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .migrate import migrate
from .routers import auth, dashboard, insights, public, reviews, stores
from .security import PRODUCTION
from .services import nlp
from .services import weekly_report
from .services.analysis import analyze_pending


@asynccontextmanager
async def lifespan(app: FastAPI):
    migrate()  # Alembic upgrade head; đổi cấu trúc bảng thì thêm migration trong alembic/versions
    nlp.load_model()  # nạp PhoBERT trước request đầu tiên (nếu đặt NLP_MODEL_DIR)
    threading.Thread(target=analyze_pending, daemon=True).start()  # chạy nền, không chặn server mở cổng
    weekly_report.start_scheduler()
    yield


app = FastAPI(
    title="Customer Feedback Analysis",
    lifespan=lifespan,
    # production không công khai tài liệu API
    docs_url=None if PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if PRODUCTION else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
for r in (auth, stores, reviews, public, dashboard, insights):
    app.include_router(r.router)


@app.get("/health")
def health():
    return {"status": "ok"}
