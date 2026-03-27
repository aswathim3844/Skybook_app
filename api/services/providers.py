from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import logging
from urllib.parse import urlparse
from typing import Any

from django.conf import settings
from django.db.models import Q
import requests
from requests import HTTPError

from api.models import Cars, Flights, Hotels
from api.serializers import CarSerializer, FlightSerializer, HotelSerializer


logger = logging.getLogger(__name__)


@dataclass
class ProviderSearchContext:
    origin: str | None = None
    destination: str | None = None
    passengers: int = 1
    preferences: dict[str, Any] | None = None


class ProviderConfigurationError(RuntimeError):
    """Raised when an external provider is selected but not configured."""


class BaseProviderAdapter:
    provider_name = "local_db"
    api_key_setting = ""
    base_url_setting = ""

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        raise NotImplementedError

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        raise NotImplementedError

    def fetch_offer(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        raise NotImplementedError

    def _get_timeout(self) -> float:
        return float(getattr(settings, "PROVIDER_REQUEST_TIMEOUT_SECONDS", 15))

    def _get_base_url(self) -> str:
        return str(getattr(settings, self.base_url_setting, "") or "").strip()

    def _get_api_key(self) -> str:
        return str(getattr(settings, self.api_key_setting, "") or "").strip()

    def _build_headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        api_key = self._get_api_key()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            headers["X-API-Key"] = api_key
        return headers

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        base_url = self._get_base_url()
        if not base_url:
            raise ProviderConfigurationError(
                f"{self.provider_name} selected but {self.base_url_setting} is not configured."
            )

        url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
        response = requests.request(
            method=method,
            url=url,
            params=params,
            json=json,
            headers=self._build_headers(),
            timeout=self._get_timeout(),
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {"results": payload}

    def _get_host(self) -> str:
        base_url = self._get_base_url()
        if not base_url:
            return ""
        return urlparse(base_url).netloc


class LocalFlightProviderAdapter(BaseProviderAdapter):
    provider_name = "local_db"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        preferences = context.preferences or {}
        airline = str(preferences.get("airline") or "").strip()
        seat_class = str(preferences.get("seat_class") or "Economy").strip()

        queryset = Flights.objects.select_related("departure_airport", "arrival_airport").all()
        if context.origin:
            queryset = queryset.filter(
                Q(departure_airport__city__icontains=context.origin)
                | Q(departure_airport__city_code__icontains=context.origin)
                | Q(departure_airport__airport_name__icontains=context.origin)
            )
        if context.destination:
            queryset = queryset.filter(
                Q(arrival_airport__city__icontains=context.destination)
                | Q(arrival_airport__city_code__icontains=context.destination)
                | Q(arrival_airport__airport_name__icontains=context.destination)
            )
        if airline and airline.lower() != "any":
            queryset = queryset.filter(airline__icontains=airline)
        if context.passengers:
            queryset = queryset.filter(available_seats__gte=context.passengers)

        results = []
        for flight in queryset.order_by("base_price", "departure_time")[:3]:
            serialized = FlightSerializer(flight).data
            base_price = Decimal(str(serialized.get("price") or flight.base_price or 0))
            serialized["provider"] = self.provider_name
            serialized["provider_reference"] = f"flight:{flight.flight_id}"
            serialized["price_economy"] = f"{base_price.quantize(Decimal('0.01'))}"
            serialized["price_business"] = f"{(base_price * Decimal('1.65')).quantize(Decimal('0.01'))}"
            serialized["display_price"] = (
                serialized["price_business"]
                if seat_class.lower() == "business"
                else serialized["price_economy"]
            )
            serialized["aircraft"] = flight.flight_class or "Boeing 787"
            serialized["amenities"] = ["WiFi", "Meals", "Entertainment"]
            results.append(serialized)
        return results

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": option.get("provider_reference") or option.get("flight_id"),
            "available": bool(option),
            "price_confirmed": option.get("display_price") or option.get("price"),
            "currency": "USD",
            "status": "validated_via_local_inventory" if option else "not_found",
        }


class LocalHotelProviderAdapter(BaseProviderAdapter):
    provider_name = "local_db"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        preferences = context.preferences or {}
        hotel_style = str(preferences.get("hotel_style") or "").strip().lower()
        hotel_rating = str(preferences.get("hotel_rating") or "").strip().lower()
        hotel_amenities = preferences.get("hotel_amenities") or []

        queryset = Hotels.objects.select_related("country").all()
        if context.destination:
            queryset = queryset.filter(city__icontains=context.destination)
        for hotel_amenity in hotel_amenities:
            amenity_value = str(hotel_amenity or "").strip()
            if amenity_value:
                queryset = queryset.filter(amenities__icontains=amenity_value)

        queryset = apply_hotel_rating_filter(queryset, hotel_rating)
        queryset = apply_hotel_style_filter(queryset, hotel_style)

        results = []
        for hotel in queryset.order_by("price_per_night", "-rating")[:3]:
            serialized = HotelSerializer(hotel).data
            serialized["provider"] = self.provider_name
            serialized["provider_reference"] = f"hotel:{hotel.hotel_id}"
            serialized["amenity_list"] = split_text_list(hotel.amenities) or ["Breakfast", "WiFi", "Pool"]
            results.append(serialized)
        return results

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": option.get("provider_reference") or option.get("hotel_id"),
            "available": bool(option),
            "price_confirmed": option.get("price_per_night"),
            "currency": "USD",
            "status": "validated_via_local_inventory" if option else "not_found",
        }

    def fetch_offer(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            **option,
            "pricing_pending": False,
            "offer_lookup_required": False,
            "price_display": option.get("price_per_night"),
            "offer_status": "available",
            "offer_message": "Price confirmed from local inventory.",
        }


