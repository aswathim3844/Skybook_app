from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_countries_cars_airports_customers_flights_hotels_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="itinerarydrafts",
            name="return_flight_options",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
