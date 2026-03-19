from rest_framework import serializers
from .models import Flights, Hotels, Cars, Bookings, Countries, Customers


class FlightSerializer(serializers.ModelSerializer):
    departure_city = serializers.CharField(
        source="departure_airport.city", read_only=True
    )
    arrival_city = serializers.CharField(
        source="arrival_airport.city", read_only=True
    )
    departure_airport_name = serializers.CharField(
        source="departure_airport.airport_name", read_only=True
    )
    arrival_airport_name = serializers.CharField(
        source="arrival_airport.airport_name", read_only=True
    )
    departure_time_display = serializers.SerializerMethodField()
    arrival_time_display = serializers.SerializerMethodField()
    duration_display = serializers.SerializerMethodField()
    code = serializers.SerializerMethodField()
    logo = serializers.SerializerMethodField()
    stops = serializers.SerializerMethodField()
    price = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=True
    )

    class Meta:
        model = Flights
        fields = [
            "flight_id",
            "airline",
            "price",
            "departure_airport",
            "arrival_airport",
            "departure_city",
            "arrival_city",
            "departure_airport_name",
            "arrival_airport_name",
            "departure_time",
            "arrival_time",
            "departure_time_display",
            "arrival_time_display",
            "duration_display",
            "code",
            "logo",
            "stops",
        ]

    def get_departure_time_display(self, obj):
        return obj.departure_time.strftime("%H:%M") if obj.departure_time else None

    def get_arrival_time_display(self, obj):
        return obj.arrival_time.strftime("%H:%M") if obj.arrival_time else None

    def get_duration_display(self, obj):
        if not obj.departure_time or not obj.arrival_time:
            return None

        delta = obj.arrival_time - obj.departure_time
        total_minutes = int(delta.total_seconds() // 60)
        hours = total_minutes // 60
        minutes = total_minutes % 60
        return f"{hours}h {minutes}m"

    def get_code(self, obj):
        airline = (obj.airline or "SK")[:2].upper()
        return f"{airline} {obj.flight_id}"

    def get_logo(self, obj):
        return (obj.airline or "SK")[:2].upper()

    def get_stops(self, obj):
        return "Nonstop"


class HotelSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.country_name", read_only=True)
    price_per_night = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=True
    )

    class Meta:
        model = Hotels
        fields = [
            "hotel_id",
            "hotel_name",
            "city",
            "country",
            "country_name",
            "latitude",
            "longitude",
            "price_per_night",
            "rating",
        ]


class CarSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.country_name", read_only=True)
    price_per_day = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=True
    )

    class Meta:
        model = Cars
        fields = [
            "car_id",
            "company",
            "car_model",
            "city",
            "country",
            "country_name",
            "latitude",
            "longitude",
            "price_per_day",
            "car_seats",
            "rating",
            "availability",
        ]


class BookingSerializer(serializers.ModelSerializer):
    total_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, coerce_to_string=True
    )
    flight_details = FlightSerializer(source="flight", read_only=True)
    hotel_details = HotelSerializer(source="hotel", read_only=True)
    car_details = CarSerializer(source="car", read_only=True)

    class Meta:
        model = Bookings
        fields = [
            "booking_id",
            "customer",
            "flight",
            "hotel",
            "car",
            "booking_date",
            "trip_days",
            "total_price",
            "flight_details",
            "hotel_details",
            "car_details",
        ]


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Countries
        fields = ["country_id", "country_name"]


class CustomerSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.country_name", read_only=True)

    class Meta:
        model = Customers
        fields = ["customer_id", "name", "email", "phone", "country", "country_name"]
