from django.test import TestCase
from django.test import override_settings
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from api.models import (
    AdminAuditLogs,
    AdminRoles,
    AdminUsers,
    Airports,
    Bookings,
    Cars,
    Countries,
    Customers,
    Flights,
    Hotels,
    ItineraryDrafts,
    PlannerMessages,
    PlannerSessions,
)


class PlannerWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_create_planner_session(self):
        response = self.client.post(
            "/api/planner/sessions/",
            {
                "title": "Test Planner",
                "origin": "Mumbai",
                "destination": "London",
                "passengers": 2,
                "budget": "2500",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(PlannerSessions.objects.count(), 1)
        session = PlannerSessions.objects.get()
        self.assertEqual(session.origin, "Mumbai")
        self.assertEqual(session.destination, "London")

    def test_planner_message_creates_history(self):
        session = PlannerSessions.objects.create(title="Session", origin="Mumbai", destination="London")

        response = self.client.post(
            f"/api/planner/sessions/{session.session_id}/messages/",
            {"message": "What is the baggage policy?"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(PlannerMessages.objects.filter(session=session).count(), 2)
        self.assertIn("reply", response.json())

    @override_settings(
        FLIGHT_PROVIDER="mock_provider",
        HOTEL_PROVIDER="mock_provider",
        CAR_PROVIDER="mock_provider",
        ENABLE_MOCK_PROVIDERS=True,
    )
    def test_generate_update_and_revalidate_draft(self):
        session = PlannerSessions.objects.create(
            title="Draft Session",
            origin="Mumbai",
            destination="London",
            passengers=2,
        )

        create_response = self.client.post(
            f"/api/planner/sessions/{session.session_id}/plan/",
            {
                "preferences": {
                    "seat_class": "Economy",
                    "hotel_style": "Standard",
                    "car_type": "Any",
                }
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        draft_id = create_response.json()["draft_id"]

        draft = ItineraryDrafts.objects.get(pk=draft_id)
        self.assertIsNotNone(draft.selected_flight)
        self.assertIsNotNone(draft.selected_hotel)
        self.assertIsNotNone(draft.selected_car)

        update_response = self.client.patch(
            f"/api/planner/sessions/{session.session_id}/drafts/{draft_id}/",
            {
                "selected_flight": {
                    "provider": "mock_provider",
                    "provider_reference": "mock-flight-custom",
                    "flight_id": "mock-flight-custom",
                    "flight_number": "MK999",
                    "price": "555.00",
                    "display_price": "555.00",
                },
                "selected_hotel": {
                    "provider": "mock_provider",
                    "provider_reference": "mock-hotel-custom",
                    "hotel_id": "mock-hotel-custom",
                    "hotel_name": "Custom Hotel",
                    "price_per_night": "188.00",
                },
                "selected_car": {
                    "provider": "mock_provider",
                    "provider_reference": "mock-car-custom",
                    "car_id": "mock-car-custom",
                    "company": "Custom Cars",
                    "price_per_day": "66.00",
                },
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["selected_flight"]["flight_number"], "MK999")

        revalidate_response = self.client.post(
            f"/api/planner/sessions/{session.session_id}/drafts/{draft_id}/revalidate/",
            {},
            format="json",
        )
        self.assertEqual(revalidate_response.status_code, 200)
        self.assertEqual(revalidate_response.json()["status"], "validated")
        self.assertIn("revalidation", revalidate_response.json()["ai_metadata"])

    def test_provider_status_endpoint(self):
        response = self.client.get("/api/planner/provider-status/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("flight_provider", payload)
        self.assertIn("rag_configured", payload)

    def test_health_endpoint(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("database", payload)
        self.assertIn("rag", payload)
        self.assertIn("providers", payload)

    def test_readiness_endpoint(self):
        response = self.client.get("/api/ready/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("ready", payload)
        self.assertIn("providers", payload)
        self.assertIn("checked_at", payload)
        self.assertIn("missing", payload)


@override_settings(
    ADMIN_EMAIL="admin@skybook.test",
    ADMIN_PASSWORD="Admin@123",
    ADMIN_NAME="SkyBook Admin",
    ADMIN_TOKEN_TTL_SECONDS=3600,
)
class AdminApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.country = Countries.objects.create(country_name="India", country_code="IN")
        self.departure_airport = Airports.objects.create(
            airport_name="Chhatrapati Shivaji Maharaj International Airport",
            city="Mumbai",
            city_code="BOM",
            country=self.country,
        )
        self.arrival_airport = Airports.objects.create(
            airport_name="Dubai International Airport",
            city="Dubai",
            city_code="DXB",
            country=self.country,
        )
        self.customer = Customers.objects.create(name="Admin Test User", email="user@example.com")
        self.flight = Flights.objects.create(
            flight_number="SB101",
            airline="SkyBook Air",
            departure_airport=self.departure_airport,
            arrival_airport=self.arrival_airport,
            base_price="299.00",
            available_seats=12,
        )
        self.hotel = Hotels.objects.create(
            hotel_name="SkyBook Suites",
            city="Dubai",
            country=self.country,
            price_per_night="149.00",
            rating=4.5,
            available_rooms=9,
        )
        self.car = Cars.objects.create(
            company="SkyDrive",
            car_model="Sedan",
            car_type="Premium",
            city="Dubai",
            country=self.country,
            price_per_day="59.00",
            car_seats=4,
            availability=True,
        )
        self.booking = Bookings.objects.create(
            customer=self.customer,
            flight=self.flight,
            hotel=self.hotel,
            car=self.car,
            outbound_date="2026-04-10",
            return_date="2026-04-14",
            total_price="899.00",
            booking_status="Confirmed",
            is_bundle=True,
            passengers=2,
        )

    def authenticate_admin(self):
        response = self.client.post(
            "/api/admin/auth/login/",
            {"email": "admin@skybook.test", "password": "Admin@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["token"]

    def test_admin_login_rejects_invalid_credentials(self):
        response = self.client.post(
            "/api/admin/auth/login/",
            {"email": "admin@skybook.test", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_admin_dashboard_requires_token(self):
        response = self.client.get("/api/admin/dashboard/")
        self.assertEqual(response.status_code, 401)

    def test_admin_endpoints_return_data_for_authenticated_user(self):
        token = self.authenticate_admin()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        dashboard_response = self.client.get("/api/admin/dashboard/")
        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(dashboard_response.json()["metrics"]["total_bookings"], 1)

        bookings_response = self.client.get("/api/admin/bookings/")
        self.assertEqual(bookings_response.status_code, 200)
        self.assertEqual(bookings_response.json()[0]["customer_name"], "Admin Test User")

        flights_response = self.client.get("/api/admin/flights/")
        self.assertEqual(flights_response.status_code, 200)
        self.assertEqual(flights_response.json()[0]["flight_number"], "SB101")

        hotels_response = self.client.get("/api/admin/hotels/")
        self.assertEqual(hotels_response.status_code, 200)
        self.assertEqual(hotels_response.json()[0]["hotel_name"], "SkyBook Suites")

        cars_response = self.client.get("/api/admin/cars/")
        self.assertEqual(cars_response.status_code, 200)
        self.assertEqual(cars_response.json()[0]["company"], "SkyDrive")

    def test_inventory_crud_and_booking_refund_are_audited(self):
        token = self.authenticate_admin()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        refund_response = self.client.patch(
            f"/api/admin/bookings/{self.booking.booking_id}/status/",
            {"action": "refund"},
            format="json",
        )
        self.assertEqual(refund_response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.booking_status, "Refunded")

        create_flight_response = self.client.post(
            "/api/admin/flights/",
            {
                "flight_number": "SB202",
                "airline": "SkyBook Air",
                "departure_airport": self.departure_airport.airport_id,
                "arrival_airport": self.arrival_airport.airport_id,
                "departure_time": "2026-05-01T10:00:00Z",
                "arrival_time": "2026-05-01T14:00:00Z",
                "base_price": "450.00",
                "available_seats": 18,
                "duration_minutes": 240,
                "flight_class": "Business",
                "status": "Scheduled",
            },
            format="json",
        )
        self.assertEqual(create_flight_response.status_code, 201)
        created_flight_id = create_flight_response.json()["flight_id"]

        delete_flight_response = self.client.delete(f"/api/admin/flights/{created_flight_id}/")
        self.assertEqual(delete_flight_response.status_code, 200)

        self.assertTrue(AdminAuditLogs.objects.filter(action="booking_refund").exists())
        self.assertTrue(AdminAuditLogs.objects.filter(action="flight_create").exists())
        self.assertTrue(AdminAuditLogs.objects.filter(action="flight_delete").exists())

    def test_inventory_admin_cannot_refund_bookings(self):
        self.authenticate_admin()
        inventory_role = AdminRoles.objects.get(code="inventory_admin")
        inventory_admin = AdminUsers.objects.create(
            role=inventory_role,
            email="inventory@skybook.test",
            full_name="Inventory Manager",
            password_hash=make_password("Inventory@123"),
            is_active=True,
        )

        response = self.client.post(
            "/api/admin/auth/login/",
            {"email": inventory_admin.email, "password": "Inventory@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        token = response.json()["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        refund_response = self.client.patch(
            f"/api/admin/bookings/{self.booking.booking_id}/status/",
            {"action": "refund"},
            format="json",
        )
        self.assertEqual(refund_response.status_code, 403)

    @override_settings(ADMIN_MAX_FAILED_ATTEMPTS=2, ADMIN_LOCKOUT_MINUTES=10)
    def test_admin_account_locks_after_failed_attempts(self):
        self.client.post(
            "/api/admin/auth/login/",
            {"email": "admin@skybook.test", "password": "wrong-1"},
            format="json",
        )
        self.client.post(
            "/api/admin/auth/login/",
            {"email": "admin@skybook.test", "password": "wrong-2"},
            format="json",
        )
        locked_response = self.client.post(
            "/api/admin/auth/login/",
            {"email": "admin@skybook.test", "password": "Admin@123"},
            format="json",
        )
        self.assertEqual(locked_response.status_code, 401)