class LocalCarProviderAdapter(BaseProviderAdapter):
    provider_name = "local_db"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        preferences = context.preferences or {}
        car_type = str(preferences.get("car_type") or "").strip()

        queryset = Cars.objects.select_related("country").all()
        if context.destination:
            queryset = queryset.filter(city__icontains=context.destination)
        if car_type and car_type.lower() != "any":
            queryset = queryset.filter(car_type__icontains=car_type)
        if context.passengers:
            queryset = queryset.filter(car_seats__gte=context.passengers)

        results = []
        for car in queryset.order_by("price_per_day", "company")[:3]:
            serialized = CarSerializer(car).data
            serialized["provider"] = self.provider_name
            serialized["provider_reference"] = f"car:{car.car_id}"
            serialized["features"] = split_text_list(car.description) or ["Air Conditioning", "Bluetooth"]
            results.append(serialized)
        return results

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": option.get("provider_reference") or option.get("car_id"),
            "available": bool(option),
            "price_confirmed": option.get("price_per_day"),
            "currency": "USD",
            "status": "validated_via_local_inventory" if option else "not_found",
        }


class MockFlightProviderAdapter(BaseProviderAdapter):
    provider_name = "mock_provider"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        origin = context.origin or "Origin"
        destination = context.destination or "Destination"
        seat_class = str((context.preferences or {}).get("seat_class") or "Economy")
        variants = [
            {"id": 1, "flight_number": "MK101", "departure": "09:15", "arrival": "14:40", "hours": "5h 25m", "base": Decimal("420.00")},
            {"id": 2, "flight_number": "MK221", "departure": "12:10", "arrival": "17:55", "hours": "5h 45m", "base": Decimal("455.00")},
            {"id": 3, "flight_number": "MK315", "departure": "18:35", "arrival": "00:20", "hours": "5h 45m", "base": Decimal("489.00")},
        ]
        results = []
        for item in variants:
            economy = item["base"] + Decimal(context.passengers * 20)
            business = economy * Decimal("1.70")
            display = business if seat_class.lower() == "business" else economy
            results.append(
                {
                    "provider": self.provider_name,
                    "provider_reference": f"mock-flight-{origin}-{destination}-{item['id']}",
                    "flight_id": f"mock-flight-{origin}-{destination}-{item['id']}",
                    "flight_number": item["flight_number"],
                    "airline": "Mock Air",
                    "departure_city": origin,
                    "arrival_city": destination,
                    "departure_time_display": item["departure"],
                    "arrival_time_display": item["arrival"],
                    "duration_display": item["hours"],
                    "price": str(display),
                    "display_price": str(display),
                    "price_economy": str(economy),
                    "price_business": str(business),
                    "aircraft": "Airbus A321neo",
                    "amenities": ["WiFi", "Snacks", "USB Power"],
                }
            )
        return results

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": option.get("provider_reference"),
            "available": True,
            "price_confirmed": option.get("display_price") or option.get("price"),
            "currency": "USD",
            "status": "validated_via_mock_provider",
        }


