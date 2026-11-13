"""Provider-independent LLM interface.

Every provider takes a system prompt, a user prompt and a Pydantic output
schema, and returns a validated instance plus token usage. Business code never
imports a vendor SDK directly - it goes through :func:`get_provider`.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Protocol, TypeVar

from pydantic import BaseModel

from ..core.config import get_settings

log = logging.getLogger("pathfinder.ai")
T = TypeVar("T", bound=BaseModel)


class AIProviderError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


@dataclass
class AIResult:
    output: BaseModel
    provider: str
    model: str | None
    input_tokens: int
    output_tokens: int
    latency_ms: int


class LLMProvider(Protocol):
    name: str

    def generate(self, *, system: str, prompt: str, schema: type[T], max_tokens: int) -> AIResult: ...


class AnthropicProvider:
    """Claude via the official Anthropic SDK with structured outputs."""

    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        import anthropic

        self._anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=2)
        self.model = model

    def generate(self, *, system: str, prompt: str, schema: type[T], max_tokens: int) -> AIResult:
        a = self._anthropic
        start = time.perf_counter()
        try:
            resp = self.client.messages.parse(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                output_config={"effort": "medium"},
                messages=[{"role": "user", "content": prompt}],
                output_format=schema,
            )
        except a.RateLimitError as e:
            raise AIProviderError("provider_rate_limited") from e
        except a.APIStatusError as e:
            raise AIProviderError(f"provider_http_{e.status_code}") from e
        except a.APIConnectionError as e:
            raise AIProviderError("provider_unreachable") from e
        if resp.stop_reason == "refusal":
            raise AIProviderError("provider_refusal")
        if resp.stop_reason == "max_tokens" or resp.parsed_output is None:
            raise AIProviderError("invalid_output")
        return AIResult(output=resp.parsed_output, provider=self.name, model=self.model,
                        input_tokens=resp.usage.input_tokens, output_tokens=resp.usage.output_tokens,
                        latency_ms=int((time.perf_counter() - start) * 1000))


_provider_cache: dict[tuple, LLMProvider | None] = {}


def get_provider(override: dict | None = None) -> LLMProvider | None:
    """Returns the configured provider, or None when only the deterministic
    engine should be used (no key configured, or AI disabled by an admin)."""
    s = get_settings()
    cfg = {"provider": s.AI_PROVIDER, "model": s.AI_MODEL, **(override or {})}
    if cfg.get("enabled") is False:
        return None
    key = (cfg["provider"], cfg["model"])
    if key in _provider_cache:
        return _provider_cache[key]
    provider: LLMProvider | None = None
    if cfg["provider"] == "anthropic" and s.ANTHROPIC_API_KEY:
        provider = AnthropicProvider(s.ANTHROPIC_API_KEY, cfg["model"], s.AI_TIMEOUT_SECONDS)
    _provider_cache[key] = provider
    return provider
