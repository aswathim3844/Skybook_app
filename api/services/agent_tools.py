from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone

from api.models import Bookings, Customers
from api.services.inventory_service import InventoryService
from api.services.providers import ProviderSearchContext
from api.services.rag_service import RagService

try:  # pragma: no cover - optional until the Agents SDK is installed
    from agents import function_tool as _function_tool
except Exception:  # pragma: no cover
    def _function_tool(func):
        return func


@dataclass
class AgentToolResult:
    ok: bool
    message: str
    data: dict[str, Any]

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=True, default=str)


class DjangoAgentTools:
    """SDK-ready wrappers around the existing Django services."""

    def __init__(self) -> None:
        self.inventory_service = InventoryService()
        self.rag_service = RagService()

    def search_flights(
        self,
        *,
        origin: str | None,
        destination: str | None,
        passengers: int = 1,
        seat_class: str = "Economy",
        max_price: float | None = None,
        force_refresh: bool = False,
    ) -> AgentToolResult:
        preferences: dict[str, Any] = {"seat_class": seat_class}
        if max_price is not None:
            preferences["max_price"] = max_price

        results = self.inventory_service.search_flights(
            origin=origin,
            destination=destination,
            passengers=passengers,
            preferences=preferences,
            force_refresh=force_refresh,
        )
        return AgentToolResult(
            ok=True,
            message=f"Found {len(results)} flight options.",
            data={
                "origin": origin,
                "destination": destination,
                "passengers": passengers,
                "seat_class": seat_class,
                "results": results,
            },
        )

    def search_hotels(
        self,
        *,
        destination: str | None,
        passengers: int = 1,
        max_price: float | None = None,
        min_rating: float | None = None,
        force_refresh: bool = False,
    ) -> AgentToolResult:
        preferences: dict[str, Any] = {}
        if max_price is not None:
            preferences["max_price"] = max_price
        if min_rating is not None:
            preferences["min_rating"] = min_rating

        results = self.inventory_service.search_hotels(
            destination=destination,
            passengers=passengers,
            preferences=preferences,
            force_refresh=force_refresh,
        )
        if results and not any(self._hotel_has_usable_price(item) for item in results):
            fallback_context = ProviderSearchContext(
                destination=destination,
                passengers=passengers,
                preferences=preferences,
            )
            fallback_results = self.inventory_service.hotel_fallback_provider.search(fallback_context)
            if fallback_results:
                results = self.inventory_service._normalize_results(
                    "hotel",
                    fallback_results,
                    source="database",
                )
        return AgentToolResult(
            ok=True,
            message=f"Found {len(results)} hotel options.",
            data={
                "destination": destination,
                "passengers": passengers,
                "results": results,
            },
        )

    def search_cars(
        self,
        *,
        destination: str | None,
        passengers: int = 1,
        max_price: float | None = None,
        car_type: str | None = None,
        force_refresh: bool = False,
    ) -> AgentToolResult:
        preferences: dict[str, Any] = {}
        if max_price is not None:
            preferences["max_price"] = max_price
        if car_type:
            preferences["car_type"] = car_type

        results = self.inventory_service.search_cars(
            destination=destination,
            passengers=passengers,
            preferences=preferences,
            force_refresh=force_refresh,
        )
        return AgentToolResult(
            ok=True,
            message=f"Found {len(results)} car options.",
            data={
                "destination": destination,
                "passengers": passengers,
                "results": results,
            },
        )

    def ask_knowledge_base(self, question: str, history: list[dict[str, Any]] | None = None) -> AgentToolResult:
        answer, sources = self.rag_service.answer_question(question, history or [])
        normalized_sources = [
            {
                "source": item.metadata.get("source"),
                "doc_type": item.metadata.get("type") or item.metadata.get("doc_type"),
                "title": item.metadata.get("title"),
            }
            for item in sources
        ]
        return AgentToolResult(
            ok=True,
            message="Knowledge base answer generated.",
            data={"question": question, "answer": answer, "sources": normalized_sources},
        )

    def create_booking(
        self,
        *,
        name: str,
        email: str,
        outbound_date: str,
        return_date: str | None = None,
        passengers: int = 1,
        seat_class: str = "Economy",
        flight_id: int | None = None,
        return_flight_id: int | None = None,
        hotel_id: int | None = None,
        car_id: int | None = None,
        total_price: float | None = None,
        booking_metadata: dict[str, Any] | None = None,
    ) -> AgentToolResult:
        customer = Customers.objects.filter(email=(email or "").strip().lower()).first()
        if customer is None:
            customer = Customers.objects.create(
                name=(name or email.split("@")[0]).strip() or "Customer",
                email=(email or "").strip().lower(),
                created_at=timezone.now(),
            )

        outbound_value = date.fromisoformat(outbound_date)
        if return_date:
            return_value = date.fromisoformat(return_date)
        else:
            return_value = outbound_value + timedelta(days=1)

        booking = Bookings.objects.create(
            customer=customer,
            flight_id=flight_id,
            return_flight_id=return_flight_id,
            hotel_id=hotel_id,
            car_id=car_id,
            outbound_date=outbound_value,
            return_date=return_value,
            is_bundle=bool(return_flight_id or hotel_id or car_id),
            total_price=Decimal(str(total_price)) if total_price is not None else None,
            booking_status="Confirmed",
            passengers=passengers,
            seat_class=seat_class,
            booking_metadata=booking_metadata or {},
            created_at=timezone.now(),
        )
        return AgentToolResult(
            ok=True,
            message="Booking created.",
            data={
                "booking_id": booking.booking_id,
                "customer_id": customer.customer_id,
                "total_price": str(booking.total_price or ""),
            },
        )

    def _hotel_has_usable_price(self, hotel: dict[str, Any]) -> bool:
        direct_values = [
            hotel.get("price_per_night"),
            hotel.get("price"),
            hotel.get("price_confirmed"),
            (hotel.get("provider_metadata") or {}).get("price_per_night"),
            (hotel.get("provider_metadata") or {}).get("price"),
        ]
        for value in direct_values:
            try:
                if float(value) > 0:
                    return True
            except (TypeError, ValueError):
                continue
        return False