class MockHotelProviderAdapter(BaseProviderAdapter):
    provider_name = "mock_provider"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        destination = context.destination or "Destination"
        variants = [
            {"id": 1, "name": f"{destination} Grand Suites", "price": "165.00", "rating": 4.6},
            {"id": 2, "name": f"{destination} Riverside Hotel", "price": "189.00", "rating": 4.7},
            {"id": 3, "name": f"{destination} Central Plaza", "price": "215.00", "rating": 4.8},
        ]
        return [
            {
                "provider": self.provider_name,
                "provider_reference": f"mock-hotel-{destination}-{item['id']}",
                "hotel_id": f"mock-hotel-{destination}-{item['id']}",
                "hotel_name": item["name"],
                "city": destination,
                "country_name": "Mockland",
                "price_per_night": item["price"],
                "rating": item["rating"],
                "description": f"A centrally located stay in {destination} with business and leisure amenities.",
                "amenity_list": ["Breakfast", "WiFi", "Airport Transfer", "Gym"],
            }
            for item in variants
        ]

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": option.get("provider_reference"),
            "available": True,
            "price_confirmed": option.get("price_per_night"),
            "currency": "USD",
            "status": "validated_via_mock_provider",
        }

    def fetch_offer(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            **option,
            "pricing_pending": False,
            "offer_lookup_required": False,
            "price_display": option.get("price_per_night"),
            "offer_status": "available",
            "offer_message": "Price confirmed from mock provider.",
        }


class MockCarProviderAdapter(BaseProviderAdapter):
    provider_name = "mock_provider"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        destination = context.destination or "Destination"
        seats = max(context.passengers, 4)
        variants = [
            {"id": 1, "company": "Mock Rentals", "model": "Touring Hybrid", "type": "SUV", "price": "58.00"},
            {"id": 2, "company": "CityMotion", "model": "Urban Compact", "type": "Sedan", "price": "49.00"},
            {"id": 3, "company": "DrivePro", "model": "Executive Plus", "type": "Premium", "price": "72.00"},
        ]
        return [
            {
                "provider": self.provider_name,
                "provider_reference": f"mock-car-{destination}-{item['id']}",
                "car_id": f"mock-car-{destination}-{item['id']}",
                "company": item["company"],
                "car_model": item["model"],
                "car_type": item["type"],
                "city": destination,
                "price_per_day": item["price"],
                "car_seats": seats,
                "features": ["Automatic", "Bluetooth", "Unlimited KM", "Free Cancellation"],
            }
            for item in variants
        ]

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": option.get("provider_reference"),
            "available": True,
            "price_confirmed": option.get("price_per_day"),
            "currency": "USD",
            "status": "validated_via_mock_provider",
        }


