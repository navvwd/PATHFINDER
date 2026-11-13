"""Fixed-window rate limiter backed by Redis when REDIS_URL is set,
otherwise an in-process store (fine for a single dev instance)."""

from __future__ import annotations

import logging
import threading
import time

from .config import get_settings

log = logging.getLogger("pathfinder.ratelimit")


class _MemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def incr(self, key: str, window: int) -> int:
        now = time.time()
        with self._lock:
            count, exp = self._data.get(key, (0, now + window))
            if exp <= now:
                count, exp = 0, now + window
            count += 1
            self._data[key] = (count, exp)
            if len(self._data) > 50_000:  # opportunistic cleanup
                for k in [k for k, (_, e) in self._data.items() if e <= now]:
                    self._data.pop(k, None)
            return count

    def reset(self) -> None:
        with self._lock:
            self._data.clear()


class RateLimiter:
    def __init__(self) -> None:
        self._memory = _MemoryStore()
        self._redis = None
        url = get_settings().REDIS_URL
        if url:
            try:
                import redis

                self._redis = redis.Redis.from_url(url, socket_timeout=0.5)
                self._redis.ping()
            except Exception as exc:  # degrade gracefully, never block requests on Redis
                log.warning("redis_unavailable_using_memory", extra={"error": str(exc)})
                self._redis = None

    @property
    def backend(self) -> str:
        return "redis" if self._redis else "memory"

    def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Returns (allowed, remaining)."""
        bucket = f"rl:{key}:{int(time.time() // window_seconds)}"
        try:
            if self._redis:
                pipe = self._redis.pipeline()
                pipe.incr(bucket)
                pipe.expire(bucket, window_seconds + 1)
                count = int(pipe.execute()[0])
            else:
                count = self._memory.incr(bucket, window_seconds)
        except Exception:
            count = self._memory.incr(bucket, window_seconds)
        return count <= limit, max(limit - count, 0)

    def reset(self) -> None:
        self._memory.reset()


limiter = RateLimiter()
