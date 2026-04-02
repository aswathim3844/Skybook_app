from datetime import timedelta
from decimal import Decimal
import logging
import re
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .admin_security import (
    authenticate_admin,
    ensure_default_admin_setup,
    has_permission,
    issue_admin_token,
    log_admin_event,
    require_admin,
    serialize_admin_management_user,
    serialize_admin_user,
    serialize_role,
)
from .models import (
    AdminRoles,
    AdminUsers,
    Airports,
    Flights,
    Hotels,
    Cars,
    Bookings,
    Countries,
    Customers,
    PlannerSessions,
    ItineraryDrafts,
)
from django.conf import settings
from .services.health_service import build_health_report
from .services.inventory_service import InventoryService
from .services.planner_service import PlannerService
from .services.providers import ProviderSearchContext, get_hotel_provider
from .serializers import (
    FlightSerializer,
    HotelSerializer,
    CarSerializer,
    BookingSerializer,
    CountrySerializer,
    CustomerSerializer,
    PlannerSessionSerializer,
    PlannerMessageSerializer,
    ItineraryDraftSerializer,
)


logger = logging.getLogger(__name__)


@api_view(["GET"])
def get_flights(request):
    base_queryset = Flights.objects.select_related("departure_airport", "arrival_airport").all()
    queryset = base_queryset

    from_city = request.GET.get("from")
    to_city = request.GET.get("to")
    departure_date = request.GET.get("departure")

    if from_city:
        queryset = queryset.filter(
            Q(departure_airport__city__icontains=from_city)
            | Q(departure_airport__city_code__icontains=from_city)
            | Q(departure_airport__airport_name__icontains=from_city)
        )
    if to_city:
        queryset = queryset.filter(
            Q(arrival_airport__city__icontains=to_city)
            | Q(arrival_airport__city_code__icontains=to_city)
            | Q(arrival_airport__airport_name__icontains=to_city)
        )
    if departure_date:
        dated_queryset = queryset.filter(departure_time__date=departure_date)
        if dated_queryset.exists():
            queryset = dated_queryset

    if not queryset.exists():
        queryset = base_queryset

        if departure_date:
            dated_queryset = queryset.filter(departure_time__date=departure_date)
            if dated_queryset.exists():
                queryset = dated_queryset

    return Response(FlightSerializer(queryset.order_by("departure_time"), many=True).data)


@api_view(["GET"])
def get_hotels(request):
    queryset = Hotels.objects.select_related("country").all()
    city = request.GET.get("city") or request.GET.get("to")

    if city:
        queryset = queryset.filter(city__icontains=city)

    return Response(HotelSerializer(queryset.order_by("-rating", "hotel_name"), many=True).data)


@api_view(["GET"])
def get_cars(request):
    queryset = Cars.objects.select_related("country").all()
    city = request.GET.get("city") or request.GET.get("to")
    available_only = request.GET.get("available")

    if city:
        queryset = queryset.filter(city__icontains=city)
    if available_only == "true":
        queryset = queryset.filter(availability=True)

    return Response(CarSerializer(queryset.order_by("company", "car_model"), many=True).data)


