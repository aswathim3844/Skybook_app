from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings
from openai import OpenAI


@dataclass
class LlmConfig:
    provider: str
    model: str


class LlmService:
    def __init__(self) -> None:
        provider = str(getattr(settings, "LLM_PROVIDER", "openai") or "openai").strip().lower()
        timeout = float(getattr(settings, "LLM_REQUEST_TIMEOUT_SECONDS", 12))
        if provider == "groq":
            groq_key = self._normalize_api_key(getattr(settings, "GROQ_API_KEY", ""))
            self.config = LlmConfig(
                provider="groq",
                model=str(getattr(settings, "GROQ_MODEL", "") or "llama-3.3-70b-versatile"),
            )
            self.client = OpenAI(
                api_key=groq_key or None,
                base_url="https://api.groq.com/openai/v1",
                timeout=timeout,
                max_retries=0,
            )
        else:
            openai_key = self._normalize_api_key(getattr(settings, "OPENAI_API_KEY", ""))
            self.config = LlmConfig(
                provider="openai",
                model=str(getattr(settings, "OPENAI_MODEL", "") or "gpt-4.1-nano"),
            )
            self.client = OpenAI(api_key=openai_key or None, timeout=timeout, max_retries=0)

    def is_configured(self) -> bool:
        if self.config.provider == "groq":
            return bool(self._normalize_api_key(getattr(settings, "GROQ_API_KEY", "")))
        return bool(self._normalize_api_key(getattr(settings, "OPENAI_API_KEY", "")))

    def chat(self, messages: list[dict[str, str]], json_mode: bool = False) -> str:
        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        response = self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    def _normalize_api_key(self, value: str | None) -> str:
        key = str(value or "").strip()
        if not key:
            return ""
        placeholder_values = {
            "your-openai-key",
            "your-groq-key",
            "openai-api-key",
            "groq-api-key",
            "changeme",
        }
        if key.lower() in placeholder_values:
            return ""
        return key
