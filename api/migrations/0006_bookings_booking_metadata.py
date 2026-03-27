from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0005_providersearchcache"),
    ]

    operations = [
        migrations.AddField(
            model_name="bookings",
            name="booking_metadata",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