@api_view(["GET", "POST"])
def get_bookings(request):
    if request.method == "GET":
        queryset = Bookings.objects.select_related(
            "customer",
            "flight",
            "return_flight",
            "hotel",
            "car",
            "flight__departure_airport",
            "flight__arrival_airport",
            "return_flight__departure_airport",
            "return_flight__arrival_airport",
            "hotel__country",
            "car__country",
        ).order_by("-booking_id")

        customer_id = request.GET.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        return Response(BookingSerializer(queryset, many=True).data)

    flight_id = request.data.get("flight")
    return_flight_id = request.data.get("return_flight")
    hotel_id = request.data.get("hotel")
    car_id = request.data.get("car")
    customer_id = request.data.get("customer")
    total_price = request.data.get("total_price")
    outbound_date = request.data.get("outbound_date") or request.data.get("check_in")
    return_date = request.data.get("return_date") or request.data.get("check_out")
    trip_days = request.data.get("trip_days")
    passengers = request.data.get("passengers")
    seat_class = request.data.get("seat_class")
    booking_metadata = request.data.get("booking_metadata") or {}
    name = (request.data.get("name") or "").strip()
    email = (request.data.get("email") or "").strip().lower()

    today = timezone.now().date()
    outbound_value = parse_date_value(outbound_date) or today
    return_value = parse_date_value(return_date)

    if return_value is None:
      if trip_days:
          try:
              return_value = outbound_value + timedelta(days=max(int(trip_days), 0))
          except (TypeError, ValueError):
              return_value = outbound_value
      else:
          return_value = outbound_value

    if not customer_id and email:
        customer = Customers.objects.filter(email=email).first()
        if customer is None:
            customer = Customers.objects.create(
                name=name or email.split("@")[0],
                email=email,
                created_at=timezone.now(),
            )
        customer_id = customer.customer_id

    customer_id = validate_related_id(Customers, customer_id)
    if customer_id is None:
        return Response(
            {"message": "A valid signed-in customer is required to create a booking."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    flight_id = validate_related_id(Flights, flight_id)
    return_flight_id = validate_related_id(Flights, return_flight_id)
    hotel_id = validate_related_id(Hotels, hotel_id)
    car_id = validate_related_id(Cars, car_id)
    normalized_booking_metadata = normalize_booking_metadata(
        booking_metadata if isinstance(booking_metadata, dict) else {},
        flight_id=flight_id,
        return_flight_id=return_flight_id,
        hotel_id=hotel_id,
        car_id=car_id,
        total_price=total_price,
        seat_class=seat_class,
        passengers=passengers,
    )

    try:
        booking = Bookings.objects.create(
            customer_id=customer_id or None,
            flight_id=flight_id or None,
            return_flight_id=return_flight_id or None,
            hotel_id=hotel_id or None,
            car_id=car_id or None,
            outbound_date=outbound_value,
            return_date=return_value,
            is_bundle=bool(hotel_id or car_id or return_flight_id),
            total_price=Decimal(str(total_price)) if total_price is not None else None,
            booking_status="Confirmed",
            passengers=parse_int_value(passengers) or 1,
            seat_class=seat_class or "Economy",
            booking_metadata=normalized_booking_metadata,
            created_at=timezone.now(),
        )
    except (IntegrityError, ValueError, TypeError, ArithmeticError):
        return Response(
            {"message": "The selected booking details are no longer valid. Please reselect your trip and try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    queryset = Bookings.objects.select_related(
        "customer",
        "flight",
        "return_flight",
        "hotel",
        "car",
        "flight__departure_airport",
        "flight__arrival_airport",
        "return_flight__departure_airport",
        "return_flight__arrival_airport",
        "hotel__country",
        "car__country",
    ).get(pk=booking.pk)

    try:
        send_booking_confirmation_email(queryset)
    except Exception:  # pragma: no cover - email delivery should not fail booking creation
        logger.exception("Booking confirmation email failed for booking %s", booking.pk)

    return Response(BookingSerializer(queryset).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def get_countries(request):
    queryset = Countries.objects.all().order_by("country_name")
    return Response(CountrySerializer(queryset, many=True).data)


@api_view(["GET"])
def get_flight_locations(request):
    airports = (
        Airports.objects.select_related("country")
        .exclude(city__isnull=True)
        .exclude(city__exact="")
        .order_by("city", "airport_name", "airport_id")
    )

    locations = []
    seen_keys = set()

    for airport in airports:
        city = (airport.city or "").strip()
        airport_name = (airport.airport_name or "").strip()
        city_code = (airport.city_code or "").strip()
        country_name = (
            airport.country.country_name.strip()
            if airport.country and airport.country.country_name
            else ""
        )

        label_tail = ", ".join(part for part in [city, country_name] if part)
        if city_code:
            label_tail = f"{label_tail} ({city_code})" if label_tail else city_code

        label = label_tail or city
        key = f"{airport.airport_id}|{city.lower()}|{airport_name.lower()}|{city_code.lower()}"

        if key in seen_keys:
            continue

        seen_keys.add(key)
        locations.append(
            {
                "id": airport.airport_id,
                "label": label,
                "city": city,
                "city_code": city_code,
                "country": country_name,
                "airport_name": airport_name,
            }
        )

    return Response(locations)


@api_view(["GET"])
def get_flight_routes(request):
    flights = (
        Flights.objects.select_related(
            "departure_airport__country",
            "arrival_airport__country",
        )
        .exclude(departure_airport__isnull=True)
        .exclude(arrival_airport__isnull=True)
        .order_by("departure_airport__city", "arrival_airport__city", "flight_id")
    )

    origins = {}

    for flight in flights:
        departure_airport = flight.departure_airport
        arrival_airport = flight.arrival_airport

        if departure_airport is None or arrival_airport is None:
            continue

        departure_city = (departure_airport.city or "").strip()
        arrival_city = (arrival_airport.city or "").strip()
        departure_code = (departure_airport.city_code or "").strip().upper()
        arrival_code = (arrival_airport.city_code or "").strip().upper()

        if not departure_city or not arrival_city:
            continue

        departure_country = (
            departure_airport.country.country_name.strip()
            if departure_airport.country and departure_airport.country.country_name
            else ""
        )
        arrival_country = (
            arrival_airport.country.country_name.strip()
            if arrival_airport.country and arrival_airport.country.country_name
            else ""
        )

        departure_label = ", ".join(part for part in [departure_city, departure_country] if part)
        if departure_code:
            departure_label = f"{departure_label} ({departure_code})" if departure_label else departure_code

        arrival_label = ", ".join(part for part in [arrival_city, arrival_country] if part)
        if arrival_code:
            arrival_label = f"{arrival_label} ({arrival_code})" if arrival_label else arrival_code

        origin_key = departure_label.lower()
        origin_entry = origins.setdefault(
            origin_key,
            {
                "label": departure_label,
                "city": departure_city,
                "city_code": departure_code,
                "country": departure_country,
                "destinations": [],
                "_seen_destinations": set(),
            },
        )

        destination_key = arrival_label.lower()
        if destination_key in origin_entry["_seen_destinations"]:
            continue

        origin_entry["_seen_destinations"].add(destination_key)
        origin_entry["destinations"].append(
            {
                "label": arrival_label,
                "city": arrival_city,
                "city_code": arrival_code,
                "country": arrival_country,
            }
        )

    payload = []
    for origin in origins.values():
        payload.append(
            {
                "label": origin["label"],
                "city": origin["city"],
                "city_code": origin["city_code"],
                "country": origin["country"],
                "destinations": sorted(origin["destinations"], key=lambda item: (item["city"], item["label"])),
            }
        )

    payload.sort(key=lambda item: (item["city"], item["label"]))
    return Response(payload)


@api_view(["POST"])
def ai_chat(request):
    message = (request.data.get("message") or "").strip()
    history = request.data.get("history") or []

    if not message:
        return Response({"reply": "Please ask a travel question so I can help."}, status=status.HTTP_400_BAD_REQUEST)

    planner_service = PlannerService()
    try:
        planner_reply = planner_service.generate_chat_reply(message, history)
    except Exception as exc:
        logger.exception("AI chat failed")
        return Response(
            {
                "message": "AI chat is temporarily unavailable.",
                "detail": str(exc),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(
        {
            "reply": planner_reply.reply,
            "mode": planner_reply.mode,
            "sources": planner_reply.sources,
        }
    )


@api_view(["GET", "POST"])
def planner_sessions(request):
    planner_service = PlannerService()

    if request.method == "GET":
        customer_id = request.GET.get("customer_id")
        queryset = PlannerSessions.objects.prefetch_related("messages", "drafts").order_by("-updated_at", "-session_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        return Response(PlannerSessionSerializer(queryset, many=True).data)

    session = planner_service.create_session(request.data)
    return Response(PlannerSessionSerializer(session).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def planner_session_detail(request, session_id):
    session = PlannerSessions.objects.prefetch_related("messages", "drafts").filter(pk=session_id).first()
    if session is None:
        return Response({"message": "Planner session not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(PlannerSessionSerializer(session).data)


@api_view(["POST"])
def planner_session_message(request, session_id):
    session = PlannerSessions.objects.prefetch_related("messages").filter(pk=session_id).first()
    if session is None:
        return Response({"message": "Planner session not found."}, status=status.HTTP_404_NOT_FOUND)

    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"message": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

    planner_service = PlannerService()
    history = [{"role": item.role, "content": item.content} for item in session.messages.all()]
    planner_service.add_message(session, "user", message)
    try:
        planner_reply = planner_service.generate_chat_reply(message, history)
        assistant_message = planner_service.add_message(
            session,
            "assistant",
            planner_reply.reply,
            {"mode": planner_reply.mode, "sources": planner_reply.sources},
        )
        session.updated_at = timezone.now()
        session.save(update_fields=["updated_at"])
    except Exception as exc:
        logger.exception("Planner session message failed for session %s", session_id)
        return Response(
            {
                "message": "Planner chat is temporarily unavailable.",
                "detail": str(exc),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response(
        {
            "reply": planner_reply.reply,
            "mode": planner_reply.mode,
            "sources": planner_reply.sources,
            "message": PlannerMessageSerializer(assistant_message).data,
        }
    )


@api_view(["POST"])
def planner_session_plan(request, session_id):
    session = PlannerSessions.objects.filter(pk=session_id).first()
    if session is None:
        return Response({"message": "Planner session not found."}, status=status.HTTP_404_NOT_FOUND)

    planner_service = PlannerService()
    try:
        include_insights = request.data.get("include_insights", True)
        if isinstance(include_insights, str):
            include_insights = include_insights.lower() not in {"false", "0", "no"}
        draft = planner_service.build_trip_plan(session, request.data, include_insights=bool(include_insights))
        session.updated_at = timezone.now()
        session.save(update_fields=["updated_at"])
    except Exception as exc:
        logger.exception("Planner build failed for session %s", session_id)
        return Response(
            {
                "message": "Planner could not complete this live search right now.",
                "detail": str(exc),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(ItineraryDraftSerializer(draft).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def planner_draft_enrich(request, session_id, draft_id):
    session = PlannerSessions.objects.prefetch_related("messages").filter(pk=session_id).first()
    if session is None:
        return Response({"message": "Planner session not found."}, status=status.HTTP_404_NOT_FOUND)

    draft = ItineraryDrafts.objects.filter(pk=draft_id, session=session).first()
    if draft is None:
        return Response({"message": "Planner draft not found."}, status=status.HTTP_404_NOT_FOUND)

    planner_service = PlannerService()
    try:
        draft = planner_service.enrich_draft(draft)
        session.updated_at = timezone.now()
        session.save(update_fields=["updated_at"])
    except Exception as exc:
        logger.exception("Planner enrichment failed for draft %s", draft_id)
        return Response(
            {
                "message": "Planner insights are temporarily unavailable.",
                "detail": str(exc),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response(ItineraryDraftSerializer(draft).data)


@api_view(["POST"])
def planner_draft_revalidate(request, session_id, draft_id):
    session = PlannerSessions.objects.filter(pk=session_id).first()
    if session is None:
        return Response({"message": "Planner session not found."}, status=status.HTTP_404_NOT_FOUND)

    draft = ItineraryDrafts.objects.filter(pk=draft_id, session=session).first()
    if draft is None:
        return Response({"message": "Planner draft not found."}, status=status.HTTP_404_NOT_FOUND)

    planner_service = PlannerService()
    try:
        draft = planner_service.revalidate_draft(draft)
        session.updated_at = timezone.now()
        session.save(update_fields=["updated_at"])
    except Exception as exc:
        logger.exception("Planner revalidation failed for draft %s", draft_id)
        return Response(
            {
                "message": "Planner could not revalidate the selected package right now.",
                "detail": str(exc),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(ItineraryDraftSerializer(draft).data)


@api_view(["PATCH"])
def planner_draft_update(request, session_id, draft_id):
    session = PlannerSessions.objects.filter(pk=session_id).first()
    if session is None:
        return Response({"message": "Planner session not found."}, status=status.HTTP_404_NOT_FOUND)

    draft = ItineraryDrafts.objects.filter(pk=draft_id, session=session).first()
    if draft is None:
        return Response({"message": "Planner draft not found."}, status=status.HTTP_404_NOT_FOUND)

    planner_service = PlannerService()
    try:
        draft = planner_service.update_draft_selection(draft, request.data)
        session.updated_at = timezone.now()
        session.save(update_fields=["updated_at"])
    except Exception as exc:
        logger.exception("Planner draft update failed for draft %s", draft_id)
        return Response(
            {
                "message": "Planner could not update the selected package right now.",
                "detail": str(exc),
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(ItineraryDraftSerializer(draft).data)


@api_view(["GET"])
def provider_status(request):
    return Response(
        {
            "flight_provider": settings.FLIGHT_PROVIDER,
            "hotel_provider": settings.HOTEL_PROVIDER,
            "car_provider": settings.CAR_PROVIDER,
            "mock_providers_enabled": settings.ENABLE_MOCK_PROVIDERS,
            "flight_provider_configured": bool(settings.FLIGHT_PROVIDER_BASE_URL) if settings.FLIGHT_PROVIDER != "local_db" else True,
            "hotel_provider_configured": bool(settings.HOTEL_PROVIDER_BASE_URL) if settings.HOTEL_PROVIDER != "local_db" else True,
            "car_provider_configured": bool(settings.CAR_PROVIDER_BASE_URL) if settings.CAR_PROVIDER != "local_db" else True,
            "rag_configured": bool(getattr(settings, "OPENAI_API_KEY", "")) or bool(getattr(settings, "GROQ_API_KEY", "")),
            "llm_provider": getattr(settings, "LLM_PROVIDER", "openai"),
        }
    )


@api_view(["GET"])
def health_status(request):
    report = build_health_report()
    http_status = status.HTTP_200_OK if report["ok"] else status.HTTP_503_SERVICE_UNAVAILABLE
    return Response(report, status=http_status)


@api_view(["GET"])
def readiness_status(request):
    report = build_health_report()
    missing = []
    if not report["database"]["ok"]:
        missing.append("database_connection")
    if not report["rag"].get("llm_configured", False):
        missing.append("llm_api_key")
    if not report["providers"]["flight_provider_configured"]:
        missing.append("flight_provider_base_url")
    if not report["providers"]["hotel_provider_configured"]:
        missing.append("hotel_provider_base_url")
    if not report["providers"]["car_provider_configured"]:
        missing.append("car_provider_base_url")

    ready = (
        report["database"]["ok"]
        and report["providers"]["flight_provider_configured"]
        and report["providers"]["hotel_provider_configured"]
        and report["providers"]["car_provider_configured"]
    )
    return Response(
        {
            "ready": ready,
            "checked_at": timezone.now().isoformat(),
            "database_ok": report["database"]["ok"],
            "rag_configured": report["rag"].get("llm_configured", False),
            "providers": report["providers"],
            "missing": missing,
        },
        status=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@api_view(["POST"])
def search_flights(request):
    origin = (request.data.get("origin") or "").strip()
    destination = (request.data.get("destination") or "").strip()
    departure_date = (request.data.get("departure_date") or "").strip()
    return_date = (request.data.get("return_date") or "").strip()
    seat_class = (request.data.get("seat_class") or "").strip()
    airline = (request.data.get("airline") or "").strip()
    min_seats = parse_int_value(request.data.get("min_seats"))
    force_refresh = parse_bool_value(request.data.get("refresh")) is True

    inventory_service = InventoryService()
    flights = inventory_service.search_flights(
        origin=origin,
        destination=destination,
        passengers=min_seats or 1,
        preferences={
            "seat_class": seat_class or "Economy",
            "airline": airline,
            "departure_date": departure_date,
            "return_date": return_date,
        },
        force_refresh=force_refresh,
    )
    return Response(flights[:8])


@api_view(["POST"])
def search_hotels(request):
    city = (request.data.get("city") or "").strip()
    hotel_style = (request.data.get("hotel_style") or "").strip().lower()
    hotel_amenities = request.data.get("hotel_amenities") or []
    hotel_rating = (request.data.get("hotel_rating") or "").strip().lower()
    force_refresh = parse_bool_value(request.data.get("refresh")) is True

    inventory_service = InventoryService()
    hotels = inventory_service.search_hotels(
        destination=city,
        passengers=parse_int_value(request.data.get("adults_number")) or 1,
        preferences={
            "hotel_style": hotel_style,
            "hotel_amenities": hotel_amenities,
            "hotel_rating": hotel_rating,
        },
        force_refresh=force_refresh,
    )
    return Response(hotels[:8])


@api_view(["POST"])
def hotel_offer_lookup(request):
    hotel_option = request.data.get("hotel") or {}
    city = (request.data.get("city") or "").strip()
    checkin_date = (request.data.get("checkin_date") or "").strip()
    checkout_date = (request.data.get("checkout_date") or "").strip()
    adults_number = parse_int_value(request.data.get("adults_number")) or 1

    if not isinstance(hotel_option, dict) or not hotel_option:
        return Response({"message": "Hotel selection is required."}, status=status.HTTP_400_BAD_REQUEST)
    if not checkin_date or not checkout_date:
        return Response({"message": "Check-in and check-out dates are required."}, status=status.HTTP_400_BAD_REQUEST)

    provider = get_hotel_provider()
    context = ProviderSearchContext(
        destination=city,
        passengers=adults_number,
        preferences={
            "checkin_date": checkin_date,
            "checkout_date": checkout_date,
        },
    )
    offer = provider.fetch_offer(hotel_option, context)
    return Response(offer)


@api_view(["POST"])
def search_cars(request):
    city = (request.data.get("city") or "").strip()
    car_type = (request.data.get("car_type") or "").strip()
    min_seats = parse_int_value(request.data.get("min_seats"))
    force_refresh = parse_bool_value(request.data.get("refresh")) is True

    inventory_service = InventoryService()
    cars = inventory_service.search_cars(
        destination=city,
        passengers=min_seats or 1,
        preferences={
            "car_type": car_type,
        },
        force_refresh=force_refresh,
    )

    available_only = request.data.get("available_only")
    if available_only in [True, "true", "True", "1", 1]:
        cars = [car for car in cars if car.get("availability", True)]

    return Response(cars[:8])


@api_view(["GET", "PATCH"])
def retrieve_booking(request, reference):
    booking_id = parse_booking_reference(reference)
    if booking_id is None:
        return Response({"message": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

    booking = Bookings.objects.select_related(
        "customer",
        "flight",
        "return_flight",
        "hotel",
        "car",
        "flight__departure_airport",
        "flight__arrival_airport",
        "return_flight__departure_airport",
        "return_flight__arrival_airport",
        "hotel__country",
        "car__country",
    ).filter(pk=booking_id).first()

    if booking is None:
        return Response({"message": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        action = (request.data.get("action") or "").strip().lower()
        customer_id = parse_int_value(request.data.get("customer_id"))

        if action != "cancel":
            return Response({"message": "Unsupported booking action."}, status=status.HTTP_400_BAD_REQUEST)
        if customer_id is None or booking.customer_id != customer_id:
            return Response({"message": "You are not allowed to update this booking."}, status=status.HTTP_403_FORBIDDEN)
        if (booking.booking_status or "").lower() in {"cancelled", "refunded"}:
            return Response({"message": "This booking has already been updated."}, status=status.HTTP_400_BAD_REQUEST)
        if booking.return_date and booking.return_date < timezone.now().date():
            return Response({"message": "Past trips can no longer be cancelled online."}, status=status.HTTP_400_BAD_REQUEST)

        booking.booking_status = "Cancelled"
        booking.save(update_fields=["booking_status"])

        booking = Bookings.objects.select_related(
            "customer",
            "flight",
            "return_flight",
            "hotel",
            "car",
            "flight__departure_airport",
            "flight__arrival_airport",
            "return_flight__departure_airport",
            "return_flight__arrival_airport",
            "hotel__country",
            "car__country",
        ).get(pk=booking.pk)
        return Response(BookingSerializer(booking).data)

    return Response(BookingSerializer(booking).data)


@api_view(["POST"])
def register_customer(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    confirm_password = request.data.get("confirm_password") or ""
    phone = (request.data.get("phone") or "").strip()
    country_id = request.data.get("country")

    errors = {}

    if not email:
        errors["email"] = "Email is required."
    elif Customers.objects.filter(email=email).exists():
        errors["email"] = "An account with this email already exists."

    if len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."
    if password != confirm_password:
        errors["confirm_password"] = "Passwords do not match."
    if not phone:
        errors["phone"] = "Phone number is required."
    if not country_id:
        errors["country"] = "Country is required."

    country = None
    if country_id:
        country = Countries.objects.filter(pk=country_id).first()
        if country is None:
            errors["country"] = "Selected country does not exist."

    if errors:
        return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

    display_name = request.data.get("name") or email.split("@")[0]

    customer = Customers.objects.create(
        name=display_name,
        email=email,
        phone=phone,
        country=country,
        password_hash=make_password(password),
        created_at=timezone.now(),
    )

    return Response(
        {"message": "Account created successfully.", "customer": CustomerSerializer(customer).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def login_customer(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    customer = Customers.objects.select_related("country").filter(email=email).first()

    if customer is None or not check_password(password, customer.password_hash or ""):
        return Response(
            {"message": "Invalid email or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return Response(
        {
            "message": "Login successful.",
            "customer": CustomerSerializer(customer).data,
            "summary": build_customer_summary(customer),
        }
    )


@api_view(["POST"])
def admin_login(request):
    ensure_default_admin_setup()
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    admin_user, error_message = authenticate_admin(email, password, request=request)
    if error_message:
        return Response({"message": error_message}, status=status.HTTP_401_UNAUTHORIZED)

    token = issue_admin_token(admin_user)
    return Response(
        {
            "message": "Admin login successful.",
            "token": token,
            "admin": serialize_admin_user(admin_user),
            "permissions": admin_user.role.permissions if admin_user.role else [],
        }
    )


@api_view(["GET"])
def admin_session(request):
    ensure_default_admin_setup()
    admin_user, error_response = require_admin(request)
    if error_response:
        return error_response
    return Response(
        {
            "admin": serialize_admin_user(admin_user),
            "permissions": admin_user.role.permissions if admin_user.role else [],
        }
    )


@api_view(["GET"])
def admin_dashboard(request):
    ensure_default_admin_setup()
    admin_user, error_response = require_admin(request, permission="dashboard.read")
    if error_response:
        return error_response

    bookings_queryset = Bookings.objects.select_related("customer", "hotel", "flight")
    total_bookings = bookings_queryset.count()
    active_users = Customers.objects.count()
    total_revenue = bookings_queryset.aggregate(total=Sum("total_price")).get("total") or Decimal("0")
    active_listings = Flights.objects.count() + Hotels.objects.count() + Cars.objects.count()
    bundle_bookings = bookings_queryset.filter(is_bundle=True).count()
    upcoming_bookings = bookings_queryset.filter(return_date__gte=timezone.now().date()).count()
    status_counts = {
        item["booking_status"] or "Unknown": item["count"]
        for item in bookings_queryset.values("booking_status").annotate(count=Count("booking_id")).order_by("-count")
    }

    return Response(
        {
            "admin": serialize_admin_user(admin_user),
            "metrics": {
                "total_bookings": total_bookings,
                "active_users": active_users,
                "total_revenue": f"{Decimal(total_revenue):.2f}",
                "active_listings": active_listings,
                "bundle_bookings": bundle_bookings,
                "upcoming_bookings": upcoming_bookings,
            },
            "booking_status_breakdown": status_counts,
        }
    )


@api_view(["GET"])
def admin_bookings(request):
    ensure_default_admin_setup()
    _, error_response = require_admin(request, permission="bookings.read")
    if error_response:
        return error_response

    queryset = Bookings.objects.select_related(
        "customer",
        "flight",
        "return_flight",
        "hotel",
        "car",
        "flight__departure_airport",
        "flight__arrival_airport",
        "return_flight__departure_airport",
        "return_flight__arrival_airport",
        "hotel__country",
        "car__country",
    ).order_by("-created_at", "-booking_id")

    status_filter = (request.GET.get("status") or "").strip()
    if status_filter:
        queryset = queryset.filter(booking_status__iexact=status_filter)

    return Response(BookingSerializer(queryset, many=True).data)


@api_view(["PATCH"])
def admin_booking_status(request, booking_id):
    ensure_default_admin_setup()
    admin_user, error_response = require_admin(request)
    if error_response:
        return error_response

    action = (request.data.get("action") or "").strip().lower()
    required_permission = "bookings.cancel" if action == "cancel" else "bookings.refund" if action == "refund" else None
    if required_permission is None:
        return Response({"message": "Unsupported booking action."}, status=status.HTTP_400_BAD_REQUEST)
    if not has_permission(admin_user, required_permission):
        return Response({"message": "Insufficient permissions for this action."}, status=status.HTTP_403_FORBIDDEN)

    booking = Bookings.objects.filter(pk=booking_id).first()
    if booking is None:
        return Response({"message": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

    previous_status = booking.booking_status
    booking.booking_status = "Refunded" if action == "refund" else "Cancelled"
    booking.save(update_fields=["booking_status"])
    log_admin_event(
        action=f"booking_{action}",
        resource_type="booking",
        resource_id=booking.booking_id,
        admin_user=admin_user,
        details={"previous_status": previous_status, "new_status": booking.booking_status},
        request=request,
    )

    booking = Bookings.objects.select_related(
        "customer",
        "flight",
        "return_flight",
        "hotel",
        "car",
        "flight__departure_airport",
        "flight__arrival_airport",
        "return_flight__departure_airport",
        "return_flight__arrival_airport",
        "hotel__country",
        "car__country",
    ).get(pk=booking.pk)
    return Response(BookingSerializer(booking).data)


@api_view(["GET"])
def admin_roles(request):
    ensure_default_admin_setup()
    _, error_response = require_admin(request)
    if error_response:
        return error_response

    roles = AdminRoles.objects.all().order_by("name")
    return Response([serialize_role(role) for role in roles])


@api_view(["GET", "POST"])
def admin_users(request):
    ensure_default_admin_setup()
    permission = "admin_users.read" if request.method == "GET" else "admin_users.write"
    admin_user, error_response = require_admin(request, permission=permission)
    if error_response:
        return error_response

    if request.method == "GET":
        queryset = AdminUsers.objects.select_related("role").order_by("-created_at", "-admin_user_id")
        return Response([serialize_admin_management_user(item) for item in queryset])

    email = (request.data.get("email") or "").strip().lower()
    full_name = (request.data.get("full_name") or "").strip()
    password = request.data.get("password") or ""
    role_id = parse_int_value(request.data.get("role_id"))
    is_active = parse_bool_value(request.data.get("is_active"))

    errors = {}
    if not email:
        errors["email"] = "Email is required."
    elif AdminUsers.objects.filter(email=email).exists():
        errors["email"] = "An admin user with this email already exists."

    if not full_name:
        errors["full_name"] = "Full name is required."

    if len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."

    role = AdminRoles.objects.filter(pk=role_id).first() if role_id else None
    if role is None:
        errors["role_id"] = "A valid role is required."

    if errors:
        return Response({"message": "Please correct the highlighted fields.", "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

    managed_admin = AdminUsers.objects.create(
        role=role,
        email=email,
        full_name=full_name,
        password_hash=make_password(password),
        is_active=True if is_active is None else is_active,
    )
    log_admin_event(
        action="admin_user_create",
        resource_type="admin_user",
        resource_id=str(managed_admin.admin_user_id),
        admin_user=admin_user,
        details={"after": serialize_admin_management_user(managed_admin)},
        request=request,
    )
    return Response(serialize_admin_management_user(managed_admin), status=status.HTTP_201_CREATED)


@api_view(["PUT", "PATCH"])
def admin_user_detail(request, admin_user_id):
    ensure_default_admin_setup()
    admin_user, error_response = require_admin(request, permission="admin_users.write")
    if error_response:
        return error_response

    managed_admin = AdminUsers.objects.select_related("role").filter(pk=admin_user_id).first()
    if managed_admin is None:
        return Response({"message": "Admin user not found."}, status=status.HTTP_404_NOT_FOUND)

    before = serialize_admin_management_user(managed_admin)
    email = (request.data.get("email") or managed_admin.email or "").strip().lower()
    full_name = (request.data.get("full_name") or managed_admin.full_name or "").strip()
    password = request.data.get("password")
    role_id = parse_int_value(request.data.get("role_id"))
    is_active = parse_bool_value(request.data.get("is_active"))

    errors = {}
    if not email:
        errors["email"] = "Email is required."
    elif AdminUsers.objects.exclude(pk=managed_admin.pk).filter(email=email).exists():
        errors["email"] = "An admin user with this email already exists."

    if not full_name:
        errors["full_name"] = "Full name is required."

    if password is not None and password != "" and len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."

    role = managed_admin.role
    if role_id is not None:
        role = AdminRoles.objects.filter(pk=role_id).first()
        if role is None:
            errors["role_id"] = "A valid role is required."

    if admin_user.admin_user_id == managed_admin.admin_user_id and is_active is False:
        errors["is_active"] = "You cannot deactivate your own admin account."

    if errors:
        return Response({"message": "Please correct the highlighted fields.", "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

    managed_admin.email = email
    managed_admin.full_name = full_name
    managed_admin.role = role
    if is_active is not None:
        managed_admin.is_active = is_active
    if password:
        managed_admin.password_hash = make_password(password)
        managed_admin.failed_login_attempts = 0
        managed_admin.locked_until = None
    update_fields = ["email", "full_name", "role", "is_active", "updated_at"]
    if password:
        update_fields.extend(["password_hash", "failed_login_attempts", "locked_until"])
    managed_admin.save(update_fields=update_fields)
    log_admin_event(
        action="admin_user_update",
        resource_type="admin_user",
        resource_id=str(managed_admin.admin_user_id),
        admin_user=admin_user,
        details={"before": before, "after": serialize_admin_management_user(managed_admin)},
        request=request,
    )
    return Response(serialize_admin_management_user(managed_admin))


@api_view(["GET", "POST"])
def admin_flights(request):
    ensure_default_admin_setup()
    admin_user, error_response = require_admin(request, permission="flights.read" if request.method == "GET" else "flights.write")
    if error_response:
        return error_response

    if request.method == "GET":
        queryset = Flights.objects.select_related("departure_airport", "arrival_airport").order_by("departure_time", "flight_id")
        return Response(FlightSerializer(queryset, many=True).data)

    serializer = FlightSerializer(data=build_flight_payload(request.data))
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    flight = serializer.save()
    log_admin_event(
        action="flight_create",
        resource_type="flight",
        resource_id=flight.flight_id,
        admin_user=admin_user,
        details={"after": serializer.data},
        request=request,
    )
    return Response(FlightSerializer(flight).data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
def admin_flight_detail(request, flight_id):
    ensure_default_admin_setup()
    permission = "flights.write" if request.method == "PUT" else "flights.delete"
    admin_user, error_response = require_admin(request, permission=permission)
    if error_response:
        return error_response

    flight = Flights.objects.filter(pk=flight_id).first()
    if flight is None:
        return Response({"message": "Flight not found."}, status=status.HTTP_404_NOT_FOUND)

    before = FlightSerializer(flight).data
    if request.method == "DELETE":
        flight.delete()
        log_admin_event(
            action="flight_delete",
            resource_type="flight",
            resource_id=flight_id,
            admin_user=admin_user,
            details={"before": before},
            request=request,
        )
        return Response({"message": "Flight deleted."})

    serializer = FlightSerializer(flight, data=build_flight_payload(request.data))
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    serializer.save()
    log_admin_event(
        action="flight_update",
        resource_type="flight",
        resource_id=flight_id,
        admin_user=admin_user,
        details={"before": before, "after": serializer.data},
        request=request,
    )
    return Response(serializer.data)


@api_view(["GET", "POST"])
def admin_hotels(request):
    ensure_default_admin_setup()
    admin_user, error_response = require_admin(request, permission="hotels.read" if request.method == "GET" else "hotels.write")
    if error_response:
        return error_response

    if request.method == "GET":
        queryset = Hotels.objects.select_related("country").order_by("city", "hotel_name")
        return Response(HotelSerializer(queryset, many=True).data)

    serializer = HotelSerializer(data=build_hotel_payload(request.data))
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    hotel = serializer.save()
    log_admin_event(
        action="hotel_create",
        resource_type="hotel",
        resource_id=hotel.hotel_id,
        admin_user=admin_user,
        details={"after": serializer.data},
        request=request,
    )
    return Response(HotelSerializer(hotel).data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
def admin_hotel_detail(request, hotel_id):
    ensure_default_admin_setup()
    permission = "hotels.write" if request.method == "PUT" else "hotels.delete"
    admin_user, error_response = require_admin(request, permission=permission)
    if error_response:
        return error_response

    hotel = Hotels.objects.filter(pk=hotel_id).first()
    if hotel is None:
        return Response({"message": "Hotel not found."}, status=status.HTTP_404_NOT_FOUND)

    before = HotelSerializer(hotel).data
    if request.method == "DELETE":
        hotel.delete()
        log_admin_event(
            action="hotel_delete",
            resource_type="hotel",
            resource_id=hotel_id,
            admin_user=admin_user,
            details={"before": before},
            request=request,
        )
        return Response({"message": "Hotel deleted."})

    serializer = HotelSerializer(hotel, data=build_hotel_payload(request.data))
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    serializer.save()
    log_admin_event(
        action="hotel_update",
        resource_type="hotel",
        resource_id=hotel_id,
        admin_user=admin_user,
        details={"before": before, "after": serializer.data},
        request=request,
    )
    return Response(serializer.data)


@api_view(["GET", "POST"])
def admin_cars(request):
    ensure_default_admin_setup()
    admin_user, error_response = require_admin(request, permission="cars.read" if request.method == "GET" else "cars.write")
    if error_response:
        return error_response

    if request.method == "GET":
        queryset = Cars.objects.select_related("country").order_by("city", "company", "car_model")
        return Response(CarSerializer(queryset, many=True).data)

    serializer = CarSerializer(data=build_car_payload(request.data))
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    car = serializer.save()
    log_admin_event(
        action="car_create",
        resource_type="car",
        resource_id=car.car_id,
        admin_user=admin_user,
        details={"after": serializer.data},
        request=request,
    )
    return Response(CarSerializer(car).data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
def admin_car_detail(request, car_id):
    ensure_default_admin_setup()
    permission = "cars.write" if request.method == "PUT" else "cars.delete"
    admin_user, error_response = require_admin(request, permission=permission)
    if error_response:
        return error_response

    car = Cars.objects.filter(pk=car_id).first()
    if car is None:
        return Response({"message": "Car not found."}, status=status.HTTP_404_NOT_FOUND)

    before = CarSerializer(car).data
    if request.method == "DELETE":
        car.delete()
        log_admin_event(
            action="car_delete",
            resource_type="car",
            resource_id=car_id,
            admin_user=admin_user,
            details={"before": before},
            request=request,
        )
        return Response({"message": "Car deleted."})

    serializer = CarSerializer(car, data=build_car_payload(request.data))
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    serializer.save()
    log_admin_event(
        action="car_update",
        resource_type="car",
        resource_id=car_id,
        admin_user=admin_user,
        details={"before": before, "after": serializer.data},
        request=request,
    )
    return Response(serializer.data)


@api_view(["GET", "PUT"])
def customer_account(request, customer_id):
    customer = Customers.objects.select_related("country").filter(pk=customer_id).first()

    if customer is None:
        return Response({"message": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "PUT":
        name = (request.data.get("name") or "").strip()
        phone = (request.data.get("phone") or "").strip()
        country_id = request.data.get("country")
        password = request.data.get("password") or ""
        confirm_password = request.data.get("confirm_password") or ""

        errors = {}

        if not name:
            errors["name"] = "Name is required."
        if not phone:
            errors["phone"] = "Phone number is required."
        if not country_id:
            errors["country"] = "Country is required."

        country = None
        if country_id:
            country = Countries.objects.filter(pk=country_id).first()
            if country is None:
                errors["country"] = "Selected country does not exist."

        if password or confirm_password:
            if len(password) < 8:
                errors["password"] = "Password must be at least 8 characters."
            if password != confirm_password:
                errors["confirm_password"] = "Passwords do not match."

        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        customer.name = name
        customer.phone = phone
        customer.country = country

        if password:
            customer.password_hash = make_password(password)

        customer.save()
        customer = Customers.objects.select_related("country").get(pk=customer.pk)

        return Response(
            {
                "message": "Account updated successfully.",
                "customer": CustomerSerializer(customer).data,
                "summary": build_customer_summary(customer),
            }
        )

    return Response({"customer": CustomerSerializer(customer).data, "summary": build_customer_summary(customer)})


def build_customer_summary(customer):
    bookings = Bookings.objects.filter(customer=customer)
    booking_count = bookings.count()
    upcoming_trips = bookings.filter(return_date__gte=timezone.now().date()).count()
    total_spent = bookings.aggregate(total=Sum("total_price")).get("total") or Decimal("0")
    loyalty_miles = int(total_spent)

    return {
        "booking_count": booking_count,
        "upcoming_trips": upcoming_trips,
        "loyalty_points": loyalty_miles,
        "loyalty_miles": loyalty_miles,
    }


def split_text_list(value):
    if not value:
        return []

    parts = re.split(r"[,\n|]+", str(value))
    return [part.strip() for part in parts if part.strip()]


def apply_hotel_style_filter(queryset, hotel_style):
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


def apply_hotel_rating_filter(queryset, hotel_rating):
    if not hotel_rating or hotel_rating == "any":
        return queryset
    if hotel_rating == "3+":
        return queryset.filter(rating__gte=3)
    if hotel_rating == "4+":
        return queryset.filter(rating__gte=4)
    if hotel_rating == "4.5+":
        return queryset.filter(rating__gte=4.5)

    return queryset


def parse_booking_reference(reference):
    normalized = str(reference or "").strip().upper()
    if not normalized:
        return None

    prefixed_match = re.fullmatch(r"SNA0*(\d+)", normalized)
    if prefixed_match:
        return int(prefixed_match.group(1))

    numeric_match = re.fullmatch(r"0*(\d+)", normalized)
    if numeric_match:
        return int(numeric_match.group(1))

    return None


def normalize_booking_metadata(
    booking_metadata,
    *,
    flight_id,
    return_flight_id,
    hotel_id,
    car_id,
    total_price,
    seat_class,
    passengers,
):
    metadata = dict(booking_metadata or {})
    existing_provider_booking = metadata.get("provider_booking")
    provider_booking = dict(existing_provider_booking) if isinstance(existing_provider_booking, dict) else {}

    items = {
        "flight": _build_booking_item_snapshot(
            selection=metadata.get("selected_flight"),
            local_inventory_id=flight_id,
            item_type="flight",
        ),
        "return_flight": _build_booking_item_snapshot(
            selection=metadata.get("selected_return_flight"),
            local_inventory_id=return_flight_id,
            item_type="return_flight",
        ),
        "hotel": _build_booking_item_snapshot(
            selection=metadata.get("selected_hotel"),
            local_inventory_id=hotel_id,
            item_type="hotel",
        ),
        "car": _build_booking_item_snapshot(
            selection=metadata.get("selected_car"),
            local_inventory_id=car_id,
            item_type="car",
        ),
    }
    items = {key: value for key, value in items.items() if value is not None}

    provider_booking.update(
        {
            "version": 1,
            "status": provider_booking.get("status") or "confirmed",
            "source_of_truth": determine_booking_source_of_truth(items),
            "seat_class": seat_class or provider_booking.get("seat_class") or "Economy",
            "passengers": parse_int_value(passengers) or provider_booking.get("passengers") or 1,
            "total_price": str(total_price) if total_price is not None else provider_booking.get("total_price"),
            "items": items,
        }
    )
    provider_booking["provider_refs"] = {
        key: value.get("provider_reference")
        for key, value in items.items()
        if value.get("provider_reference")
    }

    metadata["provider_booking"] = provider_booking
    return metadata


def _build_booking_item_snapshot(*, selection, local_inventory_id, item_type):
    if not isinstance(selection, dict) or not selection:
        if local_inventory_id is None:
            return None
        return {
            "item_type": item_type,
            "provider": "local_db",
            "provider_reference": f"{item_type}:{local_inventory_id}",
            "local_inventory_id": local_inventory_id,
            "source": "database",
            "selection": {},
            "supports_recheck": True,
        }

    provider = str(selection.get("provider") or ("local_db" if local_inventory_id else "external")).strip().lower()
    provider_reference = (
        selection.get("provider_reference")
        or selection.get("offer_id")
        or selection.get("id")
        or selection.get(f"{item_type}_id")
    )
    source = "database" if provider == "local_db" or local_inventory_id else "external"
    return {
        "item_type": item_type,
        "provider": provider,
        "provider_reference": str(provider_reference) if provider_reference is not None else None,
        "local_inventory_id": local_inventory_id,
        "source": source,
        "selection": selection,
        "supports_recheck": bool(provider_reference),
    }


def determine_booking_source_of_truth(items):
    if not items:
        return "unknown"
    sources = {value.get("source") for value in items.values()}
    if sources == {"database"}:
        return "database"
    if "external" in sources and "database" in sources:
        return "hybrid"
    if "external" in sources:
        return "external"
    return "database"


def parse_date_value(value):
    if not value:
        return None

    try:
        return timezone.datetime.fromisoformat(str(value)).date()
    except ValueError:
        try:
            return timezone.datetime.strptime(str(value), "%Y-%m-%d").date()
        except ValueError:
            return None


def parse_int_value(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def validate_related_id(model, value):
    parsed_value = parse_int_value(value)
    if not parsed_value:
        return None
    return parsed_value if model.objects.filter(pk=parsed_value).exists() else None


def parse_float_value(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_bool_value(value):
    if isinstance(value, bool):
        return value
    if value in ["true", "True", "1", 1]:
        return True
    if value in ["false", "False", "0", 0]:
        return False
    return None


def build_flight_payload(data):
    return {
        "flight_number": (data.get("flight_number") or "").strip() or None,
        "airline": (data.get("airline") or "").strip() or None,
        "departure_airport": parse_int_value(data.get("departure_airport")),
        "arrival_airport": parse_int_value(data.get("arrival_airport")),
        "departure_time": data.get("departure_time") or None,
        "arrival_time": data.get("arrival_time") or None,
        "base_price": data.get("base_price") or None,
        "available_seats": parse_int_value(data.get("available_seats")),
        "duration_minutes": parse_int_value(data.get("duration_minutes")),
        "flight_class": (data.get("flight_class") or "").strip() or None,
        "status": (data.get("status") or "").strip() or None,
    }


def build_hotel_payload(data):
    return {
        "hotel_name": (data.get("hotel_name") or "").strip() or None,
        "city": (data.get("city") or "").strip() or None,
        "country": parse_int_value(data.get("country")),
        "price_per_night": data.get("price_per_night") or None,
        "rating": parse_float_value(data.get("rating")),
        "description": (data.get("description") or "").strip() or None,
        "image_url": (data.get("image_url") or "").strip() or None,
        "amenities": (data.get("amenities") or "").strip() or None,
        "available_rooms": parse_int_value(data.get("available_rooms")),
    }


def build_car_payload(data):
    return {
        "company": (data.get("company") or "").strip() or None,
        "car_model": (data.get("car_model") or "").strip() or None,
        "car_type": (data.get("car_type") or "").strip() or None,
        "city": (data.get("city") or "").strip() or None,
        "country": parse_int_value(data.get("country")),
        "price_per_day": data.get("price_per_day") or None,
        "car_seats": parse_int_value(data.get("car_seats")),
        "image_url": (data.get("image_url") or "").strip() or None,
        "availability": parse_bool_value(data.get("availability")),
        "description": (data.get("description") or "").strip() or None,
    }


def send_booking_confirmation_email(booking):
    if not settings.BOOKING_CONFIRMATION_EMAILS_ENABLED:
        return

    recipient = (booking.customer.email if booking.customer and booking.customer.email else "").strip().lower()
    if not recipient:
        return

    booking_reference = f"SNA{int(booking.booking_id):06d}"
    customer_name = (booking.customer.name if booking.customer and booking.customer.name else "Traveler").strip()
    metadata = booking.booking_metadata or {}

    outbound_flight = booking.flight
    return_flight = booking.return_flight
    hotel = booking.hotel
    car = booking.car

    selected_flight = metadata.get("selected_flight") or {}
    selected_return_flight = metadata.get("selected_return_flight") or {}
    selected_hotel = metadata.get("selected_hotel") or {}
    selected_car = metadata.get("selected_car") or {}

    lines = [
        f"Hello {customer_name},",
        "",
        "Your SkyBook booking is confirmed.",
        "",
        f"Booking reference: {booking_reference}",
        f"Status: {booking.booking_status or 'Confirmed'}",
        f"Travel dates: {booking.outbound_date} to {booking.return_date}",
        f"Passengers: {booking.passengers or 1}",
        f"Seat class: {booking.seat_class or 'Economy'}",
        f"Total paid: {booking.total_price or 'N/A'}",
        "",
        "Trip summary:",
    ]

    lines.extend(build_booking_email_item_lines("Outbound flight", outbound_flight, selected_flight))
    if return_flight or selected_return_flight:
        lines.extend(build_booking_email_item_lines("Return flight", return_flight, selected_return_flight))
    if hotel or selected_hotel:
        lines.extend(build_booking_email_item_lines("Hotel", hotel, selected_hotel))
    if car or selected_car:
        lines.extend(build_booking_email_item_lines("Car", car, selected_car))

    lines.extend([
        "",
        "Thank you for booking with SkyBook.",
    ])

    subject = f"SkyBook booking confirmed: {booking_reference}"
    text_body = "\n".join(lines)
    html_body = "<br>".join(line if line else "&nbsp;" for line in lines)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    message.attach_alternative(f"<html><body>{html_body}</body></html>", "text/html")
    message.send(fail_silently=False)


def build_booking_email_item_lines(label, model_item, snapshot):
    details = []
    if label in {"Outbound flight", "Return flight"}:
        airline = (
            getattr(model_item, "airline", None)
            or snapshot.get("airline")
            or snapshot.get("provider")
            or "Flight"
        )
        code = (
            getattr(model_item, "flight_number", None)
            or snapshot.get("flight_number")
            or snapshot.get("code")
            or ""
        )
        details.append(f"- {label}: {airline} {code}".strip())
    elif label == "Hotel":
        hotel_name = getattr(model_item, "hotel_name", None) or snapshot.get("hotel_name") or "Selected hotel"
        city = getattr(model_item, "city", None) or snapshot.get("city") or ""
        details.append(f"- Hotel: {hotel_name}{f' ({city})' if city else ''}")
    elif label == "Car":
        company = getattr(model_item, "company", None) or snapshot.get("company") or "Rental"
        model_name = getattr(model_item, "car_model", None) or snapshot.get("car_model") or "Car"
        details.append(f"- Car: {company} {model_name}".strip())

    price = None
    if label in {"Outbound flight", "Return flight"}:
        price = getattr(model_item, "base_price", None) or snapshot.get("price")
    elif label == "Hotel":
        price = getattr(model_item, "price_per_night", None) or snapshot.get("price_per_night")
    elif label == "Car":
        price = getattr(model_item, "price_per_day", None) or snapshot.get("price_per_day")

    if price not in [None, ""]:
        details.append(f"  Price: {price}")

    return details


@api_view(["GET"])
def api_root(request):
    return Response({"message": "Welcome to the Skybook Travel API!"})
