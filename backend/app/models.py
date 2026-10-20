from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))


class Store(Base):
    __tablename__ = "stores"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    google_location_id: Mapped[str | None] = mapped_column(String(200))
    # báo cáo tuần qua email
    report_email: Mapped[str | None] = mapped_column(String(255))
    weekly_report: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    last_report_week: Mapped[str | None] = mapped_column(String(10))  # "2026-W42": tuần đã gửi, chống gửi trùng

    reviews: Mapped[list["Review"]] = relationship(cascade="all, delete-orphan")
    insight: Mapped["StoreInsight | None"] = relationship(cascade="all, delete-orphan")


class Review(Base):
    __tablename__ = "reviews"
    # chống trùng khi đồng bộ lại từ Google/CSV; external_id NULL không bị tính trùng
    __table_args__ = (UniqueConstraint("store_id", "source", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(20))  # google | qr | csv | manual
    author: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    rating: Mapped[int | None]
    external_id: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # câu trả lời của chủ quán (chưa đăng lên Google; chủ quán sao chép và dán)
    reply_text: Mapped[str | None] = mapped_column(Text)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    analysis: Mapped["ReviewAnalysis | None"] = relationship(cascade="all, delete-orphan", lazy="selectin")
    aspects: Mapped[list["ReviewAspect"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class ReviewAnalysis(Base):
    __tablename__ = "review_analysis"
    review_id: Mapped[int] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"), primary_key=True)
    sentiment: Mapped[str] = mapped_column(String(10))  # positive | neutral | negative
    confidence: Mapped[float] = mapped_column(Float)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReviewAspect(Base):
    __tablename__ = "review_aspects"
    id: Mapped[int] = mapped_column(primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"), index=True)
    aspect: Mapped[str] = mapped_column(String(20))  # food | drink | service | price | ambience | location
    sentiment: Mapped[str] = mapped_column(String(10))


class StoreInsight(Base):
    """Bản tóm tắt AI mới nhất của một quán; lưu lại để mở dashboard không phải gọi AI (tốn tiền) lần nữa."""
    __tablename__ = "store_insights"
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), primary_key=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    content: Mapped[dict] = mapped_column(JSON)
