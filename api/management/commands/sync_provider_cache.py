import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.services.inventory_service import InventoryService


DEFAULT_SYNC_QUERIES = {
    "flights": [
        {"origin": "Delhi", "destination": "Dubai", "passengers": 1, "preferences": {"seat_class": "Economy"}},
        {"origin": "Mumbai", "destination": "London", "passengers": 1, "preferences": {"seat_class": "Economy"}},
    ],
    "hotels": [
        {"destination": "Dubai", "passengers": 2, "preferences": {"hotel_rating": "4+"}},
        {"destination": "London", "passengers": 2, "preferences": {"hotel_rating": "4+"}},
    ],
    "cars": [
        {"destination": "Dubai", "passengers": 4, "preferences": {"car_type": "SUV"}},
        {"destination": "London", "passengers": 4, "preferences": {"car_type": "Sedan"}},
    ],
}


class Command(BaseCommand):
    help = "Warm provider search cache for configured popular routes and cities."

    def add_arguments(self, parser):
        parser.add_argument(
            "--refresh",
            action="store_true",
            help="Force refresh even when a cache entry is still valid.",
        )

    def handle(self, *args, **options):
        refresh = bool(options.get("refresh"))
        sync_queries = self._load_sync_queries()
        inventory_service = InventoryService()

        flight_count = 0
        for item in sync_queries.get("flights", []):
            inventory_service.search_flights(
                origin=item.get("origin"),
                destination=item.get("destination"),
                passengers=int(item.get("passengers") or 1),
                preferences=item.get("preferences") or {},
                force_refresh=refresh,
            )
            flight_count += 1

        hotel_count = 0
        for item in sync_queries.get("hotels", []):
            inventory_service.search_hotels(
                destination=item.get("destination"),
                passengers=int(item.get("passengers") or 1),
                preferences=item.get("preferences") or {},
                force_refresh=refresh,
            )
            hotel_count += 1

        car_count = 0
        for item in sync_queries.get("cars", []):
            inventory_service.search_cars(
                destination=item.get("destination"),
                passengers=int(item.get("passengers") or 1),
                preferences=item.get("preferences") or {},
                force_refresh=refresh,
            )
            car_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Provider cache sync finished. Flights: {flight_count}, Hotels: {hotel_count}, Cars: {car_count}."
            )
        )

    def _load_sync_queries(self):
        raw_value = str(getattr(settings, "PROVIDER_SYNC_QUERIES_JSON", "") or "").strip()
        if not raw_value:
            return DEFAULT_SYNC_QUERIES

        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid PROVIDER_SYNC_QUERIES_JSON: {exc}") from exc

        if not isinstance(parsed, dict):
            raise CommandError("PROVIDER_SYNC_QUERIES_JSON must be a JSON object.")

        return {
            "flights": parsed.get("flights") or [],
            "hotels": parsed.get("hotels") or [],
            "cars": parsed.get("cars") or [],
        }
