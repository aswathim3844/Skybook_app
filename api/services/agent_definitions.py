from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from api.services.agent_tools import (
    DjangoAgentTools,
    agent_ask_knowledge_base,
    agent_create_booking,
    agent_search_cars,
    agent_search_flights,
    agent_search_hotels,
)
from api.services.llm_service import LlmService

try:  # pragma: no cover - optional until the Agents SDK is installed
    from agents import Agent
except Exception:  # pragma: no cover
    Agent = None


@dataclass
class SpecialistAgentOutput:
    role: str
    summary: str
    payload: dict[str, Any]


class SpecialistAgentService:
    """Explicit specialist/evaluator roles backed by the Django services."""

    def __init__(self) -> None:
        self.tools = DjangoAgentTools()
        self.llm = LlmService()

    def run_flight_agent(
        self,
        *,
        origin: str | None,
        destination: str | None,
        passengers: int = 1,
        seat_class: str = "Economy",
        max_price: float | None = None,
    ) -> SpecialistAgentOutput:
        result = self.tools.search_flights(
            origin=origin,
            destination=destination,
            passengers=passengers,
            seat_class=seat_class,
            max_price=max_price,
        )
        return SpecialistAgentOutput(role="flight_agent", summary=result.message, payload=result.data)

    def run_hotel_agent(
        self,
        *,
        destination: str | None,
        passengers: int = 1,
        max_price: float | None = None,
        min_rating: float | None = None,
    ) -> SpecialistAgentOutput:
        result = self.tools.search_hotels(
            destination=destination,
            passengers=passengers,
            max_price=max_price,
            min_rating=min_rating,
        )
        return SpecialistAgentOutput(role="hotel_agent", summary=result.message, payload=result.data)

    def run_car_agent(
        self,
        *,
        destination: str | None,
        passengers: int = 1,
        max_price: float | None = None,
        car_type: str | None = None,
    ) -> SpecialistAgentOutput:
        result = self.tools.search_cars(
            destination=destination,
            passengers=passengers,
            max_price=max_price,
            car_type=car_type,
        )
        return SpecialistAgentOutput(role="car_agent", summary=result.message, payload=result.data)

    def run_kb_agent(
        self,
        *,
        question: str,
        history: list[dict[str, Any]] | None = None,
    ) -> SpecialistAgentOutput:
        result = self.tools.ask_knowledge_base(question, history=history)
        return SpecialistAgentOutput(role="kb_agent", summary=result.message, payload=result.data)

    def run_evaluator_agent(
        self,
        *,
        trip_plan: dict[str, Any],
    ) -> SpecialistAgentOutput:
        if self.llm.is_configured():
            payload = self._llm_evaluate(trip_plan)
        else:
            payload = self._heuristic_evaluate(trip_plan)
        return SpecialistAgentOutput(
            role="evaluator_agent",
            summary=str(payload.get("summary") or "Trip plan evaluated."),
            payload=payload,
        )

    def _heuristic_evaluate(self, trip_plan: dict[str, Any]) -> dict[str, Any]:
        issues: list[str] = []
        if not trip_plan.get("selected_flight"):
            issues.append("Missing outbound flight selection.")
        if not trip_plan.get("selected_hotel"):
            issues.append("Missing hotel selection.")
        if not trip_plan.get("selected_car"):
            issues.append("Missing car selection.")
        if not trip_plan.get("visa_info"):
            issues.append("Missing visa guidance.")
        if not trip_plan.get("baggage_info"):
            issues.append("Missing baggage guidance.")
        if not trip_plan.get("itinerary"):
            issues.append("Missing itinerary details.")
        score = max(1, 10 - len(issues) * 2)
        summary = "Trip plan looks strong." if not issues else "Trip plan needs a few improvements."
        return {"score": score, "issues": issues, "summary": summary}

    def _llm_evaluate(self, trip_plan: dict[str, Any]) -> dict[str, Any]:
        prompt = f"""You are the SkyBook trip quality evaluator.
Review this trip plan and score it from 1 to 10.

Check:
- outbound flight included
- hotel included
- car included
- visa info included
- baggage info included
- itinerary included
- pricing looks coherent

Return JSON only:
{{
  "score": 1-10,
  "issues": ["..."],
  "summary": "..."
}}

Trip plan:
{json.dumps(trip_plan, ensure_ascii=True, default=str)}
"""
        raw = self.llm.chat([{"role": "user", "content": prompt}], json_mode=True)
        return json.loads(raw)


def build_sdk_specialist_agents():
    """Return OpenAI Agents SDK definitions when the SDK is available."""
    if Agent is None:  # pragma: no cover
        return {}

    model = LlmService().config.model
    return {
        "flight_agent": Agent(
            name="Flight Specialist",
            instructions=(
                "You are SkyBook's flight specialist. Use the flight search tool and return the most useful "
                "flight options with timings, airline, fare details, and why they fit the request."
            ),
            tools=[agent_search_flights],
            model=model,
        ),
        "hotel_agent": Agent(
            name="Hotel Specialist",
            instructions=(
                "You are SkyBook's hotel specialist. Use the hotel search tool and return hotel options with "
                "pricing, rating, and stay fit."
            ),
            tools=[agent_search_hotels],
            model=model,
        ),
        "car_agent": Agent(
            name="Car Specialist",
            instructions=(
                "You are SkyBook's car rental specialist. Use the car search tool and return rental options with "
                "price, seats, and suitability."
            ),
            tools=[agent_search_cars],
            model=model,
        ),
        "kb_agent": Agent(
            name="Knowledge Base Specialist",
            instructions=(
                "You are SkyBook's knowledge base specialist. Use the KB tool for visa, baggage, destination, "
                "refund, and policy questions. Do not invent facts."
            ),
            tools=[agent_ask_knowledge_base],
            model=model,
        ),
        "evaluator_agent": Agent(
            name="Trip Quality Evaluator",
            instructions=(
                "You are SkyBook's quality evaluator. Review a complete trip plan and return a JSON score, issues, "
                "and summary."
            ),
            model=model,
        ),
        "booking_agent": Agent(
            name="Booking Specialist",
            instructions="You confirm bookings only after the plan is finalized and priced.",
            tools=[agent_create_booking],
            model=model,
        ),
    }
