"""Client IP resolution.

Behind a trusted reverse proxy (Vercel, nginx) the socket peer is the proxy, so
rate limits and audit logs must use the forwarded client address instead. Only
enable TRUST_PROXY_HEADERS when the API is reachable *exclusively* through such
a proxy - otherwise clients could spoof these headers.
"""

from __future__ import annotations

from fastapi import Request

from .config import get_settings

_HEADERS = ("x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for")


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    if get_settings().TRUST_PROXY_HEADERS:
        for h in _HEADERS:
            v = request.headers.get(h)
            if v:
                return v.split(",")[0].strip()[:64] or None
    return request.client.host if request.client else None
