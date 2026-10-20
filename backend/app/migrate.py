"""Chạy migration Alembic tới bản mới nhất. Gọi lúc khởi động backend và trong seed.py."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from .db import engine

INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def migrate() -> None:
    cfg = Config(str(INI))
    cfg.attributes["configure_logger"] = False  # không ghi đè cấu hình log của uvicorn
    tables = set(inspect(engine).get_table_names())
    if "users" in tables and "alembic_version" not in tables:
        # DB cũ tạo bằng create_all trước khi có Alembic: cấu trúc trùng bản đầu tiên, chỉ đánh dấu, không tạo lại
        command.stamp(cfg, "0001")
    command.upgrade(cfg, "head")
