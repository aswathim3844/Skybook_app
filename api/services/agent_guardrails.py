from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from api.services.llm_service import LlmService

wait = wait_exponential(multiplier=1, min=1, max=10)

TRAVEL_TERMS = {
    "travel",
    "trip",
    "flight",
    "flights",
    "hotel",
    "hotels",
    "car",
    "cars",
    "rental",
    "vacation",
    "holiday",
    "itinerary",
    "visa",
    "baggage",
    "booking",
    "destination",
    "route",
    "airport",
    "planner",
    "package",
    "bundle",
}

HARMFUL_PATTERNS = (
    r"\b(bomb|weapon|kill|attack|poison|explosive)\b",
    r"\b(steal|fraud|scam|phish|hack|bypass)\b",
    r"\b(fake passport|fake visa|smuggle|traffick)\b",
)


@dataclass
class GuardrailAssessment:
    is_off_topic: bool
    has_harmful_intent: bool
    reason: str
    safe_to_continue: bool


class AgentGuardrailService:
    def __init__(self) -> None:
        self.llm = LlmService()

    def assess_message(self, message: str, history: list[dict[str, Any]] | None = None) -> GuardrailAssessment:
        text = str(message or "").strip()
        if not text:
            return GuardrailAssessment(
                is_off_topic=False,
                has_harmful_intent=False,
                reason="empty_message",
                safe_to_continue=True,
            )

        heuristic = self._heuristic_assessment(text)
        if heuristic.has_harmful_intent:
            return heuristic

        if self.llm.is_configured():
            try:
                return self._llm_assessment(text, history or [])
            except Exception:
                return heuristic
        return heuristic

    def build_block_message(self, assessment: GuardrailAssessment) -> str:
        if assessment.has_harmful_intent:
            return (
                "I can only help with safe travel planning and travel information. "
                "I can’t help with harmful, illegal, or abusive requests."
            )
        return (
            "I can help with travel questions only, like flights, hotels, cars, baggage, visas, "
            "destinations, and trip planning."
        )

    def _heuristic_assessment(self, message: str) -> GuardrailAssessment:
        lower = message.lower()
        if any(re.search(pattern, lower) for pattern in HARMFUL_PATTERNS):
            return GuardrailAssessment(
                is_off_topic=False,
                has_harmful_intent=True,
                reason="harmful_pattern",
                safe_to_continue=False,
            )

        tokens = set(re.findall(r"[a-zA-Z]{3,}", lower))
        travel_overlap = TRAVEL_TERMS.intersection(tokens)
        is_off_topic = not travel_overlap
        return GuardrailAssessment(
            is_off_topic=is_off_topic,
            has_harmful_intent=False,
            reason="heuristic_topic_match" if travel_overlap else "heuristic_off_topic",
            safe_to_continue=not is_off_topic,
        )

    @retry(wait=wait, stop=stop_after_attempt(2))
    def _llm_assessment(self, message: str, history: list[dict[str, Any]]) -> GuardrailAssessment:
        history_text = "\n".join(
            f"{item.get('role', 'user')}: {item.get('content', '')}" for item in history[-4:]
        )
        prompt = f"""You are a travel-assistant guardrail for SkyBook.
Decide whether the user's message is:
1. off-topic for travel help
2. harmful, illegal, abusive, or unsafe

Travel topics include flights, hotels, cars, bookings, visas, baggage, destination guidance, and trip planning.

Return JSON only:
{{
  "is_off_topic": true or false,
  "has_harmful_intent": true or false,
  "reason": "short_reason"
}}

Conversation:
{history_text}

User message:
{message}
"""
        raw = self.llm.chat([{"role": "user", "content": prompt}], json_mode=True)
        payload = json.loads(raw)
        is_off_topic = bool(payload.get("is_off_topic"))
        has_harmful_intent = bool(payload.get("has_harmful_intent"))
        reason = str(payload.get("reason") or "llm_assessment")
        return GuardrailAssessment(
            is_off_topic=is_off_topic,
            has_harmful_intent=has_harmful_intent,
            reason=reason,
            safe_to_continue=not is_off_topic and not has_harmful_intent,
        )
