from rest_framework import serializers
from .models import Flights, Hotels, Cars, Bookings, Countries, Customers, Payments


class FlightSerializer(serializers.ModelSerializer):
    departure_city = serializers.CharField(source="departure_airport.city", read_only=True)
    arrival_city = serializers.CharField(source="arrival_airport.city", read_only=True)
    departure_airport_name = serializers.CharField(
        source="departure_airport.airport_name", read_only=True
    )
    arrival_airport_name = serializers.CharField(
        source="arrival_airport.airport_name", read_only=True
    )
    departure_city_code = serializers.CharField(source="departure_airport.city_code", read_only=True)
    arrival_city_code = serializers.CharField(source="arrival_airport.city_code", read_only=True)
    departure_time_display = serializers.SerializerMethodField()
    arrival_time_display = serializers.SerializerMethodField()
    duration_display = serializers.SerializerMethodField()
    code = serializers.SerializerMethodField()
    logo = serializers.SerializerMethodField()
    stops = serializers.SerializerMethodField()
    price = serializers.DecimalField(source="base_price", max_digits=10, decimal_places=2, coerce_to_string=True)

    class Meta:
        model = Flights
        fields = [
            "flight_id",
            "flight_number",
            "airline",
            "price",
            "base_price",
            "departure_airport",
            "arrival_airport",
            "departure_city",
            "arrival_city",
            "departure_city_code",
            "arrival_city_code",
            "departure_airport_name",
            "arrival_airport_name",
            "departure_time",
            "arrival_time",
            "departure_time_display",
            "arrival_time_display",
            "duration_minutes",
            "duration_display",
            "available_seats",
            "flight_class",
            "status",
            "code",
            "logo",
            "stops",
        ]

    def get_departure_time_display(self, obj):
        return obj.departure_time.strftime("%H:%M") if obj.departure_time else None

    def get_arrival_time_display(self, obj):
        return obj.arrival_time.strftime("%H:%M") if obj.arrival_time else None

    def get_duration_display(self, obj):
        if obj.duration_minutes:
            hours = int(obj.duration_minutes) // 60
            minutes = int(obj.duration_minutes) % 60
            return f"{hours}h {minutes}m"

        if not obj.departure_time or not obj.arrival_time:
            return None

        delta = obj.arrival_time - obj.departure_time
        total_minutes = int(delta.total_seconds() // 60)
        hours = total_minutes // 60
        minutes = total_minutes % 60
        return f"{hours}h {minutes}m"

    def get_code(self, obj):
        if obj.flight_number:
            return obj.flight_number
        airline = (obj.airline or "SK")[:2].upper()
        return f"{airline} {obj.flight_id}"

    def get_logo(self, obj):
        return (obj.airline or "SK")[:2].upper()

    def get_stops(self, obj):
        return "Nonstop"


class HotelSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.country_name", read_only=True)
    price_per_night = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=True)

    class Meta:
        model = Hotels
        fields = [
            "hotel_id",
            "hotel_name",
            "city",
            "country",
            "country_name",
            "price_per_night",
            "rating",
            "description",
            "image_url",
            "amenities",
            "available_rooms",
        ]


class CarSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.country_name", read_only=True)
    price_per_day = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=True)

    class Meta:
        model = Cars
        fields = [
            "car_id",
            "company",
            "car_model",
            "car_type",
            "city",
            "country",
            "country_name",
            "price_per_day",
            "car_seats",
            "image_url",
            "availability",
            "description",
        ]


class BookingSerializer(serializers.ModelSerializer):
    total_price = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=True)
    flight_details = FlightSerializer(source="flight", read_only=True)
    return_flight_details = FlightSerializer(source="return_flight", read_only=True)
    hotel_details = HotelSerializer(source="hotel", read_only=True)
    car_details = CarSerializer(source="car", read_only=True)
    booking_reference = serializers.SerializerMethodField()

    class Meta:
        model = Bookings
        fields = [
            "booking_id",
            "customer",
            "flight",
            "return_flight",
            "hotel",
            "car",
            "outbound_date",
            "return_date",
            "is_bundle",
            "total_price",
            "booking_status",
            "booking_reference",
            "passengers",
            "seat_class",
            "created_at",
            "flight_details",
            "return_flight_details",
            "hotel_details",
            "car_details",
        ]

    def get_booking_reference(self, obj):
        return f"SNA{int(obj.booking_id):06d}"


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Countries
        fields = ["country_id", "country_name", "country_code"]


class CustomerSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.country_name", read_only=True)

    class Meta:
        model = Customers
        fields = [
            "customer_id",
            "name",
            "email",
            "phone",
            "country",
            "country_name",
            "date_of_birth",
            "passport_number",
            "created_at",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=True)

    class Meta:
        model = Payments
        fields = [
            "payment_id",
            "booking",
            "amount",
            "payment_method",
            "payment_status",
            "transaction_id",
            "paid_at",
        ]
