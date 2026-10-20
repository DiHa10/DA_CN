from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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


class PublicStore(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    slug: str


class ReviewIn(BaseModel):
    content: str = Field(min_length=2, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)
    author: str | None = Field(default=None, max_length=200)


class AspectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    aspect: str
    sentiment: str


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
    analysis: AnalysisOut | None
    aspects: list[AspectOut]
