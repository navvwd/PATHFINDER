"""Secure file storage.

Files are stored outside any web root under random keys, never under the
user-supplied name. Type is checked against an allow-list and by magic bytes.
Downloads always pass through an authorization check (no public URLs).
Swap ``LocalStorage`` for an S3-compatible backend in production.
"""

from __future__ import annotations

import hashlib
import secrets
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.errors import ValidationFailed
from ..models import StoredFile, User

MAGIC = {
    "image/png": [b"\x89PNG"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/gif": [b"GIF8"],
    "image/webp": [b"RIFF"],
    "application/pdf": [b"%PDF"],
    "application/zip": [b"PK\x03\x04"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [b"PK\x03\x04"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [b"PK\x03\x04"],
}


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root.resolve() not in p.parents:
            raise ValidationFailed("Invalid storage key")
        return p

    def save(self, key: str, data: bytes) -> None:
        p = self.path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def delete(self, key: str) -> None:
        p = self.path(key)
        if p.exists():
            p.unlink()


def storage() -> LocalStorage:
    return LocalStorage(get_settings().STORAGE_DIR)


async def save_upload(db: Session, user: User, upload: UploadFile) -> StoredFile:
    s = get_settings()
    ctype = (upload.content_type or "").split(";")[0].strip().lower()
    if ctype not in s.ALLOWED_UPLOAD_TYPES:
        raise ValidationFailed(f"File type '{ctype or 'unknown'}' is not allowed", code="unsupported_file_type")
    data = await upload.read(s.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > s.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationFailed(f"File exceeds {s.MAX_UPLOAD_MB} MB", code="file_too_large")
    if not data:
        raise ValidationFailed("File is empty")
    sigs = MAGIC.get(ctype)
    if sigs and not any(data.startswith(sig) for sig in sigs):
        raise ValidationFailed("File content does not match its type", code="file_type_mismatch")
    key = f"{user.id.hex[:2]}/{user.id.hex}/{secrets.token_hex(16)}"
    storage().save(key, data)
    name = Path(upload.filename or "file").name[:255]
    row = StoredFile(owner_user_id=user.id, storage_key=key, original_name=name, content_type=ctype,
                     size_bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    db.add(row)
    db.flush()
    return row
