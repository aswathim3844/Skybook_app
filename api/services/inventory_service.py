from __future__ import annotations

from datetime import timedelta
import hashlib
import json
from typing import Any

from django.conf import settings
from django.utils import timezone

from api.models import ProviderSearchCache
from api.services.providers import (
    LocalCarProviderAdapter,
    LocalFlightProviderAdapter,
    LocalHotelProviderAdapter,
    MockCarProviderAdapter,
    MockFlightProviderAdapter,
    MockHotelProviderAdapter,
    ProviderSearchContext,
    get_car_provider,
    get_flight_provider,
    get_hotel_provider,
)


DEFAULT_CACHE_TTLS = {
    "flight": 300,
    "hotel": 1800,
    "car": 1800,
}


class InventoryService:
    def __init__(self):
        self.flight_provider = get_flight_provider()
        self.hotel_provider = get_hotel_provider()
        self.car_provider = get_car_provider()
        self.flight_fallback_provider = LocalFlightProviderAdapter()
        self.hotel_fallback_provider = LocalHotelProviderAdapter()
        self.car_fallback_provider = LocalCarProviderAdapter()
        self.flight_mock_provider = MockFlightProviderAdapter()
        self.hotel_mock_provider = MockHotelProviderAdapter()
        self.car_mock_provider = MockCarProviderAdapter()

    def search_flights(
        self,
        *,
        origin: str | None,
        destination: str | None,
        passengers: int = 1,
        preferences: dict[str, Any] | None = None,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        context = ProviderSearchContext(
            origin=origin,
            destination=destination,
            passengers=passengers,
            preferences=preferences or {},
        )
        return self._search_with_cache(
            provider_type="flight",
            context=context,
            provider=self.flight_provider,
            force_refresh=force_refresh,
        )

    def search_hotels(
        self,
        *,
        destination: str | None,
        passengers: int = 1,
        preferences: dict[str, Any] | None = None,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        context = ProviderSearchContext(
            destination=destination,
            passengers=passengers,
            preferences=preferences or {},
        )
        return self._search_with_cache(
            provider_type="hotel",
            context=context,
            provider=self.hotel_provider,
            force_refresh=force_refresh,
        )

    def search_cars(
        self,
        *,
        destination: str | None,
        passengers: int = 1,
        preferences: dict[str, Any] | None = None,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        context = ProviderSearchContext(
            destination=destination,
            passengers=passengers,
            preferences=preferences or {},
        )
        return self._search_with_cache(
            provider_type="car",
            context=context,
            provider=self.car_provider,
            force_refresh=force_refresh,
        )

    def _search_with_cache(
        self,
        *,
        provider_type: str,
        context: ProviderSearchContext,
        provider,
        force_refresh: bool,
    ) -> list[dict[str, Any]]:
        signature = self._build_signature(provider_type, context, provider.provider_name)
        cache_key = self._build_cache_key(signature)
        cache_entry = ProviderSearchCache.objects.filter(cache_key=cache_key).first()
        now = timezone.now()

        if cache_entry and not force_refresh and cache_entry.expires_at > now:
            return cache_entry.response_payload or []

        results = self._search_with_fallback(provider_type=provider_type, context=context, provider=provider)
        ttl_seconds = self._get_ttl_seconds(provider_type)
        expires_at = now + timedelta(seconds=ttl_seconds)

        if cache_entry is None:
            ProviderSearchCache.objects.create(
                provider_type=provider_type,
                cache_key=cache_key,
                request_signature=signature,
                response_payload=results,
                expires_at=expires_at,
            )
        else:
            cache_entry.request_signature = signature
            cache_entry.response_payload = results
            cache_entry.expires_at = expires_at
            cache_entry.save(update_fields=["request_signature", "response_payload", "expires_at", "last_refreshed_at"])

        return results

    def _search_with_fallback(
        self,
        *,
        provider_type: str,
        context: ProviderSearchContext,
        provider,
    ) -> list[dict[str, Any]]:
        source = "live"
        try:
            primary_results = provider.search(context)
        except Exception:
            primary_results = []

        if primary_results:
            return self._normalize_results(provider_type, primary_results, source=source)

        fallback_provider = self._get_local_fallback_provider(provider_type)
        fallback_results = fallback_provider.search(context)
        if fallback_results:
            return self._normalize_results(provider_type, fallback_results, source="database")

        if getattr(settings, "ENABLE_MOCK_PROVIDERS", True):
            return self._normalize_results(
                provider_type,
                self._get_mock_fallback_provider(provider_type).search(context),
                source="mock",
            )

        return []

    def _get_local_fallback_provider(self, provider_type: str):
        if provider_type == "flight":
            return self.flight_fallback_provider
        if provider_type == "hotel":
            return self.hotel_fallback_provider
        return self.car_fallback_provider

    def _get_mock_fallback_provider(self, provider_type: str):
        if provider_type == "flight":
            return self.flight_mock_provider
        if provider_type == "hotel":
            return self.hotel_mock_provider
        return self.car_mock_provider

    def _build_signature(
        self,
        provider_type: str,
        context: ProviderSearchContext,
        provider_name: str,
    ) -> dict[str, Any]:
        return {
            "provider_type": provider_type,
            "provider_name": provider_name,
            "origin": (context.origin or "").strip().lower(),
            "destination": (context.destination or "").strip().lower(),
            "passengers": int(context.passengers or 1),
            "preferences": context.preferences or {},
        }

    def _build_cache_key(self, signature: dict[str, Any]) -> str:
        normalized = json.dumps(signature, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        return digest

    def _get_ttl_seconds(self, provider_type: str) -> int:
        setting_name = f"{provider_type.upper()}_SEARCH_CACHE_TTL_SECONDS"
        return int(getattr(settings, setting_name, DEFAULT_CACHE_TTLS[provider_type]))

    def _normalize_results(
        self,
        provider_type: str,
        results: list[dict[str, Any]],
        *,
        source: str,
    ) -> list[dict[str, Any]]:
        normalized = []
        for index, item in enumerate(results, start=1):
            if not isinstance(item, dict):
                continue
            entry = {
                **item,
                "source": item.get("source") or source,
                "result_rank": index,
            }
            provider_name = str(entry.get("provider") or "").strip().lower() or {
                "live": "external",
                "database": "local_db",
                "mock": "mock_provider",
            }[source]
            entry["provider"] = provider_name
            if provider_type == "flight":
                price = entry.get("display_price") or entry.get("price")
                entry["display_price"] = str(price) if price is not None else "0"
                entry["provider_reference"] = entry.get("provider_reference") or entry.get("flight_id")
                entry["is_round_trip_candidate"] = bool(entry.get("arrival_city") and entry.get("departure_city"))
            elif provider_type == "hotel":
                price = entry.get("price_per_night") or entry.get("price")
                entry["price_per_night"] = str(price) if price is not None else "0"
                entry["provider_reference"] = entry.get("provider_reference") or entry.get("hotel_id")
            else:
                price = entry.get("price_per_day") or entry.get("price")
                entry["price_per_day"] = str(price) if price is not None else "0"
                entry["provider_reference"] = entry.get("provider_reference") or entry.get("car_id")
            normalized.append(entry)
        return normalized
