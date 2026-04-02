import shutil
import uuid
from pathlib import Path
from unittest.mock import patch

from django.core import mail
from django.test import TestCase
from django.test import override_settings
from django.contrib.auth.hashers import check_password, make_password
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
from api.services.inventory_service import InventoryService
from api.services.planner_service import (
    PlannerReply,
    PlannerService,
    build_planner_conversation_context,
    classify_planner_intent,
)
from api.services.providers import ProviderSearchContext
from api.services.rag_service import RagDocument, RagService


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
        self.assertIn("llm_provider", payload)

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
        FLIGHT_PROVIDER="mock_provider",
        HOTEL_PROVIDER="mock_provider",
        CAR_PROVIDER="mock_provider",
        ENABLE_MOCK_PROVIDERS=True,
    )
    def test_planner_draft_enrichment_endpoint(self):
        session = PlannerSessions.objects.create(
            title="Enrich Session",
            origin="Mumbai, India (BOM)",
            destination="Dubai, United Arab Emirates (DXB)",
            passengers=1,
        )

        create_response = self.client.post(
            f"/api/planner/sessions/{session.session_id}/plan/",
            {
                "include_insights": False,
                "preferences": {
                    "trip_type": "Cultural Exploration",
                    "seat_class": "Economy",
                },
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        draft_id = create_response.json()["draft_id"]
        self.assertFalse(create_response.json()["ai_metadata"]["insights_ready"])

        enrich_response = self.client.post(
            f"/api/planner/sessions/{session.session_id}/drafts/{draft_id}/enrich/",
            {},
            format="json",
        )
        self.assertEqual(enrich_response.status_code, 200)
        payload = enrich_response.json()
        self.assertTrue(payload["ai_metadata"]["insights_ready"])
        self.assertIn("itinerary", payload["ai_metadata"])


class BookingReferenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.country = Countries.objects.create(country_name="India", country_code="IN")
        self.customer = Customers.objects.create(name="Reference User", email="reference@example.com")
        self.booking = Bookings.objects.create(
            customer=self.customer,
            outbound_date="2026-04-10",
            return_date="2026-04-15",
            total_price="730.00",
            booking_status="Confirmed",
            is_bundle=True,
            passengers=1,
        )

    def test_retrieve_booking_accepts_full_reference(self):
        response = self.client.get(f"/api/bookings/SNA{self.booking.booking_id:06d}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["booking_id"], self.booking.booking_id)

    def test_retrieve_booking_accepts_short_prefixed_reference(self):
        response = self.client.get(f"/api/bookings/SNA{self.booking.booking_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["booking_id"], self.booking.booking_id)

    def test_retrieve_booking_accepts_numeric_reference(self):
        response = self.client.get(f"/api/bookings/{self.booking.booking_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["booking_id"], self.booking.booking_id)

    def test_booking_creation_persists_booking_metadata(self):
        response = self.client.post(
            "/api/bookings/",
            {
                "name": "Snapshot User",
                "email": "snapshot@example.com",
                "check_in": "2026-04-10",
                "check_out": "2026-04-15",
                "passengers": 1,
                "seat_class": "Economy",
                "total_price": "730.00",
                "booking_metadata": {
                    "selected_flight": {
                        "provider": "serpapi",
                        "flight_number": "EK501",
                    },
                    "selected_hotel": {
                        "provider": "rapidapi_hotels",
                        "hotel_name": "Dubai Marina Hotel",
                    },
                    "selected_car": {
                        "provider": "local_db",
                        "company": "SkyDrive",
                        "car_model": "Sedan",
                    },
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["booking_metadata"]["selected_flight"]["flight_number"], "EK501")
        self.assertEqual(payload["booking_metadata"]["selected_hotel"]["hotel_name"], "Dubai Marina Hotel")
        self.assertEqual(payload["provider_booking"]["source_of_truth"], "hybrid")
        self.assertEqual(payload["provider_booking"]["items"]["flight"]["provider"], "serpapi")
        self.assertEqual(
            payload["provider_booking"]["items"]["hotel"]["selection"]["hotel_name"],
            "Dubai Marina Hotel",
        )

    def test_booking_creation_requires_resolved_customer(self):
        response = self.client.post(
            "/api/bookings/",
            {
                "check_in": "2026-04-10",
                "check_out": "2026-04-15",
                "passengers": 1,
                "seat_class": "Economy",
                "total_price": "730.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["message"],
            "A valid signed-in customer is required to create a booking.",
        )

    def test_booking_creation_normalizes_local_inventory_provider_snapshot(self):
        departure_airport = Airports.objects.create(
            airport_name="Chhatrapati Shivaji Maharaj International Airport",
            city="Mumbai",
            city_code="BOM",
            country=self.country,
        )
        arrival_airport = Airports.objects.create(
            airport_name="Heathrow Airport",
            city="London",
            city_code="LHR",
            country=self.country,
        )
        flight = Flights.objects.create(
            flight_number="SB321",
            airline="SkyBook Air",
            departure_airport=departure_airport,
            arrival_airport=arrival_airport,
            base_price="500.00",
            available_seats=6,
        )

        response = self.client.post(
            "/api/bookings/",
            {
                "name": "Local Inventory User",
                "email": "local@example.com",
                "flight": flight.flight_id,
                "outbound_date": "2026-05-10",
                "return_date": "2026-05-14",
                "passengers": 1,
                "total_price": "500.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["provider_booking"]["source_of_truth"], "database")
        self.assertEqual(payload["provider_booking"]["items"]["flight"]["provider"], "local_db")
        self.assertTrue(payload["provider_booking"]["items"]["flight"]["supports_recheck"])

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        BOOKING_CONFIRMATION_EMAILS_ENABLED=True,
        DEFAULT_FROM_EMAIL="SkyBook <no-reply@skybook.test>",
    )
    def test_booking_creation_sends_confirmation_email(self):
        response = self.client.post(
            "/api/bookings/",
            {
                "name": "Email User",
                "email": "emailuser@example.com",
                "check_in": "2026-04-10",
                "check_out": "2026-04-15",
                "passengers": 1,
                "seat_class": "Economy",
                "total_price": "730.00",
                "booking_metadata": {
                    "selected_flight": {
                        "flight_number": "EK501",
                        "airline": "SkyBook Air",
                        "price": "500.00",
                    },
                    "selected_hotel": {
                        "hotel_name": "Dubai Marina Hotel",
                        "city": "Dubai",
                        "price_per_night": "120.00",
                    },
                    "selected_car": {
                        "company": "SkyDrive",
                        "car_model": "Sedan",
                        "price_per_day": "40.00",
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["emailuser@example.com"])
        self.assertIn("SkyBook booking confirmed", sent.subject)
        self.assertIn("Dubai Marina Hotel", sent.body)
        self.assertIn("SkyDrive Sedan", sent.body)


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

    def test_super_admin_can_create_update_and_deactivate_admin_users(self):
        token = self.authenticate_admin()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        inventory_role = AdminRoles.objects.get(code="inventory_admin")
        ops_role = AdminRoles.objects.get(code="ops_admin")

        create_response = self.client.post(
            "/api/admin/users/",
            {
                "email": "teamlead@skybook.test",
                "full_name": "Team Lead",
                "password": "TeamLead@123",
                "role_id": inventory_role.role_id,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        created_admin_id = create_response.json()["admin_user_id"]
        created_admin = AdminUsers.objects.get(pk=created_admin_id)
        self.assertTrue(check_password("TeamLead@123", created_admin.password_hash))
        self.assertEqual(created_admin.role_id, inventory_role.role_id)

        update_response = self.client.patch(
            f"/api/admin/users/{created_admin_id}/",
            {
                "email": "teamlead.updated@skybook.test",
                "full_name": "Team Lead Updated",
                "password": "Updated@123",
                "role_id": ops_role.role_id,
                "is_active": False,
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)

        created_admin.refresh_from_db()
        self.assertEqual(created_admin.email, "teamlead.updated@skybook.test")
        self.assertEqual(created_admin.full_name, "Team Lead Updated")
        self.assertEqual(created_admin.role_id, ops_role.role_id)
        self.assertFalse(created_admin.is_active)
        self.assertTrue(check_password("Updated@123", created_admin.password_hash))
        self.assertTrue(AdminAuditLogs.objects.filter(action="admin_user_create").exists())
        self.assertTrue(AdminAuditLogs.objects.filter(action="admin_user_update").exists())

    def test_ops_admin_cannot_access_admin_users(self):
        self.authenticate_admin()
        ops_role = AdminRoles.objects.get(code="ops_admin")
        ops_admin = AdminUsers.objects.create(
            role=ops_role,
            email="ops-manager@skybook.test",
            full_name="Ops Manager",
            password_hash=make_password("OpsManager@123"),
            is_active=True,
        )

        response = self.client.post(
            "/api/admin/auth/login/",
            {"email": ops_admin.email, "password": "OpsManager@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        token = response.json()["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        list_response = self.client.get("/api/admin/users/")
        self.assertEqual(list_response.status_code, 403)

        create_response = self.client.post(
            "/api/admin/users/",
            {
                "email": "blocked@skybook.test",
                "full_name": "Blocked User",
                "password": "Blocked@123",
                "role_id": ops_role.role_id,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 403)

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


class RagServiceTests(TestCase):
    def test_load_chunked_documents_adds_title_and_route_metadata(self):
        temp_dir = Path.cwd() / f"tmp_rag_kb_{uuid.uuid4().hex}"
        try:
            kb_root = temp_dir
            kb_root.mkdir(parents=True, exist_ok=True)
            visa_dir = kb_root / "visa_policies"
            visa_dir.mkdir(parents=True, exist_ok=True)
            source_file = visa_dir / "india_to_london.md"
            source_file.write_text(
                "# Visa Policy: Indian Passport to London\n\n## Quick Summary\nVisa required.\n",
                encoding="utf-8",
            )

            with override_settings(AI_KNOWLEDGE_BASE_PATH=str(kb_root)):
                service = RagService()
                documents = service._load_chunked_documents()

            self.assertEqual(len(documents), 1)
            metadata = documents[0].metadata
            self.assertEqual(metadata["type"], "visa_policies")
            self.assertEqual(metadata["origin"], "india")
            self.assertEqual(metadata["destination"], "london")
            self.assertEqual(metadata["title"], "Visa Policy: Indian Passport to London")
            self.assertIn("Quick Summary", metadata["headings"])
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_keyword_retrieve_prioritizes_matching_visa_route(self):
        service = RagService()
        india_london = RagDocument(
            page_content="Visa required for Indian passport holders visiting London.",
            metadata={
                "source": "visa_policies/india_to_london.md",
                "type": "visa_policies",
                "title": "India to London Visa Policy",
                "origin": "india",
                "destination": "london",
                "chunk_index": 1,
            },
        )
        usa_tokyo = RagDocument(
            page_content="Visa waiver available for some USA travelers visiting Tokyo.",
            metadata={
                "source": "visa_policies/usa_to_tokyo.md",
                "type": "visa_policies",
                "title": "USA to Tokyo Visa Policy",
                "origin": "usa",
                "destination": "tokyo",
                "chunk_index": 1,
            },
        )

        with patch.object(RagService, "_load_chunked_documents", return_value=[usa_tokyo, india_london]):
            results = service._keyword_retrieve("Do Indian passport holders need a visa for London?")

        self.assertEqual(results[0].metadata["source"], "visa_policies/india_to_london.md")

    def test_answer_question_uses_extractive_fallback_without_llm(self):
        service = RagService()
        chunks = [
            RagDocument(
                page_content=(
                    "SkyNest Airlines Baggage Policy\n\n"
                    "Cabin baggage: Economy passengers may carry 1 cabin bag up to 7 kg.\n"
                    "Checked baggage: Long-haul economy includes 23 kg."
                ),
                metadata={
                    "source": "flights_policies/baggage.md",
                    "type": "flights_policies",
                    "title": "SkyNest Airlines Baggage Policy",
                    "chunk_index": 1,
                },
            )
        ]

        with patch.object(RagService, "fetch_context", return_value=chunks):
            with patch.object(service.llm, "is_configured", return_value=False):
                answer, sources = service.answer_question("What is the baggage allowance?")

        self.assertEqual(sources, chunks)
        self.assertIn("SkyNest knowledge base", answer)
        self.assertIn("7 kg", answer)

    def test_fetch_context_prefers_advanced_retrieval_when_available(self):
        service = RagService()
        advanced_docs = [
            RagDocument(
                page_content="Advanced visa chunk",
                metadata={"source": "advanced", "type": "visa_policies"},
            )
        ]
        with patch.object(RagService, "_advanced_retrieve", return_value=advanced_docs):
            with patch.object(RagService, "_hybrid_retrieve") as hybrid_retrieve:
                results = service.fetch_context("Visa for London?", [])

        self.assertEqual(results, advanced_docs)
        hybrid_retrieve.assert_not_called()


class PlannerMessageEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_planner_message_endpoint_persists_user_and_assistant_messages(self):
        session = PlannerSessions.objects.create(title="Chat Session", origin="Mumbai", destination="London")

        with patch("api.views.PlannerService.generate_chat_reply") as generate_chat_reply:
            generate_chat_reply.return_value = PlannerReply(
                reply="Cabin baggage in Economy is 7 kg.",
                mode="rag",
                sources=[{"source": "flights_policies/baggage.md", "doc_type": "flights_policies"}],
            )
            response = self.client.post(
                f"/api/planner/sessions/{session.session_id}/messages/",
                {"message": "What is the baggage policy?"},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mode"], "rag")
        self.assertEqual(PlannerMessages.objects.filter(session=session).count(), 2)
        self.assertEqual(
            list(PlannerMessages.objects.filter(session=session).order_by("created_at").values_list("role", flat=True)),
            ["user", "assistant"],
        )


class InventoryFallbackTests(TestCase):
    def test_search_with_fallback_uses_local_results_when_primary_provider_fails(self):
        service = InventoryService()
        primary_provider = type(
            "PrimaryProvider",
            (),
            {
                "provider_name": "serpapi",
                "search": lambda self, context: (_ for _ in ()).throw(RuntimeError("provider down")),
            },
        )()
        fallback_provider = type(
            "FallbackProvider",
            (),
            {
                "search": lambda self, context: [{"provider": "local_db", "flight_number": "SB101"}],
            },
        )()

        with patch.object(service, "_get_local_fallback_provider", return_value=fallback_provider):
            results = service._search_with_fallback(
                provider_type="flight",
                context=ProviderSearchContext(
                    origin="mumbai",
                    destination="london",
                    passengers=1,
                    preferences={},
                ),
                provider=primary_provider,
            )

        self.assertEqual(results[0]["provider"], "local_db")

    def test_search_with_fallback_adds_normalized_source_and_reference_fields(self):
        service = InventoryService()
        primary_provider = type(
            "PrimaryProvider",
            (),
            {
                "provider_name": "serpapi",
                "search": lambda self, context: [
                    {"flight_id": "live-1", "price": "300.00", "departure_city": "Mumbai", "arrival_city": "London"}
                ],
            },
        )()

        results = service._search_with_fallback(
            provider_type="flight",
            context=ProviderSearchContext(origin="mumbai", destination="london", passengers=1, preferences={}),
            provider=primary_provider,
        )

        self.assertEqual(results[0]["source"], "live")
        self.assertEqual(results[0]["provider_reference"], "live-1")
        self.assertEqual(results[0]["result_rank"], 1)


class LlmServiceConfigTests(TestCase):
    @override_settings(OPENAI_API_KEY="your-openai-key", LLM_PROVIDER="openai")
    def test_placeholder_openai_key_is_not_treated_as_configured(self):
        from api.services.llm_service import LlmService

        service = LlmService()
        self.assertFalse(service.is_configured())


class PlannerIntentRoutingTests(TestCase):
    def test_classify_planner_intent_prefers_planning_for_trip_request(self):
        intent = classify_planner_intent("Plan a 5 day trip to London under $2500")
        self.assertEqual(intent.kind, "planning")

    def test_classify_planner_intent_identifies_inventory_search(self):
        intent = classify_planner_intent("Show me flight options from Mumbai to London for 2 passengers")
        self.assertEqual(intent.kind, "inventory")
        self.assertEqual(intent.inventory_request["type"], "flight")

    def test_classify_planner_intent_identifies_knowledge_question(self):
        intent = classify_planner_intent("What is the baggage allowance for economy class?")
        self.assertEqual(intent.kind, "knowledge")

    def test_generate_chat_reply_uses_planning_mode_for_trip_request(self):
        service = PlannerService()
        with patch.object(PlannerService, "_try_rag_reply") as try_rag_reply:
            with patch.object(PlannerService, "_try_inventory_reply") as try_inventory_reply:
                reply = service.generate_chat_reply("Plan a 7 day trip to Dubai under $3000")

        self.assertEqual(reply.mode, "planning")
        self.assertIn("planner draft", reply.reply.lower())
        try_rag_reply.assert_not_called()
        try_inventory_reply.assert_not_called()

    def test_generate_chat_reply_uses_inventory_mode_for_live_search(self):
        service = PlannerService()
        expected = PlannerReply(reply="Inventory reply", mode="inventory", sources=[])
        with patch.object(PlannerService, "_try_inventory_reply", return_value=expected) as try_inventory_reply:
            with patch.object(PlannerService, "_try_rag_reply") as try_rag_reply:
                reply = service.generate_chat_reply("Find hotel options in London")

        self.assertEqual(reply.mode, "inventory")
        try_inventory_reply.assert_called_once()
        try_rag_reply.assert_not_called()

    def test_generate_chat_reply_uses_rag_for_knowledge_question(self):
        service = PlannerService()
        expected = PlannerReply(reply="KB reply", mode="rag", sources=[])
        with patch.object(PlannerService, "_try_inventory_reply") as try_inventory_reply:
            with patch.object(PlannerService, "_try_rag_reply", return_value=expected) as try_rag_reply:
                reply = service.generate_chat_reply("Do Indian passport holders need a visa for London?")

        self.assertEqual(reply.mode, "rag")
        try_inventory_reply.assert_not_called()
        try_rag_reply.assert_called_once()

    def test_follow_up_inventory_intent_reuses_destination_from_history(self):
        history = [
            {"role": "user", "content": "Plan a 5 day trip to London under $2500"},
            {"role": "assistant", "content": "I can help with London."},
        ]
        context = build_planner_conversation_context(history)
        intent = classify_planner_intent("What about hotels there?", history, context)

        self.assertEqual(intent.kind, "inventory")
        self.assertEqual(intent.inventory_request["type"], "hotel")
        self.assertEqual(intent.inventory_request["destination"], "London")

    def test_follow_up_planning_intent_reuses_trip_context(self):
        history = [
            {"role": "user", "content": "Plan a 7 day trip to Dubai under $3000"},
            {"role": "assistant", "content": "I can help plan 7 days in Dubai with $3000."},
        ]
        context = build_planner_conversation_context(history)
        intent = classify_planner_intent("Can you make it business class?", history, context)

        self.assertEqual(intent.kind, "planning")
        self.assertEqual(intent.plan_request["destination"], "Dubai")
        self.assertEqual(intent.plan_request["budget"], 3000)

    def test_follow_up_inventory_request_inherits_preference_context(self):
        history = [
            {"role": "user", "content": "Show me flight options from Mumbai to London in business class for 2 passengers"},
            {"role": "assistant", "content": "Here are the options."},
        ]
        context = build_planner_conversation_context(history)
        intent = classify_planner_intent("Any flights tomorrow?", history, context)

        self.assertEqual(intent.kind, "inventory")
        self.assertEqual(intent.inventory_request["origin"], "Mumbai")
        self.assertEqual(intent.inventory_request["destination"], "London")
        self.assertEqual(intent.inventory_request["preferences"]["seat_class"], "Business")


class PlannerProviderHardeningTests(TestCase):
    def test_pick_return_flight_prefers_same_provider_as_outbound(self):
        service = PlannerService()
        selected = service._pick_return_flight(
            {"provider": "serpapi", "flight_id": "out-1"},
            [
                {"provider": "local_db", "flight_id": "ret-local"},
                {"provider": "serpapi", "flight_id": "ret-live"},
            ],
        )

        self.assertEqual(selected["flight_id"], "ret-live")


class BackendVerificationClosureTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.country = Countries.objects.create(country_name="India", country_code="IN")

    def test_ai_chat_returns_rag_mode_with_sources(self):
        with patch("api.views.PlannerService.generate_chat_reply") as generate_chat_reply:
            generate_chat_reply.return_value = PlannerReply(
                reply="Indian passport holders need a visa for London.",
                mode="rag",
                sources=[{"source": "visa_policies/india_to_london.md", "doc_type": "visa_policies"}],
            )
            response = self.client.post(
                "/api/chat",
                {"message": "Do Indian passport holders need a visa for London?", "history": []},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mode"], "rag")
        self.assertEqual(payload["sources"][0]["doc_type"], "visa_policies")

    def test_ai_chat_falls_back_to_rag_when_inventory_lookup_fails(self):
        service = PlannerService()
        with patch.object(PlannerService, "_try_inventory_reply", return_value=None):
            with patch.object(
                PlannerService,
                "_try_rag_reply",
                return_value=PlannerReply(reply="Fallback KB answer", mode="rag", sources=[]),
            ):
                reply = service.generate_chat_reply("Show me flight options from Mumbai to London")

        self.assertEqual(reply.mode, "rag")
        self.assertEqual(reply.reply, "Fallback KB answer")

    @override_settings(
        FLIGHT_PROVIDER="mock_provider",
        HOTEL_PROVIDER="mock_provider",
        CAR_PROVIDER="mock_provider",
        ENABLE_MOCK_PROVIDERS=True,
    )
    def test_planner_plan_and_enrich_endpoints_return_expected_shapes(self):
        session = PlannerSessions.objects.create(
            title="Verification Session",
            origin="Mumbai",
            destination="Dubai",
            passengers=1,
        )
        draft = ItineraryDrafts.objects.create(
            session=session,
            status="draft",
            title="Dubai itinerary",
            summary="Prepared draft",
            origin="Mumbai",
            destination="Dubai",
            passengers=1,
            estimated_total="1200.00",
            ai_metadata={"insights_ready": False},
        )

        with patch("api.views.PlannerService.build_trip_plan", return_value=draft):
            create_response = self.client.post(
                f"/api/planner/sessions/{session.session_id}/plan/",
                {
                    "include_insights": False,
                    "preferences": {"seat_class": "Economy", "trip_type": "City Break"},
                },
                format="json",
            )
        self.assertEqual(create_response.status_code, 201)
        create_payload = create_response.json()
        self.assertIn("draft_id", create_payload)
        self.assertFalse(create_payload["ai_metadata"]["insights_ready"])

        draft.ai_metadata = {
            "insights_ready": True,
            "quality_score": {"score": 8},
            "destination_brief": "Dubai is a strong fit.",
        }
        draft.save(update_fields=["ai_metadata"])

        with patch("api.views.PlannerService.enrich_draft", return_value=draft):
            enrich_response = self.client.post(
                f"/api/planner/sessions/{session.session_id}/drafts/{create_payload['draft_id']}/enrich/",
                {},
                format="json",
            )
        self.assertEqual(enrich_response.status_code, 200)
        enrich_payload = enrich_response.json()
        self.assertTrue(enrich_payload["ai_metadata"]["insights_ready"])
        self.assertIn("quality_score", enrich_payload["ai_metadata"])
        self.assertIn("destination_brief", enrich_payload["ai_metadata"])

    def test_booking_create_and_retrieve_include_provider_booking_snapshot(self):
        response = self.client.post(
            "/api/bookings/",
            {
                "name": "Closure User",
                "email": "closure@example.com",
                "check_in": "2026-06-10",
                "check_out": "2026-06-15",
                "passengers": 1,
                "total_price": "810.00",
                "booking_metadata": {
                    "selected_flight": {
                        "provider": "serpapi",
                        "provider_reference": "live-flight-123",
                        "flight_number": "EK501",
                    },
                    "selected_hotel": {
                        "provider": "rapidapi_hotels",
                        "provider_reference": "hotel-abc",
                        "hotel_name": "Marina Stay",
                    },
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        created = response.json()

        retrieve_response = self.client.get(f"/api/bookings/{created['booking_reference']}/")
        self.assertEqual(retrieve_response.status_code, 200)
        retrieved = retrieve_response.json()
        self.assertEqual(retrieved["provider_booking"]["source_of_truth"], "external")
        self.assertEqual(retrieved["provider_booking"]["provider_refs"]["flight"], "live-flight-123")
        self.assertEqual(retrieved["provider_booking"]["items"]["hotel"]["provider"], "rapidapi_hotels")
