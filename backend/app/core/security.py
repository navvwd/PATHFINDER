from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from .config import get_settings

_hasher = PasswordHasher()  # Argon2id with library-recommended parameters


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: uuid.UUID, role: str, institution_id: uuid.UUID | None, token_version: int) -> tuple[str, int]:
    s = get_settings()
    expires = utcnow() + timedelta(minutes=s.ACCESS_TOKEN_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "inst": str(institution_id) if institution_id else None,
        "tv": token_version,
        "type": "access",
        "iat": int(utcnow().timestamp()),
        "exp": int(expires.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, s.JWT_SECRET, algorithm=s.JWT_ALGORITHM), s.ACCESS_TOKEN_MINUTES * 60


def decode_access_token(token: str) -> dict:
    s = get_settings()
    payload = jwt.decode(token, s.JWT_SECRET, algorithms=[s.JWT_ALGORITHM], options={"require": ["exp", "sub"]})
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """Refresh / reset tokens are stored only as SHA-256 hashes."""
    return hashlib.sha256(token.encode()).hexdigest()


def password_strength_errors(password: str) -> list[str]:
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not any(c.isalpha() for c in password):
        errors.append("a letter")
    if not any(c.isdigit() for c in password):
        errors.append("a number")
    return errors
