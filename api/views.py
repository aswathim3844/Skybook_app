from datetime import timedelta
from decimal import Decimal
import re
from django.utils import timezone
from django.contrib.auth.hashers import check_password, make_password
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Airports, Flights, Hotels, Cars, Bookings, Countries, Customers, PlannerSessions, ItineraryDrafts
from django.conf import settings
from .services.health_service import build_health_report
from .services.planner_service import PlannerService
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
        created_at=timezone.now(),
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


@api_view(["POST"])
def ai_chat(request):
    message = (request.data.get("message") or "").strip()
    history = request.data.get("history") or []

    if not message:
        return Response({"reply": "Please ask a travel question so I can help."}, status=status.HTTP_400_BAD_REQUEST)

    planner_service = PlannerService()
    planner_reply = planner_service.generate_chat_reply(message, history)
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
    planner_reply = planner_service.generate_chat_reply(message, history)
    assistant_message = planner_service.add_message(
        session,
        "assistant",
        planner_reply.reply,
        {"mode": planner_reply.mode, "sources": planner_reply.sources},
    )
    session.updated_at = timezone.now()
    session.save(update_fields=["updated_at"])

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
    draft = planner_service.build_trip_plan(session, request.data)
    session.updated_at = timezone.now()
    session.save(update_fields=["updated_at"])
    return Response(ItineraryDraftSerializer(draft).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def planner_draft_revalidate(request, session_id, draft_id):
    session = PlannerSessions.objects.filter(pk=session_id).first()
    if session is None:
        return Response({"message": "Planner session not found."}, status=status.HTTP_404_NOT_FOUND)

    draft = ItineraryDrafts.objects.filter(pk=draft_id, session=session).first()
    if draft is None:
        return Response({"message": "Planner draft not found."}, status=status.HTTP_404_NOT_FOUND)

    planner_service = PlannerService()
    draft = planner_service.revalidate_draft(draft)
    session.updated_at = timezone.now()
    session.save(update_fields=["updated_at"])
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
    draft = planner_service.update_draft_selection(draft, request.data)
    session.updated_at = timezone.now()
    session.save(update_fields=["updated_at"])
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
            "rag_configured": bool(settings.OPENAI_API_KEY),
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
    if not report["rag"]["openai_configured"]:
        missing.append("openai_api_key")
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
            "rag_configured": report["rag"]["openai_configured"],
            "providers": report["providers"],
            "missing": missing,
        },
        status=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@api_view(["POST"])
def search_flights(request):
    origin = (request.data.get("origin") or "").strip()
    destination = (request.data.get("destination") or "").strip()
    seat_class = (request.data.get("seat_class") or "").strip()
    airline = (request.data.get("airline") or "").strip()
    min_seats = parse_int_value(request.data.get("min_seats"))

    queryset = Flights.objects.select_related("departure_airport", "arrival_airport").all()

    if origin:
        queryset = queryset.filter(
            Q(departure_airport__city__icontains=origin)
            | Q(departure_airport__city_code__icontains=origin)
            | Q(departure_airport__airport_name__icontains=origin)
        )
    if destination:
        queryset = queryset.filter(
            Q(arrival_airport__city__icontains=destination)
            | Q(arrival_airport__city_code__icontains=destination)
            | Q(arrival_airport__airport_name__icontains=destination)
        )
    if airline and airline.lower() != "any":
        queryset = queryset.filter(airline__icontains=airline)
    if min_seats:
        queryset = queryset.filter(available_seats__gte=min_seats)

    flights = []
    for flight in queryset.order_by("base_price", "departure_time")[:8]:
        serialized = FlightSerializer(flight).data
        base_price = Decimal(str(serialized.get("price") or flight.base_price or 0))
        multiplier = Decimal("1.65") if seat_class.lower() == "business" else Decimal("1.00")
        serialized["price_economy"] = f"{base_price.quantize(Decimal('0.01'))}"
        serialized["price_business"] = f"{(base_price * Decimal('1.65')).quantize(Decimal('0.01'))}"
        serialized["display_price"] = f"{(base_price * multiplier).quantize(Decimal('0.01'))}"
        serialized["aircraft"] = flight.flight_class or "Boeing 787"
        serialized["amenities"] = ["WiFi", "Meals", "Entertainment"]
        serialized["rating"] = 4.7
        flights.append(serialized)

    return Response(flights)


@api_view(["POST"])
def search_hotels(request):
    city = (request.data.get("city") or "").strip()
    hotel_style = (request.data.get("hotel_style") or "").strip().lower()
    hotel_amenities = request.data.get("hotel_amenities") or []
    hotel_rating = (request.data.get("hotel_rating") or "").strip().lower()
    queryset = Hotels.objects.select_related("country").all()

    if city:
        queryset = queryset.filter(city__icontains=city)
    for hotel_amenity in hotel_amenities:
        amenity_value = str(hotel_amenity or "").strip()
        if amenity_value:
            queryset = queryset.filter(amenities__icontains=amenity_value)
    queryset = apply_hotel_rating_filter(queryset, hotel_rating)
    queryset = apply_hotel_style_filter(queryset, hotel_style)

    hotels = []
    for hotel in queryset.order_by("price_per_night", "-rating")[:8]:
        serialized = HotelSerializer(hotel).data
        serialized["amenity_list"] = split_text_list(hotel.amenities) or [
            "Breakfast",
            "WiFi",
            "Pool",
            "Airport transfer",
        ]
        hotels.append(serialized)

    return Response(hotels)


@api_view(["POST"])
def search_cars(request):
    city = (request.data.get("city") or "").strip()
    car_type = (request.data.get("car_type") or "").strip()
    min_seats = parse_int_value(request.data.get("min_seats"))
    available_only = request.data.get("available_only")
    queryset = Cars.objects.select_related("country").all()

    if city:
        queryset = queryset.filter(city__icontains=city)
    if car_type and car_type.lower() != "any":
        queryset = queryset.filter(car_type__icontains=car_type)
    if min_seats:
        queryset = queryset.filter(car_seats__gte=min_seats)
    if available_only in [True, "true", "True", "1", 1]:
        queryset = queryset.filter(availability=True)

    cars = []
    for car in queryset.order_by("price_per_day", "company")[:8]:
        serialized = CarSerializer(car).data
        serialized["features"] = split_text_list(car.description) or [
            "Air Conditioning",
            "Bluetooth",
            "Free Cancellation",
            "Unlimited KM",
        ]
        cars.append(serialized)

    return Response(cars)


@api_view(["GET"])
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

    return {
        "booking_count": booking_count,
        "upcoming_trips": upcoming_trips,
        "loyalty_points": int(total_spent // Decimal("10")),
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
    match = re.fullmatch(r"SNA(\d{6})", str(reference or "").strip().upper())
    if not match:
        return None
    return int(match.group(1))


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


@api_view(["GET"])
def api_root(request):
    return Response({"message": "Welcome to the Skybook Travel API!"})
