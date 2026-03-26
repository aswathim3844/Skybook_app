import logging
import re
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone

from api.models import ItineraryDrafts, PlannerMessages, PlannerSessions
from api.services.providers import (
    ProviderSearchContext,
    get_car_provider,
    get_flight_provider,
    get_hotel_provider,
)


logger = logging.getLogger(__name__)


AI_KNOWLEDGE_BASE = {
    "visa": {
        "dubai": {
            "indian": "Indian passport holders usually need a UAE visa in advance, although valid US, UK, or Schengen visas can make them eligible for visa-on-arrival in many cases.",
            "us": "US passport holders can usually enter the UAE visa-free for short stays.",
            "uk": "UK passport holders can usually enter the UAE visa-free for short stays.",
        },
        "london": {
            "indian": "Indian passport holders usually need a UK Standard Visitor visa before travel.",
            "us": "US passport holders can usually visit the UK for short tourism stays without a visa.",
            "uk": "UK passport holders do not need a visa to enter the UK.",
        },
        "tokyo": {
            "indian": "Indian passport holders generally need a Japan visa before travel.",
            "us": "US passport holders can usually visit Japan visa-free for short stays.",
            "uk": "UK passport holders can usually visit Japan visa-free for short stays.",
        },
        "singapore": {
            "indian": "Indian passport holders usually need a Singapore visa unless they qualify for specific transit exemptions.",
            "us": "US passport holders can usually enter Singapore visa-free for short stays.",
            "uk": "UK passport holders can usually enter Singapore visa-free for short stays.",
        },
        "bangkok": {
            "indian": "Indian passport holders often qualify for Thailand eVisa or visa-on-arrival depending on the current policy window.",
            "us": "US passport holders can usually enter Thailand visa-free for short tourism stays.",
            "uk": "UK passport holders can usually enter Thailand visa-free for short tourism stays.",
        },
        "new york": {
            "indian": "Indian passport holders usually need a valid US visitor visa before travel.",
            "us": "US passport holders do not need a visa to enter the United States.",
            "uk": "UK passport holders usually need ESTA approval for short tourist travel to the US.",
        },
        "paris": {
            "indian": "Indian passport holders usually need a Schengen visa before travel to France.",
            "us": "US passport holders can usually visit France and the Schengen area visa-free for short stays.",
            "uk": "UK passport holders can usually visit France and the Schengen area visa-free for short stays.",
        },
    },
    "currency": {
        "dubai": "Dubai uses the UAE dirham (AED). Cards are widely accepted, but carrying a small cash amount for taxis and local shops is helpful.",
        "london": "London uses the British pound sterling (GBP). Contactless card payments are the easiest option for most visitors.",
        "tokyo": "Tokyo uses the Japanese yen (JPY). Cards are more accepted now, but cash is still useful for smaller restaurants and transit top-ups.",
        "singapore": "Singapore uses the Singapore dollar (SGD). Cards are widely accepted and exchange counters are easy to find.",
        "bangkok": "Bangkok uses the Thai baht (THB). Carry some cash for markets and small local vendors.",
        "new york": "New York uses the US dollar (USD). Cards are accepted almost everywhere.",
        "paris": "Paris uses the euro (EUR). Cards are common, but a little cash is handy for cafes and metro ticket machines.",
    },
    "best_time": {
        "dubai": "The best time to visit Dubai is November to March for cooler weather and outdoor activities.",
        "london": "The best time to visit London is April to June or September for mild weather and fewer crowds.",
        "tokyo": "The best time to visit Tokyo is March to May for cherry blossom season or October to November for pleasant autumn weather.",
        "singapore": "Singapore works year-round, but February to April is often a bit drier and more comfortable.",
        "bangkok": "The best time to visit Bangkok is November to February when the weather is less humid.",
        "new york": "The best time to visit New York is April to June or September to early November for comfortable city weather.",
        "paris": "The best time to visit Paris is April to June or September to October for pleasant weather and lively streets.",
    },
    "packing": {
        "beach": "Pack light cotton clothes, swimwear, sandals, sunscreen, sunglasses, a hat, and a compact power bank.",
        "adventure": "Pack breathable layers, trail shoes, a light rain jacket, sunscreen, a reusable bottle, and a small first-aid kit.",
        "business": "Pack wrinkle-resistant formalwear, dress shoes, adapters, a laptop sleeve, and a compact grooming kit.",
    },
    "policy": {
        "baggage": "SkyNest baggage allowance usually includes one cabin bag and one personal item in Economy, with higher checked baggage allowance in Business and First.",
        "cancellation": "SkyNest cancellation rules depend on fare type. Flexible fares generally allow lower-fee changes, while saver fares may have higher penalties.",
        "checkin": "SkyNest recommends online check-in 24 hours before departure and airport arrival at least 3 hours before international flights.",
        "meals": "SkyNest offers complimentary meals on most medium and long-haul routes, with special meals available when requested in advance.",
        "loyalty": "SkyNest Miles lets members earn 1 mile per eligible dollar spent in this planner demo, with Silver, Gold, and Platinum tiers unlocking extra benefits.",
    },
}