class ExternalFlightProviderAdapter(BaseProviderAdapter):
    provider_name = getattr(settings, "FLIGHT_PROVIDER", "external")
    api_key_setting = "FLIGHT_PROVIDER_API_KEY"
    base_url_setting = "FLIGHT_PROVIDER_BASE_URL"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        if "serpapi.com" in self._get_base_url():
            params = {
                "engine": "google_flights",
                "departure_id": context.origin,
                "arrival_id": context.destination,
                "outbound_date": (context.preferences or {}).get("departure_date"),
                "return_date": (context.preferences or {}).get("return_date"),
                "type": "1" if (context.preferences or {}).get("return_date") else "2",
                "adults": max(int(context.passengers or 1), 1),
                "travel_class": self._map_serpapi_travel_class((context.preferences or {}).get("seat_class")),
                "currency": "USD",
                "hl": "en",
                "api_key": self._get_api_key(),
            }
            params = {key: value for key, value in params.items() if value not in [None, ""]}
            payload = self._request_json("GET", "/search.json", params=params)
            return self._normalize_serpapi_results(payload, context)

        payload = self._request_json(
            "GET",
            "/search/flights",
            params={
                "origin": context.origin,
                "destination": context.destination,
                "passengers": context.passengers,
                "seat_class": (context.preferences or {}).get("seat_class"),
                "airline": (context.preferences or {}).get("airline"),
            },
        )
        return [self._normalize(item) for item in payload.get("results", [])[:3]]

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        payload = self._request_json(
            "POST",
            "/revalidate/flights",
            json={
                "provider_reference": option.get("provider_reference"),
                "origin": context.origin,
                "destination": context.destination,
                "passengers": context.passengers,
            },
        )
        return {
            "provider": self.provider_name,
            "provider_reference": payload.get("provider_reference") or option.get("provider_reference"),
            "available": bool(payload.get("available", False)),
            "price_confirmed": payload.get("price_confirmed"),
            "currency": payload.get("currency", "USD"),
            "status": payload.get("status", "validated_via_provider"),
        }

    def _map_serpapi_travel_class(self, seat_class: Any) -> str:
        normalized = str(seat_class or "economy").strip().lower()
        if normalized == "business":
            return "3"
        if normalized in {"first", "first class"}:
            return "4"
        if normalized in {"premium economy", "premium_economy"}:
            return "2"
        return "1"

    def _normalize_serpapi_results(
        self,
        payload: dict[str, Any],
        context: ProviderSearchContext,
    ) -> list[dict[str, Any]]:
        best_flights = payload.get("best_flights") or []
        other_flights = payload.get("other_flights") or []
        combined = [*best_flights, *other_flights]
        results = []

        for index, item in enumerate(combined[:3], start=1):
            flights = item.get("flights") or []
            first_leg = flights[0] if flights else {}
            last_leg = flights[-1] if flights else {}
            price = item.get("price") or 0
            results.append(
                {
                    "provider": "serpapi",
                    "provider_reference": item.get("departure_token") or f"serpapi-flight-{index}",
                    "flight_id": item.get("departure_token") or f"serpapi-flight-{index}",
                    "flight_number": first_leg.get("flight_number") or f"SERP-{index}",
                    "airline": first_leg.get("airline") or "Google Flights",
                    "departure_city": first_leg.get("departure_airport", {}).get("name") or context.origin,
                    "arrival_city": last_leg.get("arrival_airport", {}).get("name") or context.destination,
                    "departure_time_display": first_leg.get("departure_airport", {}).get("time"),
                    "arrival_time_display": last_leg.get("arrival_airport", {}).get("time"),
                    "duration_display": item.get("total_duration") and f"{item.get('total_duration')} min",
                    "price": str(price),
                    "display_price": str(price),
                    "price_economy": str(price),
                    "price_business": str(price),
                    "aircraft": first_leg.get("airplane") or "Unknown aircraft",
                    "amenities": [],
                }
            )

        return results

    def _normalize(self, item: dict[str, Any]) -> dict[str, Any]:
        price = item.get("display_price") or item.get("price") or 0
        return {
            "provider": self.provider_name,
            "provider_reference": item.get("provider_reference") or item.get("id"),
            "flight_id": item.get("flight_id") or item.get("id"),
            "flight_number": item.get("flight_number") or item.get("code"),
            "airline": item.get("airline") or "External Carrier",
            "departure_city": item.get("departure_city") or item.get("origin"),
            "arrival_city": item.get("arrival_city") or item.get("destination"),
            "departure_time_display": item.get("departure_time_display") or item.get("departure_time"),
            "arrival_time_display": item.get("arrival_time_display") or item.get("arrival_time"),
            "duration_display": item.get("duration_display") or item.get("duration"),
            "price": str(price),
            "display_price": str(price),
            "price_economy": str(item.get("price_economy") or price),
            "price_business": str(item.get("price_business") or price),
            "aircraft": item.get("aircraft") or "Unknown aircraft",
            "amenities": item.get("amenities") or [],
        }


