from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from ..core.config import get_settings
from ..core.ratelimit import limiter
from ..core.net import client_ip

log = logging.getLogger("pathfinder.http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Request ID, structured access log, global rate limit and security headers."""

    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        rid = rid[:64]
        request.state.request_id = rid
        start = time.perf_counter()
        s = get_settings()

        if request.url.path.startswith(s.API_PREFIX):
            ident = client_ip(request) or "anon"
            ok, remaining = limiter.hit(f"global:{ident}", s.RATE_LIMIT_PER_MINUTE, 60)
            if not ok:
                return JSONResponse({"error": {"code": "rate_limited", "message": "Too many requests",
                                               "details": None, "request_id": rid}},
                                    status_code=429, headers={"Retry-After": "60", "X-Request-ID": rid})

        response = await call_next(request)
        elapsed = int((time.perf_counter() - start) * 1000)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if not request.url.path.startswith(("/docs", "/redoc")):
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if s.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        if request.url.path.startswith(s.API_PREFIX) and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        log.info("request", extra={"request_id": rid, "method": request.method, "path": request.url.path,
                                   "status": response.status_code, "duration_ms": elapsed,
                                   "user_id": getattr(request.state, "user_id", None)})
        return response
