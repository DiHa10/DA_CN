from datetime import date, datetime, timezone

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
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    google_location_id: Mapped[str | None] = mapped_column(String(200))
    # báo cáo tuần qua email
    report_email: Mapped[str | None] = mapped_column(String(255))
    weekly_report: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    last_report_week: Mapped[str | None] = mapped_column(String(10))  # "2026-W42": tuần đã gửi, chống gửi trùng

    reviews: Mapped[list["Review"]] = relationship(cascade="all, delete-orphan")
    insight: Mapped["StoreInsight | None"] = relationship(cascade="all, delete-orphan")
    actions: Mapped[list["StoreAction"]] = relationship(cascade="all, delete-orphan")
    members: Mapped[list["StoreMember"]] = relationship(cascade="all, delete-orphan")


class StoreMember(Base):
    """Ai được làm gì ở quán nào. Nguồn quyền duy nhất (thay cho stores.owner_id cũ)."""
    __tablename__ = "store_members"
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String(10))  # owner | manager | staff


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
    # chống spam: mã băm IP người gửi qua QR (không lưu IP gốc), lý do nghi ngờ, và quyết định ẩn của chủ quán
    client_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    spam_reasons: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True))  # None phải là SQL NULL để lọc IS NULL
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # xử lý lời chê: NULL = chưa xử lý | doing | done; ghi chú quán đã làm gì với khách này
    status: Mapped[str | None] = mapped_column(String(10))
    status_note: Mapped[str | None] = mapped_column(String(500))
    status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    analysis: Mapped["ReviewAnalysis | None"] = relationship(cascade="all, delete-orphan", lazy="selectin")
    aspects: Mapped[list["ReviewAspect"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    corrections: Mapped[list["AspectCorrection"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


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
    corrected: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())  # nhãn do người sửa


class AspectCorrection(Base):
    """Người sửa nhãn model đoán sai. Phân tích lại vẫn giữ nhãn này; xuất ra để đo lại và huấn luyện thêm model."""
    __tablename__ = "aspect_corrections"
    __table_args__ = (UniqueConstraint("review_id", "aspect"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"))
    aspect: Mapped[str] = mapped_column(String(20))
    model_label: Mapped[str] = mapped_column(String(10))  # positive | neutral | negative | none (model không thấy)
    human_label: Mapped[str] = mapped_column(String(10))  # như trên; none = khía cạnh này không được nhắc
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StoreInsight(Base):
    """Bản tóm tắt AI mới nhất của một quán; lưu lại để mở dashboard không phải gọi AI (tốn tiền) lần nữa."""
    __tablename__ = "store_insights"
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), primary_key=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    content: Mapped[dict] = mapped_column(JSON)


class StoreAction(Base):
    """Việc quán đã thay đổi từ một ngày (thêm người ca trưa, đổi nhà cung cấp...): mốc để so tỉ lệ chê trước và sau."""
    __tablename__ = "store_actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    day: Mapped[date]  # ngày bắt đầu áp dụng, theo giờ VN
    aspect: Mapped[str | None] = mapped_column(String(20))  # None = tổng thể
    note: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


def counted():
    """Điều kiện "review được tính vào thống kê": bỏ review chủ quán đã ẩn (spam). Mọi chỗ thống kê dùng chung."""
    return Review.hidden.is_(False)