@dataclass
class PlannerReply:
    reply: str
    mode: str
    sources: list[dict[str, Any]]


class PlannerService:
    """Planner service boundary for chat and future orchestration."""

    def __init__(self):
        self.flight_provider = get_flight_provider()
        self.hotel_provider = get_hotel_provider()
        self.car_provider = get_car_provider()

    def generate_chat_reply(self, message: str, history: list[dict] | None = None) -> PlannerReply:
        normalized_history = history or []
        rag_reply = self._try_rag_reply(message, normalized_history)
        if rag_reply is not None:
            return rag_reply

        return PlannerReply(
            reply=build_fallback_ai_chat_reply(message),
            mode="fallback",
            sources=[],
        )

    def _try_rag_reply(self, message: str, history: list[dict]) -> PlannerReply | None:
        try:
            from implementations.answer import answer_question

            reply, documents = answer_question(message, history)
        except BaseException as exc:  # pragma: no cover
            logger.warning("Planner RAG unavailable, falling back to static planner replies: %s", exc)
            return None

        sources = []
        for document in documents:
            source = document.metadata.get("source")
            doc_type = document.metadata.get("doc_type")
            if source or doc_type:
                sources.append({"source": source, "doc_type": doc_type})

        return PlannerReply(reply=reply, mode="rag", sources=sources)

    def create_session(self, payload: dict[str, Any]) -> PlannerSessions:
        customer_id = payload.get("customer_id")
        title = (payload.get("title") or "").strip() or "New Trip Plan"
        destination = clean_location(payload.get("destination"))
        origin = clean_location(payload.get("origin"))
        departure_date = parse_date_value(payload.get("departure_date"))
        return_date = parse_date_value(payload.get("return_date"))
        passengers = parse_int_value(payload.get("passengers")) or 1
        budget = parse_decimal_value(payload.get("budget"))

        return PlannerSessions.objects.create(
            customer_id=customer_id or None,
            title=title,
            status="active",
            origin=origin,
            destination=destination,
            departure_date=departure_date,
            return_date=return_date,
            passengers=passengers,
            budget=budget,
            trip_preferences=payload.get("trip_preferences") or {},
        )

    def add_message(self, session: PlannerSessions, role: str, content: str, metadata: dict[str, Any] | None = None) -> PlannerMessages:
        return PlannerMessages.objects.create(
            session=session,
            role=role,
            content=content,
            message_metadata=metadata or {},
        )

    def build_trip_plan(self, session: PlannerSessions, payload: dict[str, Any]) -> ItineraryDrafts:
        preferences = payload.get("preferences") or session.trip_preferences or {}
        origin = clean_location(payload.get("origin") or session.origin)
        destination = clean_location(payload.get("destination") or session.destination)
        departure_date = parse_date_value(payload.get("departure_date") or session.departure_date)
        return_date = parse_date_value(payload.get("return_date") or session.return_date)
        passengers = parse_int_value(payload.get("passengers")) or session.passengers or 1
        budget = parse_decimal_value(payload.get("budget"))
        if budget is None:
            budget = session.budget

        if departure_date is None:
            departure_date = timezone.now().date() + timedelta(days=14)
        if return_date is None:
            return_date = departure_date + timedelta(days=5)

        outbound_flights = self.flight_provider.search(
            ProviderSearchContext(
                origin=origin,
                destination=destination,
                passengers=passengers,
                preferences=preferences,
            )
        )
        return_flights = self.flight_provider.search(
            ProviderSearchContext(
                origin=destination,
                destination=origin,
                passengers=passengers,
                preferences=preferences,
            )
        )
        hotels = self.hotel_provider.search(
            ProviderSearchContext(
                destination=destination,
                passengers=passengers,
                preferences=preferences,
            )
        )
        cars = self.car_provider.search(
            ProviderSearchContext(
                destination=destination,
                passengers=passengers,
                preferences=preferences,
            )
        )

        selected_flight = outbound_flights[0] if outbound_flights else None
        selected_return_flight = return_flights[0] if return_flights else None
        selected_hotel = hotels[0] if hotels else None
        selected_car = cars[0] if cars else None
        estimated_total = calculate_estimated_total(
            selected_flight,
            selected_return_flight,
            selected_hotel,
            selected_car,
            departure_date,
            return_date,
            passengers,
        )

        summary = build_draft_summary(destination, estimated_total, outbound_flights, hotels, cars)
        ai_metadata = {
            "mode": "search_bundle",
            "preferences": preferences,
            "recommendation_reason": build_recommendation_reason(budget, estimated_total, destination),
        }

        session.origin = origin
        session.destination = destination
        session.departure_date = departure_date
        session.return_date = return_date
        session.passengers = passengers
        session.budget = budget
        session.trip_preferences = preferences
        if destination:
            session.title = session.title or f"{destination} planner"
        session.save()

        return ItineraryDrafts.objects.create(
            session=session,
            status="draft",
            title=f"{destination or 'Trip'} itinerary",
            summary=summary,
            origin=origin,
            destination=destination,
            departure_date=departure_date,
            return_date=return_date,
            passengers=passengers,
            budget=budget,
            estimated_total=estimated_total,
            selected_flight=selected_flight,
            selected_return_flight=selected_return_flight,
            selected_hotel=selected_hotel,
            selected_car=selected_car,
            flight_options=outbound_flights,
            return_flight_options=return_flights,
            hotel_options=hotels,
            car_options=cars,
            ai_metadata=ai_metadata,
        )

    def revalidate_draft(self, draft: ItineraryDrafts) -> ItineraryDrafts:
        context = ProviderSearchContext(
            origin=clean_location(draft.origin),
            destination=clean_location(draft.destination),
            passengers=draft.passengers or 1,
            preferences=(draft.ai_metadata or {}).get("preferences") or {},
        )

        revalidation = {
            "flight": self.flight_provider.revalidate(draft.selected_flight or {}, context),
            "return_flight": self.flight_provider.revalidate(draft.selected_return_flight or {}, context)
            if draft.selected_return_flight
            else None,
            "hotel": self.hotel_provider.revalidate(draft.selected_hotel or {}, context),
            "car": self.car_provider.revalidate(draft.selected_car or {}, context),
        }

        draft.ai_metadata = {
            **(draft.ai_metadata or {}),
            "revalidation": revalidation,
        }
        draft.status = "validated" if all(
            result is None or result.get("available")
            for result in revalidation.values()
        ) else "requires_review"
        draft.save(update_fields=["ai_metadata", "status", "updated_at"])
        return draft

    def update_draft_selection(self, draft: ItineraryDrafts, payload: dict[str, Any]) -> ItineraryDrafts:
        selected_flight = payload.get("selected_flight")
        selected_return_flight = payload.get("selected_return_flight")
        selected_hotel = payload.get("selected_hotel")
        selected_car = payload.get("selected_car")

        if selected_flight is not None:
            draft.selected_flight = selected_flight
        if selected_return_flight is not None:
            draft.selected_return_flight = selected_return_flight
        if selected_hotel is not None:
            draft.selected_hotel = selected_hotel
        if selected_car is not None:
            draft.selected_car = selected_car

        budget = parse_decimal_value(payload.get("budget"))
        if budget is not None:
            draft.budget = budget

        if payload.get("summary"):
            draft.summary = str(payload.get("summary"))

        draft.estimated_total = calculate_estimated_total(
            draft.selected_flight,
            draft.selected_return_flight,
            draft.selected_hotel,
            draft.selected_car,
            draft.departure_date,
            draft.return_date,
            draft.passengers or 1,
        )
        draft.status = "draft"
        draft.ai_metadata = {
            **(draft.ai_metadata or {}),
            "selection_updated": True,
        }
        draft.save(
            update_fields=[
                "selected_flight",
                "selected_return_flight",
                "selected_hotel",
                "selected_car",
                "budget",
                "summary",
                "estimated_total",
                "status",
                "ai_metadata",
                "updated_at",
            ]
        )
        return draft

