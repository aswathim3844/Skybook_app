from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.utils import timezone

from api.services.agent_definitions import SpecialistAgentService, build_sdk_specialist_agents
from api.services.llm_service import LlmService
from api.services.planner_service import (
    build_draft_summary,
    build_fallback_itinerary,
    build_recommendation_reason,
    calculate_pricing,
    clean_location,
    describe_budget,
    make_json_safe,
    normalize_flight_location,
    parse_date_value,
)

try:  # pragma: no cover - optional until the Agents SDK is installed
    from agents import Agent, Runner, handoff
except Exception:  # pragma: no cover
    Agent = None
    Runner = None
    handoff = None


@dataclass
class AgentOrchestrationResult:
    selected_flight: dict[str, Any] | None
    selected_return_flight: dict[str, Any] | None
    selected_hotel: dict[str, Any] | None
    selected_car: dict[str, Any] | None
    outbound_flights: list[dict[str, Any]]
    return_flights: list[dict[str, Any]]
    hotels: list[dict[str, Any]]
    cars: list[dict[str, Any]]
    itinerary: list[dict[str, Any]]
    knowledge: dict[str, Any]
    pricing: dict[str, Any]
    quality: dict[str, Any]
    metadata: dict[str, Any]


class PlannerAgentOrchestrator:
    """Multi-role orchestration layer on top of the Django services."""

    def __init__(self) -> None:
        self.specialists = SpecialistAgentService()
        self.llm = LlmService()

    def build_plan(self, *, session, payload: dict[str, Any], preferences: dict[str, Any]) -> AgentOrchestrationResult:
        raw_origin = payload.get("origin") or session.origin
        raw_destination = payload.get("destination") or session.destination
        origin = clean_location(raw_origin)
        destination = clean_location(raw_destination)
        flight_origin = normalize_flight_location(raw_origin)
        flight_destination = normalize_flight_location(raw_destination)
        departure_date = parse_date_value(payload.get("departure_date") or session.departure_date)
        return_date = parse_date_value(payload.get("return_date") or session.return_date)
        passengers = int(payload.get("passengers") or session.passengers or 1)
        budget = payload.get("budget") if payload.get("budget") is not None else session.budget
        budget_decimal = Decimal(str(budget)) if budget is not None else None

        if departure_date is None:
            departure_date = timezone.now().date()
        if return_date is None:
            return_date = departure_date

        nights = max((return_date - departure_date).days, 1)
        seat_class = str(preferences.get("seat_class") or payload.get("seat_class") or "Economy")
        trip_type = str(preferences.get("trip_type") or payload.get("trip_type") or "Flexible getaway")
        history = payload.get("history") or []

        per_night_hotel_cap = None
        per_day_car_cap = None
        if budget_decimal is not None and nights > 0:
            per_night_hotel_cap = float((budget_decimal * Decimal("0.40")) / Decimal(nights))
            per_day_car_cap = float((budget_decimal * Decimal("0.15")) / Decimal(nights))

        # Run structured inventory search and qualitative tasks in parallel so draft generation
        # stays responsive while preserving Python-owned pricing and selection.
        with ThreadPoolExecutor(max_workers=7) as executor:
            flight_future = executor.submit(
                self.specialists.run_flight_agent,
                origin=flight_origin,
                destination=flight_destination,
                passengers=passengers,
                seat_class=seat_class,
            )
            return_flight_future = executor.submit(
                self.specialists.run_flight_agent,
                origin=flight_destination,
                destination=flight_origin,
                passengers=passengers,
                seat_class=seat_class,
            )
            hotel_future = executor.submit(
                self.specialists.run_hotel_agent,
                destination=destination,
                passengers=passengers,
                max_price=per_night_hotel_cap,
            )
            car_future = executor.submit(
                self.specialists.run_car_agent,
                destination=destination,
                passengers=passengers,
                max_price=per_day_car_cap,
                car_type=preferences.get("car_type"),
            )
            visa_future = executor.submit(
                self.specialists.run_kb_agent,
                question=f"Visa requirements for {origin or 'travellers'} to {destination}"
                if destination
                else "Visa requirements for travellers",
                history=history,
            )
            baggage_future = executor.submit(
                self.specialists.run_kb_agent,
                question=f"SkyBook baggage policy for {seat_class}",
                history=history,
            )
            destination_future = executor.submit(
                self.specialists.run_kb_agent,
                question=f"Top highlights and travel tips for {destination}"
                if destination
                else "Travel tips",
                history=history,
            )
            itinerary_future = executor.submit(
                self._build_itinerary,
                destination=destination,
                origin=origin,
                nights=nights,
                trip_type=trip_type,
                budget=budget_decimal,
            )

            flight_result = flight_future.result()
            return_flight_result = return_flight_future.result()
            hotel_result = hotel_future.result()
            car_result = car_future.result()
            visa_result = visa_future.result()
            baggage_result = baggage_future.result()
            destination_result = destination_future.result()
            itinerary = itinerary_future.result()

        outbound_flights = flight_result.payload.get("results", [])
        return_flights = return_flight_result.payload.get("results", [])
        hotels = hotel_result.payload.get("results", [])
        cars = car_result.payload.get("results", [])

        selected_flight = outbound_flights[0] if outbound_flights else None
        selected_return_flight = self._pick_return_flight(selected_flight, return_flights)
        selected_hotel = hotels[0] if hotels else None
        selected_car = cars[0] if cars else None

        pricing = calculate_pricing(
            selected_flight=selected_flight,
            selected_return_flight=selected_return_flight,
            selected_hotel=selected_hotel,
            selected_car=selected_car,
            departure_date=departure_date,
            return_date=return_date,
            passengers=passengers,
        )
        knowledge = {
            "visa_info": visa_result.payload.get("answer"),
            "baggage_info": baggage_result.payload.get("answer"),
            "destination_brief": destination_result.payload.get("answer"),
            "sources": [
                *visa_result.payload.get("sources", []),
                *baggage_result.payload.get("sources", []),
                *destination_result.payload.get("sources", []),
            ],
        }
        quality_input = {
            "selected_flight": selected_flight,
            "selected_return_flight": selected_return_flight,
            "selected_hotel": selected_hotel,
            "selected_car": selected_car,
            "itinerary": itinerary,
            "visa_info": knowledge["visa_info"],
            "baggage_info": knowledge["baggage_info"],
            "pricing": pricing,
        }
        quality = self.specialists.run_evaluator_agent(trip_plan=quality_input).payload
        metadata = {
            "mode": "agentic_planner",
            "orchestration": {
                "flight_agent": flight_result.summary,
                "return_flight_agent": return_flight_result.summary,
                "hotel_agent": hotel_result.summary,
                "car_agent": car_result.summary,
                "visa_agent": visa_result.summary,
                "baggage_agent": baggage_result.summary,
                "destination_agent": destination_result.summary,
            },
            "recommendation_reason": build_recommendation_reason(
                budget_decimal,
                pricing["grand_total"],
                destination,
            ),
        }

        return AgentOrchestrationResult(
            selected_flight=selected_flight,
            selected_return_flight=selected_return_flight,
            selected_hotel=selected_hotel,
            selected_car=selected_car,
            outbound_flights=outbound_flights,
            return_flights=return_flights,
            hotels=hotels,
            cars=cars,
            itinerary=itinerary,
            knowledge=knowledge,
            pricing=pricing,
            quality=quality,
            metadata=metadata,
        )

    def build_summary(self, *, destination: str | None, trip_type: str, orchestration: AgentOrchestrationResult) -> str:
        return build_draft_summary(
            destination=destination,
            trip_type=trip_type,
            estimated_total=orchestration.pricing["grand_total"],
            pricing=orchestration.pricing,
            flights=orchestration.outbound_flights,
            hotels=orchestration.hotels,
            cars=orchestration.cars,
        )

    def to_ai_metadata(self, orchestration: AgentOrchestrationResult, preferences: dict[str, Any]) -> dict[str, Any]:
        return {
            **orchestration.metadata,
            "preferences": preferences,
            "pricing": make_json_safe(orchestration.pricing),
            "itinerary": orchestration.itinerary,
            "visa_info": orchestration.knowledge["visa_info"],
            "baggage_info": orchestration.knowledge["baggage_info"],
            "destination_brief": orchestration.knowledge["destination_brief"],
            "quality_score": make_json_safe(orchestration.quality),
            "knowledge_sources": orchestration.knowledge.get("sources", []),
        }

    def _build_itinerary(
        self,
        *,
        destination: str | None,
        origin: str | None,
        nights: int,
        trip_type: str,
        budget: Decimal | None,
    ) -> list[dict[str, Any]]:
        fallback = build_fallback_itinerary(destination=destination, nights=nights, trip_type=trip_type)
        if not self.llm.is_configured() or not destination:
            return fallback

        prompt = f"""Create a {nights}-night SkyBook itinerary.
Origin: {origin or 'Traveller'}
Destination: {destination}
Trip type: {trip_type}
Budget level: {describe_budget(budget)}

Return JSON only as an array where each item includes:
- day
- title
- morning
- afternoon
- evening
- highlights
- estimated_local_spend
"""
        try:
            content = self.llm.chat([{"role": "user", "content": prompt}], json_mode=True)
            import json
            parsed = json.loads(content)
            if isinstance(parsed, dict) and isinstance(parsed.get("itinerary"), list):
                return parsed["itinerary"]
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return fallback
        return fallback

    def _pick_return_flight(
        self,
        selected_outbound_flight: dict[str, Any] | None,
        return_flights: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        if not return_flights:
            return None
        if not selected_outbound_flight:
            return return_flights[0]

        outbound_provider = str(selected_outbound_flight.get("provider") or "").strip().lower()
        if not outbound_provider:
            return return_flights[0]

        for flight in return_flights:
            if str(flight.get("provider") or "").strip().lower() == outbound_provider:
                return flight
        return return_flights[0]


def build_sdk_planner_agent():
    """Create an SDK planner/orchestrator agent when the Agents SDK is installed."""
    if Agent is None or handoff is None:  # pragma: no cover
        return None

    specialists = build_sdk_specialist_agents()
    if not specialists:
        return None

    model = LlmService().config.model
    handoffs = []
    for key in ("flight_agent", "hotel_agent", "car_agent", "kb_agent", "evaluator_agent", "booking_agent"):
        agent = specialists.get(key)
        if agent is not None:
            handoffs.append(handoff(agent))

    return Agent(
        name="SkyBook Planner Orchestrator",
        instructions=(
            "You are SkyBook's master planner agent. Coordinate the flight, hotel, car, knowledge, "
            "and evaluator specialists to produce a complete trip plan. Use specialist handoffs when "
            "you need detailed search, policy guidance, or quality scoring."
        ),
        handoffs=handoffs,
        model=model,
    )
