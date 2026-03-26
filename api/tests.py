from django.test import TestCase
from django.test import override_settings
from rest_framework.test import APIClient

from api.models import ItineraryDrafts, PlannerMessages, PlannerSessions


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
