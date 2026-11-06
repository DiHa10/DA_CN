from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from .timeutil import as_utc


class UserCreate(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)
    password: str = Field(min_length=8, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class StoreIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9-]{3,100}$")


class StoreOut(StoreIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_email: str | None
    weekly_report: bool
    role: str  # vai trò của người đang xem


ROLE_PATTERN = r"^(owner|manager|staff)$"


class MemberOut(BaseModel):
    user_id: int
    email: str
    role: str


class MemberIn(BaseModel):
    email: str = Field(max_length=255)
    role: str = Field(pattern=ROLE_PATTERN)


class RoleIn(BaseModel):
    role: str = Field(pattern=ROLE_PATTERN)


class ReportSettings(BaseModel):
    report_email: str | None = Field(default=None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)
    weekly_report: bool


class ReplyIn(BaseModel):
    reply_text: str = Field(max_length=2000)  # chuỗi rỗng = xóa câu trả lời


class HiddenIn(BaseModel):
    hidden: bool


class ReplyDraft(BaseModel):
    reply_text: str


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    generated_at: datetime
    content: dict

    @field_serializer("generated_at")
    def _utc(self, v: datetime) -> datetime:
        return as_utc(v)


class PublicStore(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    slug: str


class ReviewIn(BaseModel):
    content: str = Field(min_length=2, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)
    author: str | None = Field(default=None, max_length=200)


class DemoIn(BaseModel):
    text: str = Field(min_length=2, max_length=300)


class AspectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    aspect: str
    sentiment: str
    corrected: bool = False


class AspectFix(BaseModel):
    sentiment: str = Field(pattern=r"^(positive|neutral|negative|none)$")  # none = câu không nhắc khía cạnh này


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sentiment: str
    confidence: float


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source: str
    author: str | None
    content: str
    rating: int | None
    created_at: datetime
    reply_text: str | None
    replied_at: datetime | None
    spam_reasons: list[str] | None
    hidden: bool
    analysis: AnalysisOut | None
    aspects: list[AspectOut]

    @field_serializer("created_at", "replied_at")
    def _utc(self, v: datetime | None) -> datetime | None:
        return as_utc(v) if v else None  # luôn kèm múi giờ để trình duyệt đổi đúng sang giờ địa phương
