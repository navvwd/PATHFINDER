from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from .common import ORM

PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")


def _check_phone(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    v = v.replace(" ", "").replace("-", "")
    if not PHONE_RE.match(v):
        raise ValueError("Enter a valid mobile number (10-15 digits)")
    return v


class _Credentials(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr | None = None
    phone: str | None = None
    password: str = Field(min_length=8, max_length=128)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return _check_phone(v)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not re.match(r"^[\w .'\-]+$", v, re.UNICODE):
            raise ValueError("Name contains unsupported characters")
        return v

    @model_validator(mode="after")
    def _identifier(self):
        if not self.email and not self.phone:
            raise ValueError("Provide an email address or a mobile number")
        return self


class StudentRegister(_Credentials):
    date_of_birth: date
    institution_code: str | None = Field(default=None, max_length=40)

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v: date) -> date:
        today = date.today()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 5 or age > 25:
            raise ValueError("PathFinder AI supports students aged 6 to 21")
        return v


class GuardianRegister(_Credentials):
    student_invite_code: str | None = Field(default=None, max_length=16)


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255, description="Email or mobile number")
    password: str = Field(min_length=1, max_length=128)
    client: Literal["web", "mobile"] = "web"
    remember_me: bool = True


class RefreshRequest(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=200)


class TokenPair(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None  # omitted for web clients (httpOnly cookie instead)


class ForgotPassword(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)


class ResetPassword(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePassword(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(ORM):
    id: uuid.UUID
    email: str | None
    phone: str | None
    full_name: str
    role: str
    institution_id: uuid.UUID | None
    is_active: bool
    is_verified: bool
    last_login_at: datetime | None
    created_at: datetime
    preferences: dict[str, Any] = {}


class MeOut(BaseModel):
    user: UserOut
    permissions: list[str]
    student_id: uuid.UUID | None = None
    guardian_id: uuid.UUID | None = None
    mentor_id: uuid.UUID | None = None
    ui_mode: Literal["junior", "senior", "guardian", "staff", "admin"]
    onboarding_complete: bool = True
    consent_status: str | None = None


class SessionOut(ORM):
    id: uuid.UUID
    client: str
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime
