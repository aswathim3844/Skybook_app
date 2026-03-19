from decimal import Decimal
from django.contrib.auth.hashers import check_password, make_password
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Flights, Hotels, Cars, Bookings, Countries, Customers
from .serializers import (
    FlightSerializer,
    HotelSerializer,
    CarSerializer,
    BookingSerializer,
    CountrySerializer,
    CustomerSerializer,
)


@api_view(["GET"])
def get_flights(request):
    queryset = Flights.objects.select_related(
        "departure_airport", "arrival_airport"
    ).all()

    from_city = request.GET.get("from")
    to_city = request.GET.get("to")
    departure_date = request.GET.get("departure")

    if from_city:
        queryset = queryset.filter(departure_airport__city__icontains=from_city)
    if to_city:
        queryset = queryset.filter(arrival_airport__city__icontains=to_city)
    if departure_date:
        queryset = queryset.filter(departure_time__date=departure_date)

    return Response(FlightSerializer(queryset, many=True).data)


@api_view(["GET"])
def get_hotels(request):
    queryset = Hotels.objects.select_related("country").all()
    city = request.GET.get("city") or request.GET.get("to")

    if city:
        queryset = queryset.filter(city__icontains=city)

    return Response(HotelSerializer(queryset, many=True).data)


@api_view(["GET"])
def get_cars(request):
    queryset = Cars.objects.select_related("country").all()
    city = request.GET.get("city") or request.GET.get("to")
    available_only = request.GET.get("available")

    if city:
        queryset = queryset.filter(city__icontains=city)
    if available_only == "true":
        queryset = queryset.filter(availability=True)

    return Response(CarSerializer(queryset, many=True).data)


@api_view(["GET", "POST"])
def get_bookings(request):
    if request.method == "GET":
        queryset = Bookings.objects.select_related(
            "customer",
            "flight",
            "hotel",
            "car",
            "flight__departure_airport",
            "flight__arrival_airport",
            "hotel__country",
            "car__country",
        ).order_by("-booking_id")

        customer_id = request.GET.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        return Response(BookingSerializer(queryset, many=True).data)

    flight_id = request.data.get("flight")
    hotel_id = request.data.get("hotel")
    car_id = request.data.get("car")
    customer_id = request.data.get("customer")
    trip_days = request.data.get("trip_days")
    total_price = request.data.get("total_price")

    booking = Bookings.objects.create(
        customer_id=customer_id or None,
        flight_id=flight_id or None,
        hotel_id=hotel_id or None,
        car_id=car_id or None,
        trip_days=trip_days or None,
        total_price=Decimal(str(total_price)) if total_price is not None else None,
        booking_date=timezone.now().date(),
    )

    queryset = Bookings.objects.select_related(
        "customer",
        "flight",
        "hotel",
        "car",
        "flight__departure_airport",
        "flight__arrival_airport",
        "hotel__country",
        "car__country",
    ).get(pk=booking.pk)

    return Response(
        BookingSerializer(queryset).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def get_countries(request):
    queryset = Countries.objects.all().order_by("country_name")
    return Response(CountrySerializer(queryset, many=True).data)


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
        password=make_password(password),
    )

    return Response(
        {
            "message": "Account created successfully.",
            "customer": CustomerSerializer(customer).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def login_customer(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    customer = Customers.objects.select_related("country").filter(email=email).first()

    if customer is None or not check_password(password, customer.password or ""):
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
        return Response(
            {"message": "Customer not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

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
            customer.password = make_password(password)

        customer.save()

        customer = Customers.objects.select_related("country").get(pk=customer.pk)

        return Response(
            {
                "message": "Account updated successfully.",
                "customer": CustomerSerializer(customer).data,
                "summary": build_customer_summary(customer),
            }
        )

    return Response(
        {
            "customer": CustomerSerializer(customer).data,
            "summary": build_customer_summary(customer),
        }
    )


def build_customer_summary(customer):
    bookings = Bookings.objects.filter(customer=customer)
    booking_count = bookings.count()
    total_spent = bookings.aggregate(total=Sum("total_price")).get("total") or Decimal("0")

    return {
        "booking_count": booking_count,
        "upcoming_trips": booking_count,
        "loyalty_points": int(total_spent // Decimal("10")),
    }


@api_view(["GET"])
def api_root(request):
    return Response({"message": "Welcome to the Skybook Travel API!"})