def build_fallback_ai_chat_reply(message: str) -> str:
    text = message.lower()

    for city, passports in AI_KNOWLEDGE_BASE["visa"].items():
        if city in text and "visa" in text:
            passport = "indian"
            if "us passport" in text or "american passport" in text:
                passport = "us"
            elif "uk passport" in text or "british passport" in text:
                passport = "uk"
            return passports.get(passport) or "I do not have a confirmed visa answer for that passport and destination combination."

    for city, reply in AI_KNOWLEDGE_BASE["currency"].items():
        if city in text and ("currency" in text or "money" in text or "exchange" in text):
            return reply

    for city, reply in AI_KNOWLEDGE_BASE["best_time"].items():
        if city in text and ("best time" in text or "weather" in text or "visit" in text):
            return reply

    if "beach" in text and ("pack" in text or "packing" in text):
        return AI_KNOWLEDGE_BASE["packing"]["beach"]
    if "adventure" in text and ("pack" in text or "packing" in text):
        return AI_KNOWLEDGE_BASE["packing"]["adventure"]
    if "business" in text and ("pack" in text or "packing" in text):
        return AI_KNOWLEDGE_BASE["packing"]["business"]

    if "baggage" in text:
        return AI_KNOWLEDGE_BASE["policy"]["baggage"]
    if "cancel" in text:
        return AI_KNOWLEDGE_BASE["policy"]["cancellation"]
    if "check-in" in text or "check in" in text:
        return AI_KNOWLEDGE_BASE["policy"]["checkin"]
    if "meal" in text or "food" in text:
        return AI_KNOWLEDGE_BASE["policy"]["meals"]
    if "loyalty" in text or "miles" in text:
        return AI_KNOWLEDGE_BASE["policy"]["loyalty"]

    parsed_plan = parse_prompt_trip_request(message)
    if parsed_plan:
        destination = parsed_plan["destination"]
        duration = parsed_plan["duration"]
        budget = parsed_plan["budget"]
        return (
            f"I extracted destination {destination}, duration {duration} days, and budget ${budget}. "
            "Use the smart search below to fetch matching flights, hotels, and cars together, then confirm the package."
        )

    return (
        "I can help with visa requirements, currency, best time to visit, packing lists, baggage rules, cancellation policy, check-in guidance, and SkyNest Miles. "
        "If you ask about something outside that knowledge, I will say so clearly."
    )


