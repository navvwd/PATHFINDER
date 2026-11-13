from __future__ import annotations

import uuid
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    message: str


class IdResponse(BaseModel):
    id: uuid.UUID


class Timestamps(ORM):
    created_at: datetime
    updated_at: datetime | None = None


ShortText = Field(min_length=1, max_length=200)
