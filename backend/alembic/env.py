from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (đăng ký bảng vào Base.metadata)
from app.db import Base, engine

if context.config.config_file_name and context.config.attributes.get("configure_logger", True):
    fileConfig(context.config.config_file_name)


def run_migrations_online():
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            render_as_batch=connection.dialect.name == "sqlite",  # SQLite không ALTER cột được, phải tạo lại bảng
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
