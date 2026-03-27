from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.utils import timezone
from tenacity import retry, wait_exponential

from api.models import ItineraryDrafts, PlannerMessages, PlannerSessions
from api.services.agent_guardrails import AgentGuardrailService
from api.services.inventory_service import InventoryService
from api.services.llm_service import LlmService
from api.services.providers import ProviderSearchContext
from api.services.rag_service import RagService


logger = logging.getLogger(__name__)
wait = wait_exponential(multiplier=1, min=2, max=20)


@dataclass
class PlannerReply:
    reply: str
    mode: str
    sources: list[dict[str, Any]]


@dataclass
class PlannerIntent:
    kind: str
    inventory_request: dict[str, Any] | None = None
    plan_request: dict[str, Any] | None = None


@dataclass
class PlannerConversationContext:
    origin: str | None = None
    destination: str | None = None
    passengers: int | None = None
    budget: int | None = None
    duration: int | None = None
    seat_class: str | None = None
    hotel_style: str | None = None
    car_type: str | None = None


class PlannerService:
    """Planner service backed by provider search plus advanced RAG."""

    def __init__(self):
        self.inventory_service = InventoryService()
        self.flight_provider = self.inventory_service.flight_provider
        self.hotel_provider = self.inventory_service.hotel_provider
        self.car_provider = self.inventory_service.car_provider
        self.rag_service = RagService()
        self.guardrails = AgentGuardrailService()
        self.llm = LlmService()

    def generate_chat_reply(self, message: str, history: list[dict] | None = None) -> PlannerReply:
        normalized_history = history or []
        guardrail_assessment = self.guardrails.assess_message(message, normalized_history)
        if not guardrail_assessment.safe_to_continue:
            return PlannerReply(
                reply=self.guardrails.build_block_message(guardrail_assessment),
                mode="guardrail",
                sources=[
                    {
                        "source": "agent_guardrails",
                        "doc_type": guardrail_assessment.reason,
                    }
                ],
            )
        conversation_context = build_planner_conversation_context(normalized_history)
        intent = classify_planner_intent(message, normalized_history, conversation_context)

        if intent.kind == "planning":
            return self._build_planning_chat_reply(message, intent.plan_request, conversation_context)

        if intent.kind == "inventory":
            inventory_reply = self._try_inventory_reply(message, intent.inventory_request)
            if inventory_reply is not None:
                return inventory_reply
            rag_reply = self._try_rag_reply(message, normalized_history)
            if rag_reply is not None:
                return rag_reply

        if intent.kind in {"knowledge", "fallback"}:
            rag_reply = self._try_rag_reply(message, normalized_history)
            if rag_reply is not None:
                return rag_reply

        if intent.kind == "fallback":
            inventory_reply = self._try_inventory_reply(message, intent.inventory_request)
            if inventory_reply is not None:
                return inventory_reply

        return PlannerReply(
            reply=build_fallback_ai_chat_reply(message),
            mode="fallback",
            sources=[],
        )

    def _build_planning_chat_reply(
        self,
        message: str,
        plan_request: dict[str, Any] | None,
        conversation_context: PlannerConversationContext | None = None,
    ) -> PlannerReply:
        plan_request = merge_plan_request_with_context(
            plan_request or parse_prompt_trip_request(message) or {},
            conversation_context or PlannerConversationContext(),
        )
        destination = plan_request.get("destination")
        duration = plan_request.get("duration")
        budget = plan_request.get("budget")
        budget_text = f"${budget}" if budget is not None else "a flexible budget"
        duration_text = f"{duration} day" if duration == 1 else f"{duration} days" if duration else "a flexible duration"
        destination_text = destination or "your destination"
        reply = (
            f"I can help plan {duration_text} in {destination_text} with {budget_text}. "
            "Create or update a planner draft to generate flights, hotels, cars, itinerary details, and trip guidance."
        )
        sources = []
        if destination:
            sources.append({"source": destination, "doc_type": "planning_request"})
        return PlannerReply(reply=reply, mode="planning", sources=sources)

    def _try_inventory_reply(self, message: str, inventory_request: dict[str, Any] | None = None) -> PlannerReply | None:
        inventory_request = inventory_request or parse_inventory_request(message)
        if inventory_request is None:
            return None

        item_type = inventory_request["type"]
        passengers = inventory_request["passengers"]
        destination = inventory_request.get("destination")
        origin = inventory_request.get("origin")
        preferences = inventory_request.get("preferences", {})

        try:
            if item_type == "flight":
                results = self.inventory_service.search_flights(
                    origin=origin,
                    destination=destination,
                    passengers=passengers,
                    preferences=preferences,
                )
                reply = build_inventory_reply("flight", results, origin=origin, destination=destination)
            elif item_type == "hotel":
                results = self.inventory_service.search_hotels(
                    destination=destination,
                    passengers=passengers,
                    preferences=preferences,
                )
                reply = build_inventory_reply("hotel", results, destination=destination)
            else:
                results = self.inventory_service.search_cars(
                    destination=destination,
                    passengers=passengers,
                    preferences=preferences,
                )
                reply = build_inventory_reply("car", results, destination=destination)
        except Exception as exc:  # pragma: no cover
            logger.warning("Inventory lookup failed, falling back to KB/fallback chat: %s", exc)
            return None

        if not reply:
            return None

        sources = [
            {
                "source": f"{item_type}_provider",
                "doc_type": result.get("provider") or "database",
            }
            for result in results[:3]
        ]
        return PlannerReply(reply=reply, mode="inventory", sources=sources)

    def _try_rag_reply(self, message: str, history: list[dict]) -> PlannerReply | None:
        if not self.rag_service.is_configured():
            return None

        try:
            reply, documents = self.rag_service.answer_question(message, history)
        except BaseException as exc:  # pragma: no cover
            logger.warning("Planner RAG unavailable, falling back to static planner replies: %s", exc)
            return None

        sources = []
        for document in documents:
            source = document.metadata.get("source")
            doc_type = document.metadata.get("type") or document.metadata.get("doc_type")
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

    def build_trip_plan(
        self,
        session: PlannerSessions,
        payload: dict[str, Any],
        *,
        include_insights: bool = True,
    ) -> ItineraryDrafts:
        preferences = payload.get("preferences") or session.trip_preferences or {}
        raw_origin = payload.get("origin") or session.origin
        raw_destination = payload.get("destination") or session.destination
        origin = clean_location(raw_origin)
        destination = clean_location(raw_destination)
        flight_origin = normalize_flight_location(raw_origin)
        flight_destination = normalize_flight_location(raw_destination)
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

        passengers = parse_int_value(payload.get("passengers")) or session.passengers or 1
        budget = parse_decimal_value(payload.get("budget"))
        if budget is None:
            budget = session.budget
        trip_type = str(preferences.get("trip_type") or payload.get("trip_type") or "Flexible getaway")
        from api.services.agent_orchestrator import PlannerAgentOrchestrator

        orchestrator = PlannerAgentOrchestrator()
        orchestration = orchestrator.build_plan(
            session=session,
            payload=payload,
            preferences=preferences,
        )

        summary = orchestrator.build_summary(
            destination=destination,
            trip_type=trip_type,
            orchestration=orchestration,
        )
        ai_metadata = {
            **orchestrator.to_ai_metadata(orchestration, preferences),
            "insights_ready": include_insights,
        }
        estimated_total = orchestration.pricing["grand_total"]

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
            selected_flight=make_json_safe(orchestration.selected_flight),
            selected_return_flight=make_json_safe(orchestration.selected_return_flight),
            selected_hotel=make_json_safe(orchestration.selected_hotel),
            selected_car=make_json_safe(orchestration.selected_car),
            flight_options=make_json_safe(orchestration.outbound_flights),
            return_flight_options=make_json_safe(orchestration.return_flights),
            hotel_options=make_json_safe(orchestration.hotels),
            car_options=make_json_safe(orchestration.cars),
            ai_metadata=ai_metadata,
        )

    def enrich_draft(self, draft: ItineraryDrafts) -> ItineraryDrafts:
        metadata = draft.ai_metadata or {}
        preferences = metadata.get("preferences") or draft.session.trip_preferences or {}
        trip_type = str(preferences.get("trip_type") or preferences.get("tripType") or "Flexible getaway")
        seat_class = str(preferences.get("seat_class") or preferences.get("seatClass") or "Economy")
        nights = max(((draft.return_date or draft.departure_date) - draft.departure_date).days, 1) if draft.departure_date else 1
        history = [
            {"role": message.role, "content": message.content}
            for message in draft.session.messages.all()[:8]
        ]

        itinerary = self._generate_itinerary(
            destination=draft.destination,
            origin=draft.origin,
            nights=nights,
            trip_type=trip_type,
            budget=draft.budget,
            history=history,
        )
        knowledge = self._build_trip_guidance(
            origin=draft.origin,
            destination=draft.destination,
            seat_class=seat_class,
            trip_type=trip_type,
        )
        quality = build_quality_score(
            itinerary=itinerary,
            selected_flight=draft.selected_flight,
            selected_hotel=draft.selected_hotel,
            selected_car=draft.selected_car,
            knowledge=knowledge,
        )

        draft.ai_metadata = {
            **metadata,
            "insights_ready": True,
            "itinerary": itinerary,
            "visa_info": knowledge["visa_info"],
            "baggage_info": knowledge["baggage_info"],
            "destination_brief": knowledge["destination_brief"],
            "quality_score": make_json_safe(quality),
        }
        draft.save(update_fields=["ai_metadata", "updated_at"])
        return draft

    def revalidate_draft(self, draft: ItineraryDrafts) -> ItineraryDrafts:
        metadata = draft.ai_metadata or {}
        preferences = metadata.get("preferences") or {}
        context = ProviderSearchContext(
            origin=normalize_flight_location(draft.origin),
            destination=normalize_flight_location(draft.destination),
            passengers=draft.passengers or 1,
            preferences={
                **preferences,
                "checkin_date": draft.departure_date.isoformat() if draft.departure_date else None,
                "checkout_date": draft.return_date.isoformat() if draft.return_date else None,
            },
        )

        revalidation = {
            "flight": self._revalidate_option("flight", draft.selected_flight or {}, context),
            "return_flight": self._revalidate_option("flight", draft.selected_return_flight or {}, context)
            if draft.selected_return_flight
            else None,
            "hotel": self._revalidate_option("hotel", draft.selected_hotel or {}, context),
            "car": self._revalidate_option("car", draft.selected_car or {}, context),
        }

        draft.ai_metadata = {
            **metadata,
            "revalidation": make_json_safe(revalidation),
        }
        draft.status = "validated" if all(
            result is None or result.get("available")
            for result in revalidation.values()
        ) else "requires_review"
        draft.save(update_fields=["ai_metadata", "status", "updated_at"])
        return draft

    def _revalidate_option(
        self,
        option_type: str,
        option: dict[str, Any],
        context: ProviderSearchContext,
    ) -> dict[str, Any]:
        if not option:
            return {
                "provider": "unavailable",
                "available": False,
                "status": "missing_selection",
            }

        provider_name = str(option.get("provider") or "").strip().lower()
        provider = self._get_revalidation_provider(option_type, provider_name)
        return provider.revalidate(option, context)

    def _get_revalidation_provider(self, option_type: str, provider_name: str):
        if option_type == "flight":
            if provider_name == "local_db":
                return self.inventory_service.flight_fallback_provider
            if provider_name == "mock_provider":
                return self.inventory_service.flight_mock_provider
            return self.flight_provider

        if option_type == "hotel":
            if provider_name == "local_db":
                return self.inventory_service.hotel_fallback_provider
            if provider_name == "mock_provider":
                return self.inventory_service.hotel_mock_provider
            return self.hotel_provider

        if provider_name == "local_db":
            return self.inventory_service.car_fallback_provider
        if provider_name == "mock_provider":
            return self.inventory_service.car_mock_provider
        return self.car_provider

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

        pricing = calculate_pricing(
            selected_flight=draft.selected_flight,
            selected_return_flight=draft.selected_return_flight,
            selected_hotel=draft.selected_hotel,
            selected_car=draft.selected_car,
            departure_date=draft.departure_date,
            return_date=draft.return_date,
            passengers=draft.passengers or 1,
        )
        draft.estimated_total = pricing["grand_total"]
        draft.status = "draft"
        draft.ai_metadata = {
            **(draft.ai_metadata or {}),
            "pricing": make_json_safe(pricing),
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

    def _build_trip_guidance(
        self,
        *,
        origin: str | None,
        destination: str | None,
        seat_class: str,
        trip_type: str,
    ) -> dict[str, Any]:
        fallback = {
            "visa_info": "Visa guidance is currently unavailable. Please verify entry requirements before travel.",
            "baggage_info": "Baggage guidance is currently unavailable. Please confirm baggage allowances before booking.",
            "destination_brief": f"{destination or 'This destination'} looks like a strong fit for a {trip_type.lower()} trip.",
            "sources": [],
        }
        if not self.rag_service.is_configured() or not destination:
            return fallback

        questions = {
            "visa_info": f"Visa requirements for {origin or 'travellers'} to {destination}",
            "baggage_info": f"SkyBook baggage policy for {seat_class}",
            "destination_brief": f"Top highlights and travel tips for {destination}",
        }
        answers: dict[str, Any] = {"sources": []}

        for key, question in questions.items():
            try:
                answer, docs = self.rag_service.answer_question(question)
            except Exception as exc:  # pragma: no cover
                logger.warning("Trip guidance lookup failed for %s: %s", key, exc)
                answers[key] = fallback[key]
                continue

            answers[key] = answer
            answers["sources"].extend(
                {"source": doc.metadata.get("source"), "doc_type": doc.metadata.get("type")}
                for doc in docs[:2]
                if doc.metadata.get("source") or doc.metadata.get("type")
            )

        return {**fallback, **answers}

    def _generate_itinerary(
        self,
        *,
        destination: str | None,
        origin: str | None,
        nights: int,
        trip_type: str,
        budget: Decimal | None,
        history: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        fallback = build_fallback_itinerary(destination=destination, nights=nights, trip_type=trip_type)
        if not self.llm.is_configured() or not destination:
            return fallback

        budget_label = describe_budget(budget)
        history_text = "\n".join(
            f"{message.get('role', 'user')}: {message.get('content', '')}" for message in history[-4:]
        )
        prompt = f"""Create a {nights}-night SkyBook trip itinerary.
Origin: {origin or 'Traveller'}
Destination: {destination}
Trip type: {trip_type}
Budget level: {budget_label}
Recent conversation:
{history_text}

Return valid JSON only as an array. Each item must include:
- day
- title
- morning
- afternoon
- evening
- highlights
- estimated_local_spend
"""
        try:
            raw = self._chat_json(prompt)
            itinerary = json.loads(raw)
            if isinstance(itinerary, list) and itinerary:
                return itinerary
        except Exception as exc:  # pragma: no cover
            logger.warning("Itinerary generation failed, using fallback itinerary: %s", exc)
        return fallback

    @retry(wait=wait)
    def _chat_json(self, prompt: str) -> str:
        content = self.llm.chat([{"role": "user", "content": prompt}], json_mode=True) or "{}"
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "itinerary" in parsed and isinstance(parsed["itinerary"], list):
            return json.dumps(parsed["itinerary"])
        if isinstance(parsed, list):
            return json.dumps(parsed)
        raise ValueError("Unexpected itinerary response shape")

    def _safe_inventory_search(
        self,
        inventory_type: str,
        **kwargs,
    ) -> list[dict[str, Any]]:
        try:
            if inventory_type == "flight":
                return self.inventory_service.search_flights(**kwargs)
            if inventory_type == "hotel":
                return self.inventory_service.search_hotels(**kwargs)
            return self.inventory_service.search_cars(**kwargs)
        except Exception as exc:  # pragma: no cover
            logger.warning("%s search failed during trip planning: %s", inventory_type, exc)
            return []

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


def build_fallback_ai_chat_reply(message: str) -> str:
    parsed_plan = parse_prompt_trip_request(message)
    if parsed_plan:
        destination = parsed_plan["destination"]
        duration = parsed_plan["duration"]
        budget = parsed_plan["budget"]
        return (
            f"I picked up a plan request for {destination}, around {duration} days, with a budget near ${budget}. "
            "Use the planner flow to generate flights, hotels, cars, and a day-by-day trip draft."
        )

    return (
        "I can help with SkyBook trip planning, destination guidance, visa and baggage questions, "
        "and package recommendations. Ask a travel-specific question and I will help."
    )


def classify_planner_intent(
    message: str,
    history: list[dict[str, Any]] | None = None,
    conversation_context: PlannerConversationContext | None = None,
) -> PlannerIntent:
    history = history or []
    conversation_context = conversation_context or build_planner_conversation_context(history)
    explicit_inventory_request = parse_inventory_request(message)
    explicit_plan_request = parse_prompt_trip_request(message) or {}
    inventory_request = merge_inventory_request_with_context(
        explicit_inventory_request,
        message,
        conversation_context,
    )
    plan_request = merge_plan_request_with_context(
        explicit_plan_request,
        conversation_context,
    )
    lower = " ".join(str(message or "").strip().lower().split())

    planning_terms = {
        "itinerary",
        "plan",
        "planner",
        "schedule",
        "recommend",
        "recommendation",
        "trip",
        "vacation",
        "holiday",
        "honeymoon",
        "bundle",
        "package",
    }
    knowledge_terms = {
        "visa",
        "baggage",
        "policy",
        "policies",
        "rules",
        "allowance",
        "destination",
        "guide",
        "weather",
        "attractions",
        "loyalty",
        "refund",
        "cancellation",
    }
    inventory_terms = {
        "available",
        "availability",
        "show",
        "find",
        "search",
        "price",
        "prices",
        "book",
        "options",
    }
    tokens = set(re.findall(r"[a-zA-Z]{3,}", lower))
    recent_text = " ".join(str(item.get("content", "")).lower() for item in history[-4:])

    explicit_planning_signal = bool(explicit_plan_request) or bool(planning_terms.intersection(tokens))
    planning_follow_up_signal = any(term in tokens for term in {"business", "economy", "budget", "luxury"}) and any(
        term in recent_text for term in planning_terms
    )

    if explicit_planning_signal and plan_request and (
        plan_request.get("destination") or plan_request.get("duration") or plan_request.get("budget")
    ):
        return PlannerIntent(kind="planning", inventory_request=inventory_request, plan_request=plan_request)

    if inventory_request:
        has_planning_language = bool(planning_terms.intersection(tokens))
        has_inventory_language = bool(inventory_terms.intersection(tokens))
        in_planning_thread = any(term in recent_text for term in planning_terms)
        if has_planning_language and not has_inventory_language:
            return PlannerIntent(kind="planning", inventory_request=inventory_request)
        if in_planning_thread and any(term in tokens for term in {"itinerary", "bundle", "package", "recommend"}):
            return PlannerIntent(kind="planning", inventory_request=inventory_request)
        return PlannerIntent(kind="inventory", inventory_request=inventory_request)

    if knowledge_terms.intersection(tokens):
        return PlannerIntent(kind="knowledge")

    if planning_follow_up_signal:
        return PlannerIntent(kind="planning", plan_request=plan_request)

    if explicit_planning_signal:
        return PlannerIntent(kind="planning", plan_request=plan_request)

    return PlannerIntent(kind="fallback")


def build_planner_conversation_context(history: list[dict[str, Any]] | None) -> PlannerConversationContext:
    history = history or []
    context = PlannerConversationContext()
    for item in history[-8:]:
        content = str(item.get("content", "")).strip()
        if not content:
            continue

        inventory_request = parse_inventory_request(content)
        if inventory_request:
            context.origin = inventory_request.get("origin") or context.origin
            context.destination = inventory_request.get("destination") or context.destination
            context.passengers = inventory_request.get("passengers") or context.passengers
            preferences = inventory_request.get("preferences") or {}
            context.seat_class = preferences.get("seat_class") or context.seat_class
            context.hotel_style = preferences.get("hotel_style") or context.hotel_style
            context.car_type = preferences.get("car_type") or context.car_type

        plan_request = parse_prompt_trip_request(content)
        if plan_request:
            context.destination = plan_request.get("destination") or context.destination
            context.duration = plan_request.get("duration") or context.duration
            context.budget = plan_request.get("budget") or context.budget

        lower = content.lower()
        if "business" in lower:
            context.seat_class = "Business"
        elif "economy" in lower:
            context.seat_class = "Economy"
        if "luxury" in lower:
            context.hotel_style = "luxury"
        elif "budget hotel" in lower or "budget stay" in lower:
            context.hotel_style = "budget"
        if "suv" in lower:
            context.car_type = "SUV"
        elif "sedan" in lower:
            context.car_type = "Sedan"
    return context


def merge_inventory_request_with_context(
    inventory_request: dict[str, Any] | None,
    message: str,
    conversation_context: PlannerConversationContext,
) -> dict[str, Any] | None:
    lower = str(message or "").lower()
    if inventory_request is None:
        inferred_type = None
        if any(term in lower for term in ["hotel", "stay", "room", "rooms", "resort"]):
            inferred_type = "hotel"
        elif any(term in lower for term in ["car", "rental", "vehicle"]):
            inferred_type = "car"
        elif any(term in lower for term in ["flight", "fly", "route"]):
            inferred_type = "flight"
        if inferred_type is None:
            return None
        inventory_request = {
            "type": inferred_type,
            "origin": None,
            "destination": None,
            "passengers": conversation_context.passengers or 1,
            "preferences": {},
        }

    request = {
        **inventory_request,
        "origin": inventory_request.get("origin") or conversation_context.origin,
        "destination": inventory_request.get("destination") or conversation_context.destination,
        "passengers": inventory_request.get("passengers") or conversation_context.passengers or 1,
        "preferences": {
            **(inventory_request.get("preferences") or {}),
        },
    }
    preferences = request["preferences"]
    if request["type"] == "flight" and conversation_context.seat_class and "seat_class" not in preferences:
        preferences["seat_class"] = conversation_context.seat_class
    if request["type"] == "hotel" and conversation_context.hotel_style and "hotel_style" not in preferences:
        preferences["hotel_style"] = conversation_context.hotel_style
    if request["type"] == "car" and conversation_context.car_type and "car_type" not in preferences:
        preferences["car_type"] = conversation_context.car_type

    if request["type"] == "flight" and (not request.get("origin") or not request.get("destination")):
        return None
    if request["type"] in {"hotel", "car"} and not request.get("destination"):
        return None
    return request


def merge_plan_request_with_context(
    plan_request: dict[str, Any],
    conversation_context: PlannerConversationContext,
) -> dict[str, Any]:
    merged = dict(plan_request or {})
    if not merged.get("destination"):
        merged["destination"] = conversation_context.destination
    if not merged.get("duration"):
        merged["duration"] = conversation_context.duration
    if not merged.get("budget"):
        merged["budget"] = conversation_context.budget
    if conversation_context.origin and "origin" not in merged:
        merged["origin"] = conversation_context.origin
    if conversation_context.passengers and "passengers" not in merged:
        merged["passengers"] = conversation_context.passengers
    if conversation_context.seat_class and "seat_class" not in merged:
        merged["seat_class"] = conversation_context.seat_class
    return merged


def parse_inventory_request(message: str) -> dict[str, Any] | None:
    text = " ".join(str(message or "").strip().split())
    lower = text.lower()

    item_type = None
    if any(term in lower for term in ["flight", "flights", "fly", "route"]):
        item_type = "flight"
    elif any(term in lower for term in ["hotel", "stay", "stays", "room", "rooms", "resort"]):
        item_type = "hotel"
    elif any(term in lower for term in ["car", "cars", "rental", "rent a car", "vehicle"]):
        item_type = "car"

    if item_type is None:
        return None

    trigger_terms = ["available", "availability", "show", "find", "search", "price", "prices", "option", "options", "book"]
    if not any(term in lower for term in trigger_terms):
        return None

    passengers_match = re.search(r"(\d+)\s+(?:passenger|passengers|people|travellers|travelers)", lower)
    passengers = int(passengers_match.group(1)) if passengers_match else 1

    destination = None
    origin = None
    route_match = re.search(r"from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+)", text, re.IGNORECASE)
    if route_match:
        origin = clean_location(route_match.group(1))
        destination = clean_location(
            re.split(r"\bfor\b|\bin\b|\bwith\b|\bunder\b", route_match.group(2), maxsplit=1, flags=re.IGNORECASE)[0]
        )
    else:
        destination_match = re.search(r"(?:in|to)\s+([a-zA-Z\s]+)", text, re.IGNORECASE)
        if destination_match:
            destination = clean_location(destination_match.group(1))

    preferences: dict[str, Any] = {}
    if "business" in lower:
        preferences["seat_class"] = "Business"
    elif item_type == "flight":
        preferences["seat_class"] = "Economy"

    if item_type == "hotel":
        if "luxury" in lower:
            preferences["hotel_style"] = "luxury"
        elif "budget" in lower:
            preferences["hotel_style"] = "budget"
        elif "family" in lower:
            preferences["hotel_style"] = "family friendly"

    if item_type == "car":
        if "suv" in lower:
            preferences["car_type"] = "SUV"
        elif "sedan" in lower:
            preferences["car_type"] = "Sedan"
        elif "premium" in lower or "luxury" in lower:
            preferences["car_type"] = "Premium"

    if item_type == "flight" and (not origin or not destination):
        return None
    if item_type in {"hotel", "car"} and not destination:
        return None

    return {
        "type": item_type,
        "origin": origin,
        "destination": destination,
        "passengers": passengers,
        "preferences": preferences,
    }


def build_inventory_reply(item_type: str, results: list[dict[str, Any]], *, origin: str | None = None, destination: str | None = None) -> str:
    if not results:
        if item_type == "flight":
            return f"I couldn't find a matching SkyBook flight from {origin or 'the selected origin'} to {destination or 'the selected destination'} right now."
        if item_type == "hotel":
            return f"I couldn't find a matching hotel in {destination or 'that destination'} right now."
        return f"I couldn't find a matching rental car in {destination or 'that destination'} right now."

    lines = []
    if item_type == "flight":
        intro = f"Here are the top live flight options I found from {origin} to {destination}:"
        for option in results[:3]:
            lines.append(
                f"- {option.get('flight_number') or option.get('code')}: "
                f"{option.get('departure_time_display') or option.get('departure')} to "
                f"{option.get('arrival_time_display') or option.get('arrival')}, "
                f"{option.get('duration_display') or option.get('duration')}, "
                f"${option.get('display_price') or option.get('price')}"
            )
    elif item_type == "hotel":
        intro = f"Here are the top hotel options I found in {destination}:"
        for option in results[:3]:
            lines.append(
                f"- {option.get('hotel_name')}: rating {option.get('rating') or 'N/A'}, "
                f"${option.get('price_per_night')}/night"
            )
    else:
        intro = f"Here are the top rental car options I found in {destination}:"
        for option in results[:3]:
            lines.append(
                f"- {option.get('company')} {option.get('car_model')}: "
                f"{option.get('car_type') or 'Standard'}, "
                f"${option.get('price_per_day')}/day"
            )

    return intro + "\n" + "\n".join(lines)


def parse_prompt_trip_request(message: str) -> dict[str, Any] | None:
    text = message.lower()
    planning_markers = ["trip to", "plan", "itinerary", "vacation", "holiday", "honeymoon", "package", "bundle"]
    if not any(marker in text for marker in planning_markers):
        return None

    destination_match = re.search(r"to\s+([a-zA-Z\s]+?)(?:\s+for|\s+under|$)", message, re.IGNORECASE)
    duration_match = re.search(r"(\d+)\s*day", text)
    budget_match = re.search(r"(?:under|budget(?: of)?|for)\s+\$?\s*([0-9][0-9,]*)", message, re.IGNORECASE)

    if not destination_match and not duration_match and not budget_match:
        return None

    destination = destination_match.group(1).strip().title() if destination_match else None
    duration = int(duration_match.group(1)) if duration_match else None
    budget = int(budget_match.group(1).replace(",", "")) if budget_match else None

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


def normalize_flight_location(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    code_match = re.search(r"\(([A-Za-z]{3})\)\s*$", text)
    if code_match:
        return code_match.group(1).upper()

    return clean_location(text)


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


def describe_budget(budget: Decimal | None) -> str:
    if budget is None:
        return "flexible"
    if budget < Decimal("1500"):
        return "budget-conscious"
    if budget < Decimal("4000"):
        return "mid-range"
    if budget < Decimal("7000"):
        return "premium"
    return "luxury"


def _decimal_from_value(value: Any) -> Decimal:
    if value in [None, ""]:
        return Decimal("0")
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def calculate_pricing(
    *,
    selected_flight: dict[str, Any] | None,
    selected_return_flight: dict[str, Any] | None,
    selected_hotel: dict[str, Any] | None,
    selected_car: dict[str, Any] | None,
    departure_date,
    return_date,
    passengers: int,
) -> dict[str, Decimal]:
    nights = max((return_date - departure_date).days, 1)
    flight_cost = _decimal_from_value(
        (selected_flight or {}).get("display_price") or (selected_flight or {}).get("price")
    ) * passengers
    return_flight_cost = _decimal_from_value(
        (selected_return_flight or {}).get("display_price") or (selected_return_flight or {}).get("price")
    ) * passengers
    hotel_cost = _decimal_from_value((selected_hotel or {}).get("price_per_night")) * nights
    car_cost = _decimal_from_value((selected_car or {}).get("price_per_day")) * nights
    subtotal = flight_cost + return_flight_cost + hotel_cost + car_cost
    bundle_items = sum(1 for item in [selected_flight, selected_hotel, selected_car] if item)
    discount = subtotal * Decimal("0.12") if bundle_items == 3 else Decimal("0")
    taxes = subtotal * Decimal("0.10")
    grand_total = subtotal - discount + taxes
    miles_earned = grand_total.quantize(Decimal("0.01"))

    return {
        "flight_cost": flight_cost.quantize(Decimal("0.01")),
        "return_flight_cost": return_flight_cost.quantize(Decimal("0.01")),
        "hotel_cost": hotel_cost.quantize(Decimal("0.01")),
        "car_cost": car_cost.quantize(Decimal("0.01")),
        "subtotal": subtotal.quantize(Decimal("0.01")),
        "bundle_discount": discount.quantize(Decimal("0.01")),
        "taxes": taxes.quantize(Decimal("0.01")),
        "grand_total": grand_total.quantize(Decimal("0.01")),
        "miles_earned": miles_earned,
    }


def build_draft_summary(
    *,
    destination: str | None,
    trip_type: str,
    estimated_total: Decimal,
    pricing: dict[str, Decimal],
    flights: list[dict],
    hotels: list[dict],
    cars: list[dict],
) -> str:
    return (
        f"Prepared an AI-assisted {trip_type.lower()} trip for {destination or 'your selected destination'} with "
        f"{len(flights)} outbound flight option(s), {len(hotels)} hotel option(s), and {len(cars)} car option(s). "
        f"Estimated total after pricing adjustments is ${estimated_total}, including ${pricing['bundle_discount']} in bundle savings where applicable."
    )


def build_recommendation_reason(budget: Decimal | None, estimated_total: Decimal, destination: str | None) -> str:
    if budget is not None and estimated_total <= budget:
        return f"The recommended bundle for {destination or 'this destination'} fits within the current budget."
    if budget is not None:
        return f"The recommended bundle for {destination or 'this destination'} is the closest strong match to the current budget."
    return f"The recommended bundle for {destination or 'this destination'} is based on overall value and coverage."


def build_fallback_itinerary(*, destination: str | None, nights: int, trip_type: str) -> list[dict[str, Any]]:
    safe_destination = destination or "your destination"
    itinerary = []
    for day in range(1, nights + 1):
        itinerary.append(
            {
                "day": day,
                "title": f"Day {day} in {safe_destination}",
                "morning": f"Start the day with a relaxed {trip_type.lower()} activity in {safe_destination}.",
                "afternoon": "Visit a central neighborhood, attraction, or cultural site nearby.",
                "evening": "Wrap up with a scenic dinner plan and time to explore the local area.",
                "highlights": [safe_destination, trip_type],
                "estimated_local_spend": "$50-90",
            }
        )
    return itinerary


def build_quality_score(
    *,
    itinerary: list[dict[str, Any]],
    selected_flight: dict[str, Any] | None,
    selected_hotel: dict[str, Any] | None,
    selected_car: dict[str, Any] | None,
    knowledge: dict[str, Any],
) -> dict[str, Any]:
    score = 10
    issues: list[str] = []

    if not itinerary:
        score -= 2
        issues.append("Itinerary generation is missing.")
    if not selected_flight:
        score -= 2
        issues.append("No outbound flight recommendation available.")
    if not selected_hotel:
        score -= 2
        issues.append("No hotel recommendation available.")
    if not selected_car:
        score -= 1
        issues.append("No car recommendation available.")
    if not knowledge.get("visa_info"):
        score -= 1
        issues.append("Visa guidance is missing.")
    if not knowledge.get("baggage_info"):
        score -= 1
        issues.append("Baggage guidance is missing.")

    score = max(score, 1)
    summary = "Excellent trip draft." if score >= 9 else "Good trip draft with a few gaps." if score >= 7 else "Draft needs review."
    return {"score": score, "issues": issues, "summary": summary}


def build_fast_guidance_fallback(*, destination: str | None, trip_type: str) -> dict[str, Any]:
    return {
        "visa_info": "Detailed visa guidance is loading.",
        "baggage_info": "Detailed baggage guidance is loading.",
        "destination_brief": f"{destination or 'This destination'} looks like a strong fit for a {trip_type.lower()} trip.",
        "sources": [],
    }


def make_json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict):
        return {str(key): make_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [make_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [make_json_safe(item) for item in value]
    return value