_tools = DjangoAgentTools()


@_function_tool
def agent_search_flights(
    origin: str,
    destination: str,
    passengers: int = 1,
    seat_class: str = "Economy",
    max_price: float | None = None,
    force_refresh: bool = False,
) -> str:
    return _tools.search_flights(
        origin=origin,
        destination=destination,
        passengers=passengers,
        seat_class=seat_class,
        max_price=max_price,
        force_refresh=force_refresh,
    ).to_json()


@_function_tool
def agent_search_hotels(
    destination: str,
    passengers: int = 1,
    max_price: float | None = None,
    min_rating: float | None = None,
    force_refresh: bool = False,
) -> str:
    return _tools.search_hotels(
        destination=destination,
        passengers=passengers,
        max_price=max_price,
        min_rating=min_rating,
        force_refresh=force_refresh,
    ).to_json()


@_function_tool
def agent_search_cars(
    destination: str,
    passengers: int = 1,
    max_price: float | None = None,
    car_type: str | None = None,
    force_refresh: bool = False,
) -> str:
    return _tools.search_cars(
        destination=destination,
        passengers=passengers,
        max_price=max_price,
        car_type=car_type,
        force_refresh=force_refresh,
    ).to_json()


@_function_tool
def agent_ask_knowledge_base(question: str) -> str:
    return _tools.ask_knowledge_base(question).to_json()


@_function_tool
def agent_create_booking(
    name: str,
    email: str,
    outbound_date: str,
    return_date: str | None = None,
    passengers: int = 1,
    seat_class: str = "Economy",
    flight_id: int | None = None,
    return_flight_id: int | None = None,
    hotel_id: int | None = None,
    car_id: int | None = None,
    total_price: float | None = None,
) -> str:
    return _tools.create_booking(
        name=name,
        email=email,
        outbound_date=outbound_date,
        return_date=return_date,
        passengers=passengers,
        seat_class=seat_class,
        flight_id=flight_id,
        return_flight_id=return_flight_id,
        hotel_id=hotel_id,
        car_id=car_id,
        total_price=total_price,
    ).to_json()