class ExternalHotelProviderAdapter(BaseProviderAdapter):
    provider_name = getattr(settings, "HOTEL_PROVIDER", "external")
    api_key_setting = "HOTEL_PROVIDER_API_KEY"
    base_url_setting = "HOTEL_PROVIDER_BASE_URL"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        if "rapidapi.com" in self._get_base_url():
            region_payload = self._request_json(
                "GET",
                "/v2/regions",
                params={
                    "query": context.destination,
                    "locale": getattr(settings, "HOTEL_PROVIDER_LOCALE", "es_AR"),
                    "domain": getattr(settings, "HOTEL_PROVIDER_DOMAIN", "AR"),
                },
            )
            return self._normalize_rapidapi_regions(region_payload, context)

        payload = self._request_json(
            "GET",
            "/search/hotels",
            params={
                "city": context.destination,
                "guests": context.passengers,
                "hotel_style": (context.preferences or {}).get("hotel_style"),
                "hotel_rating": (context.preferences or {}).get("hotel_rating"),
            },
        )
        return [self._normalize(item) for item in payload.get("results", [])[:3]]

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        if "rapidapi.com" in self._get_base_url() or option.get("provider") == "rapidapi_hotels":
            offer = self.fetch_offer(option, context)
            offer_status = offer.get("offer_status")
            available = offer_status not in {"sold_out", "unavailable"} or bool(
                extract_price_value(offer.get("price_per_night") or offer.get("price_display"))
            )
            return {
                "provider": option.get("provider") or "rapidapi_hotels",
                "provider_reference": offer.get("provider_reference") or option.get("provider_reference"),
                "available": bool(available),
                "price_confirmed": offer.get("price_per_night") or extract_price_value(offer.get("price_display")),
                "currency": "USD",
                "status": "validated_via_live_offer" if available else offer_status or "unavailable",
                "offer_status": offer_status,
                "offer_message": offer.get("offer_message"),
            }

        payload = self._request_json(
            "POST",
            "/revalidate/hotels",
            json={
                "provider_reference": option.get("provider_reference"),
                "city": context.destination,
                "guests": context.passengers,
            },
        )
        return {
            "provider": self.provider_name,
            "provider_reference": payload.get("provider_reference") or option.get("provider_reference"),
            "available": bool(payload.get("available", False)),
            "price_confirmed": payload.get("price_confirmed"),
            "currency": payload.get("currency", "USD"),
            "status": payload.get("status", "validated_via_provider"),
        }

    def fetch_offer(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        if "rapidapi.com" in self._get_base_url():
            hotel_id = (
                option.get("provider_metadata", {}).get("hotel_id")
                or option.get("provider_metadata", {}).get("gaia_id")
                or option.get("hotel_id")
                or option.get("provider_reference")
            )
            try:
                payload = self._request_json(
                    "GET",
                    "/v2/hotels/rooms",
                    params={
                        "hotel_id": hotel_id,
                        "checkin_date": (context.preferences or {}).get("checkin_date"),
                        "checkout_date": (context.preferences or {}).get("checkout_date"),
                        "adults_number": max(int(context.passengers or 1), 1),
                        "locale": getattr(settings, "HOTEL_PROVIDER_LOCALE", "es_AR"),
                        "domain": getattr(settings, "HOTEL_PROVIDER_DOMAIN", "AR"),
                    },
                )
            except HTTPError as exc:
                if exc.response is not None and exc.response.status_code in {404, 422}:
                    return {
                        **option,
                        "pricing_pending": False,
                        "offer_lookup_required": False,
                        "price_display": "Offer unavailable",
                        "offer_status": "unavailable",
                        "offer_message": "This result cannot be priced directly. Try another hotel option.",
                        "sold_out": True,
                    }
                raise
            return self._normalize_rapidapi_offer(option, payload)

        return option

    def _build_headers(self) -> dict[str, str]:
        headers = super()._build_headers()
        if "rapidapi.com" in self._get_base_url():
            headers.pop("Authorization", None)
            headers.pop("X-API-Key", None)
            headers["X-RapidAPI-Key"] = self._get_api_key()
            headers["X-RapidAPI-Host"] = self._get_host()
        return headers

    def _normalize_rapidapi_regions(
        self,
        payload: dict[str, Any],
        context: ProviderSearchContext,
    ) -> list[dict[str, Any]]:
        data = payload.get("data") or []
        hotel_items = [
            item for item in data
            if item.get("@type") == "gaiaHotelResult" or str(item.get("type") or "").upper() == "HOTEL"
        ]
        prioritized = hotel_items or data
        results = []
        for index, item in enumerate(prioritized[:6], start=1):
            hierarchy = item.get("hierarchyInfo") or {}
            country = hierarchy.get("country", {}).get("name") or ""
            hotel_id = item.get("hotelId") or item.get("gaiaId") or f"rapidapi-hotel-{index}"
            result_type = item.get("@type")
            is_hotel_result = result_type == "gaiaHotelResult" or str(item.get("type") or "").upper() == "HOTEL"
            results.append(
                {
                    "provider": "rapidapi_hotels",
                    "provider_reference": str(hotel_id),
                    "hotel_id": str(hotel_id),
                    "hotel_name": item.get("regionNames", {}).get("fullName") or item.get("caption"),
                    "city": item.get("regionNames", {}).get("primaryDisplayName") or context.destination,
                    "country_name": country,
                    "price_per_night": "0",
                    "rating": None,
                    "description": (
                        "Live hotel result. Check room offers after selecting this property."
                        if is_hotel_result
                        else "Live hotel discovery result. Check room offers after selecting this property."
                    ),
                    "amenity_list": [],
                    "available_rooms": None,
                    "is_discovery_result": not is_hotel_result,
                    "pricing_pending": True,
                    "price_display": "Check live offers",
                    "offer_lookup_required": True,
                    "provider_metadata": {
                        "result_type": result_type,
                        "gaia_id": item.get("gaiaId"),
                        "hotel_id": item.get("hotelId"),
                        "city_id": item.get("cityId"),
                        "domain": getattr(settings, "HOTEL_PROVIDER_DOMAIN", "AR"),
                        "locale": getattr(settings, "HOTEL_PROVIDER_LOCALE", "es_AR"),
                    },
                }
            )
        return results

    def _normalize_rapidapi_offer(
        self,
        option: dict[str, Any],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        sticky_bar = payload.get("stickyBar") or {}
        raw_price = sticky_bar.get("price") or sticky_bar.get("displayPrice")
        sold_out = bool(payload.get("soldOut"))
        error_message = (
            (payload.get("errorMessage") or {}).get("title") or {}
        ).get("text")

        normalized_price = extract_price_value(raw_price)
        price_display = (
            str(normalized_price)
            if normalized_price is not None
            else "Sold out" if sold_out else "Check live offers"
        )

        return {
            **option,
            "pricing_pending": normalized_price is None and not sold_out,
            "offer_lookup_required": False,
            "price_per_night": str(normalized_price) if normalized_price is not None else option.get("price_per_night") or "0",
            "price_display": price_display,
            "offer_status": "sold_out" if sold_out else "available" if normalized_price is not None else "unavailable",
            "offer_message": error_message or ("Live room offer loaded." if normalized_price is not None else "Offer unavailable right now."),
            "sold_out": sold_out,
            "provider_offer_payload": {
                "id": payload.get("id"),
                "soldOut": sold_out,
                "message": error_message,
            },
        }

    def _normalize(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": item.get("provider_reference") or item.get("id"),
            "hotel_id": item.get("hotel_id") or item.get("id"),
            "hotel_name": item.get("hotel_name") or item.get("name"),
            "city": item.get("city"),
            "country_name": item.get("country_name") or item.get("country"),
            "price_per_night": str(item.get("price_per_night") or item.get("price") or 0),
            "rating": item.get("rating"),
            "description": item.get("description"),
            "amenity_list": item.get("amenity_list") or item.get("amenities") or [],
        }


class ExternalCarProviderAdapter(BaseProviderAdapter):
    provider_name = getattr(settings, "CAR_PROVIDER", "external")
    api_key_setting = "CAR_PROVIDER_API_KEY"
    base_url_setting = "CAR_PROVIDER_BASE_URL"

    def search(self, context: ProviderSearchContext) -> list[dict[str, Any]]:
        payload = self._request_json(
            "GET",
            "/search/cars",
            params={
                "city": context.destination,
                "passengers": context.passengers,
                "car_type": (context.preferences or {}).get("car_type"),
            },
        )
        return [self._normalize(item) for item in payload.get("results", [])[:3]]

    def revalidate(self, option: dict[str, Any], context: ProviderSearchContext) -> dict[str, Any]:
        payload = self._request_json(
            "POST",
            "/revalidate/cars",
            json={
                "provider_reference": option.get("provider_reference"),
                "city": context.destination,
                "passengers": context.passengers,
            },
        )
        return {
            "provider": self.provider_name,
            "provider_reference": payload.get("provider_reference") or option.get("provider_reference"),
            "available": bool(payload.get("available", False)),
            "price_confirmed": payload.get("price_confirmed"),
            "currency": payload.get("currency", "USD"),
            "status": payload.get("status", "validated_via_provider"),
        }

    def _normalize(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "provider_reference": item.get("provider_reference") or item.get("id"),
            "car_id": item.get("car_id") or item.get("id"),
            "company": item.get("company"),
            "car_model": item.get("car_model") or item.get("name"),
            "car_type": item.get("car_type") or item.get("type"),
            "city": item.get("city"),
            "price_per_day": str(item.get("price_per_day") or item.get("price") or 0),
            "car_seats": item.get("car_seats") or item.get("seats"),
            "features": item.get("features") or [],
        }


def get_flight_provider() -> BaseProviderAdapter:
    mode = getattr(settings, "FLIGHT_PROVIDER", "local_db")
    if mode == "local_db":
        return LocalFlightProviderAdapter()
    if mode == "mock_provider" and getattr(settings, "ENABLE_MOCK_PROVIDERS", True):
        return MockFlightProviderAdapter()
    return ExternalFlightProviderAdapter()


def get_hotel_provider() -> BaseProviderAdapter:
    mode = getattr(settings, "HOTEL_PROVIDER", "local_db")
    if mode == "local_db":
        return LocalHotelProviderAdapter()
    if mode == "mock_provider" and getattr(settings, "ENABLE_MOCK_PROVIDERS", True):
        return MockHotelProviderAdapter()
    return ExternalHotelProviderAdapter()


def get_car_provider() -> BaseProviderAdapter:
    mode = getattr(settings, "CAR_PROVIDER", "local_db")
    if mode == "local_db":
        return LocalCarProviderAdapter()
    if mode == "mock_provider" and getattr(settings, "ENABLE_MOCK_PROVIDERS", True):
        return MockCarProviderAdapter()
    return ExternalCarProviderAdapter()


def split_text_list(value: Any) -> list[str]:
    if not value:
        return []
    import re

    parts = re.split(r"[,\n|]+", str(value))
    return [part.strip() for part in parts if part.strip()]


def apply_hotel_style_filter(queryset, hotel_style: str):
    if not hotel_style or hotel_style == "any":
        return queryset
    if hotel_style == "budget":
        return queryset.filter(price_per_night__lte=120)
    if hotel_style == "standard":
        return queryset.filter(price_per_night__gt=120, price_per_night__lte=260)
    if hotel_style == "luxury":
        return queryset.filter(Q(price_per_night__gte=260) | Q(rating__gte=4.5))
    if hotel_style == "family friendly":
        return queryset.filter(
            Q(amenities__icontains="family")
            | Q(amenities__icontains="kids")
            | Q(description__icontains="family")
        )
    if hotel_style == "business":
        return queryset.filter(
            Q(amenities__icontains="business")
            | Q(amenities__icontains="workspace")
            | Q(description__icontains="business")
        )
    return queryset


def apply_hotel_rating_filter(queryset, hotel_rating: str):
    if not hotel_rating or hotel_rating == "any":
        return queryset
    if hotel_rating == "3+":
        return queryset.filter(rating__gte=3)
    if hotel_rating == "4+":
        return queryset.filter(rating__gte=4)
    if hotel_rating == "4.5+":
        return queryset.filter(rating__gte=4.5)
    return queryset


def extract_price_value(value: Any) -> str | None:
    if value in [None, ""]:
        return None
    if isinstance(value, (int, float, Decimal)):
        return f"{Decimal(str(value)).quantize(Decimal('0.01'))}"

    text = str(value)
    import re

    match = re.search(r"([0-9]+(?:[.,][0-9]{1,2})?)", text)
    if not match:
        return None

    normalized = match.group(1).replace(",", "")
    try:
        return f"{Decimal(normalized).quantize(Decimal('0.01'))}"
    except Exception:
        return None