def parse_prompt_trip_request(message: str) -> dict[str, Any] | None:
    text = message.lower()
    if "trip to" not in text and "to " not in text:
        return None

    destination_match = re.search(r"to\s+([a-zA-Z\s]+?)(?:\s+for|\s+under|$)", message, re.IGNORECASE)
    duration_match = re.search(r"(\d+)\s*day", text)
    budget_match = re.search(r"\$?\s*([0-9][0-9,]*)", message)

    if not destination_match or not duration_match or not budget_match:
        return None

    destination = destination_match.group(1).strip().title()
    duration = int(duration_match.group(1))
    budget = int(budget_match.group(1).replace(",", ""))

    return {
        "destination": destination,
        "duration": duration,
        "budget": budget,
    }


def clean_location(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"\s*\([A-Za-z]{3}\)\s*$", "", text)
    return text.split(",")[0].strip() or None


def parse_date_value(value: Any):
    if not value:
        return None
    if hasattr(value, "year") and hasattr(value, "month") and hasattr(value, "day"):
        return value
    try:
        return timezone.datetime.fromisoformat(str(value)).date()
    except ValueError:
        try:
            return timezone.datetime.strptime(str(value), "%Y-%m-%d").date()
        except ValueError:
            return None


def parse_int_value(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_decimal_value(value: Any) -> Decimal | None:
    if value in [None, ""]:
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, ValueError):
        return None


def calculate_estimated_total(
    selected_flight: dict[str, Any] | None,
    selected_return_flight: dict[str, Any] | None,
    selected_hotel: dict[str, Any] | None,
    selected_car: dict[str, Any] | None,
    departure_date,
    return_date,
    passengers: int,
) -> Decimal:
    nights = max((return_date - departure_date).days, 1)
    total = Decimal("0")

    if selected_flight:
        total += Decimal(str(selected_flight.get("display_price") or selected_flight.get("price") or 0)) * passengers
    if selected_return_flight:
        total += Decimal(str(selected_return_flight.get("display_price") or selected_return_flight.get("price") or 0)) * passengers
    if selected_hotel:
        total += Decimal(str(selected_hotel.get("price_per_night") or 0)) * nights
    if selected_car:
        total += Decimal(str(selected_car.get("price_per_day") or 0)) * nights

    return total.quantize(Decimal("0.01"))


def build_draft_summary(destination: str | None, estimated_total: Decimal, flights: list[dict], hotels: list[dict], cars: list[dict]) -> str:
    return (
        f"Prepared a draft trip for {destination or 'your selected destination'} with "
        f"{len(flights)} flight option(s), {len(hotels)} hotel option(s), and {len(cars)} car option(s). "
        f"Current estimated total is ${estimated_total}."
    )


def build_recommendation_reason(budget: Decimal | None, estimated_total: Decimal, destination: str | None) -> str:
    if budget is not None and estimated_total <= budget:
        return f"The recommended bundle for {destination or 'this destination'} fits within the current budget."
    if budget is not None:
        return f"The recommended bundle for {destination or 'this destination'} is the closest match to the current budget."
    return f"The recommended bundle for {destination or 'this destination'} is based on the strongest available value mix."
