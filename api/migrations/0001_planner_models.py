from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="PlannerSessions",
            fields=[
                ("session_id", models.BigAutoField(primary_key=True, serialize=False)),
                ("customer_id", models.IntegerField(blank=True, null=True)),
                ("title", models.CharField(blank=True, max_length=255, null=True)),
                ("status", models.CharField(default="active", max_length=30)),
                ("origin", models.CharField(blank=True, max_length=255, null=True)),
                ("destination", models.CharField(blank=True, max_length=255, null=True)),
                ("departure_date", models.DateField(blank=True, null=True)),
                ("return_date", models.DateField(blank=True, null=True)),
                ("passengers", models.IntegerField(blank=True, null=True)),
                ("budget", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("trip_preferences", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "planner_sessions"},
        ),
        migrations.CreateModel(
            name="PlannerMessages",
            fields=[
                ("message_id", models.BigAutoField(primary_key=True, serialize=False)),
                ("role", models.CharField(max_length=20)),
                ("content", models.TextField()),
                ("message_metadata", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "session",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="messages", to="api.plannersessions"),
                ),
            ],
            options={"db_table": "planner_messages", "ordering": ["created_at", "message_id"]},
        ),
        migrations.CreateModel(
            name="ItineraryDrafts",
            fields=[
                ("draft_id", models.BigAutoField(primary_key=True, serialize=False)),
                ("status", models.CharField(default="draft", max_length=30)),
                ("title", models.CharField(blank=True, max_length=255, null=True)),
                ("summary", models.TextField(blank=True, null=True)),
                ("origin", models.CharField(blank=True, max_length=255, null=True)),
                ("destination", models.CharField(blank=True, max_length=255, null=True)),
                ("departure_date", models.DateField(blank=True, null=True)),
                ("return_date", models.DateField(blank=True, null=True)),
                ("passengers", models.IntegerField(blank=True, null=True)),
                ("budget", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("estimated_total", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("selected_flight", models.JSONField(blank=True, null=True)),
                ("selected_return_flight", models.JSONField(blank=True, null=True)),
                ("selected_hotel", models.JSONField(blank=True, null=True)),
                ("selected_car", models.JSONField(blank=True, null=True)),
                ("flight_options", models.JSONField(blank=True, null=True)),
                ("hotel_options", models.JSONField(blank=True, null=True)),
                ("car_options", models.JSONField(blank=True, null=True)),
                ("ai_metadata", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "session",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="drafts", to="api.plannersessions"),
                ),
            ],
            options={"db_table": "itinerary_drafts"},
        ),
    ]
