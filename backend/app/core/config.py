from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """All configuration comes from environment variables (see .env.example).
    Nothing secret is hardcoded; dev defaults are clearly marked insecure."""

    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "PathFinder AI"
    ENVIRONMENT: str = Field(default="development", pattern="^(development|test|staging|production)$")
    DEBUG: bool = False
    API_PREFIX: str = "/api/v1"

    # PostgreSQL in docker/production. SQLite is a zero-setup local fallback only.
    DATABASE_URL: str = f"sqlite:///{(BACKEND_DIR / 'pathfinder_dev.db').as_posix()}"
    DATABASE_ECHO: bool = False
    REDIS_URL: str | None = None

    JWT_SECRET: str = "insecure-dev-secret-change-me-0123456789abcdef"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 14
    PASSWORD_RESET_MINUTES: int = 30
    MAX_FAILED_LOGINS: int = 5
    LOCKOUT_MINUTES: int = 15

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8081"]
    COOKIE_SECURE: bool = False

    RATE_LIMIT_PER_MINUTE: int = 240
    AUTH_RATE_LIMIT_PER_MINUTE: int = 20
    AI_RATE_LIMIT_PER_HOUR: int = 30

    STORAGE_DIR: str = str(BACKEND_DIR / "storage")
    MAX_UPLOAD_MB: int = 20
    ALLOWED_UPLOAD_TYPES: list[str] = [
        "image/png", "image/jpeg", "image/webp", "image/gif",
        "video/mp4", "video/webm",
        "application/pdf", "text/plain", "text/markdown",
        "application/zip",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]

    # AI provider: "anthropic" | "none" (deterministic, record-grounded engine only)
    AI_PROVIDER: str = "none"
    AI_MODEL: str = "claude-opus-5-5"
    ANTHROPIC_API_KEY: str | None = None
    AI_TIMEOUT_SECONDS: float = 90.0
    AI_MAX_OUTPUT_TOKENS: int = 4000

    DATA_RETENTION_DAYS_AFTER_DELETION: int = 30
    CONSENT_REQUIRED_UNDER_AGE: int = 18  # DPDP Act: verifiable guardian consent for children under 18
    FRONTEND_URL: str = "http://localhost:5173"

    @field_validator("CORS_ORIGINS", "ALLOWED_UPLOAD_TYPES", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    def validate_production(self) -> None:
        if self.is_production:
            if self.JWT_SECRET.startswith("insecure") or len(self.JWT_SECRET) < 32:
                raise RuntimeError("JWT_SECRET must be set to a strong secret in production")
            if self.is_sqlite:
                raise RuntimeError("Production requires PostgreSQL (DATABASE_URL)")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.validate_production()
    return s
