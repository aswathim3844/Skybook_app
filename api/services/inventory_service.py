from __future__ import annotations

from datetime import timedelta
import hashlib
import json
from typing import Any

from django.conf import settings
from django.utils import timezone

from api.models import ProviderSearchCache
from api.services.providers import (
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

        results = provider.search(context)
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
