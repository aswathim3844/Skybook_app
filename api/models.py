# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class Airports(models.Model):
    airport_id = models.AutoField(primary_key=True)
    airport_name = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    country = models.ForeignKey('Countries', models.DO_NOTHING, blank=True, null=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)

    class Meta:
        
        db_table = 'airports'


class Bookings(models.Model):
    booking_id = models.AutoField(primary_key=True)
    customer = models.ForeignKey('Customers', models.DO_NOTHING, blank=True, null=True)
    flight = models.ForeignKey('Flights', models.DO_NOTHING, blank=True, null=True)
    hotel = models.ForeignKey('Hotels', models.DO_NOTHING, blank=True, null=True)
    car = models.ForeignKey('Cars', models.DO_NOTHING, blank=True, null=True)
    booking_date = models.DateField(blank=True, null=True)
    trip_days = models.IntegerField(blank=True, null=True)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    class Meta:
       
        db_table = 'bookings'


class Cars(models.Model):
    car_id = models.AutoField(primary_key=True)
    company = models.CharField(max_length=255, blank=True, null=True)
    car_model = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    country = models.ForeignKey('Countries', models.DO_NOTHING, blank=True, null=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    price_per_day = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    car_seats = models.IntegerField(blank=True, null=True)
    rating = models.FloatField(blank=True, null=True)
    availability = models.BooleanField(blank=True, null=True)

    class Meta:
        
        db_table = 'cars'


class Countries(models.Model):
    country_id = models.AutoField(primary_key=True)
    country_name = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        
        db_table = 'countries'


class Customers(models.Model):
    customer_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    email = models.CharField(unique=True, max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=255, blank=True, null=True)
    country = models.ForeignKey(Countries, models.DO_NOTHING, blank=True, null=True)
    password = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        
        db_table = 'customers'


class Flights(models.Model):
    flight_id = models.AutoField(primary_key=True)
    airline = models.CharField(max_length=255, blank=True, null=True)
    departure_airport = models.ForeignKey(Airports, models.DO_NOTHING, blank=True, null=True)
    arrival_airport = models.ForeignKey(Airports, models.DO_NOTHING, related_name='flights_arrival_airport_set', blank=True, null=True)
    departure_time = models.DateTimeField(blank=True, null=True)
    arrival_time = models.DateTimeField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)

    class Meta:
        
        db_table = 'flights'


class Hotels(models.Model):
    hotel_id = models.AutoField(primary_key=True)
    hotel_name = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    country = models.ForeignKey(Countries, models.DO_NOTHING, blank=True, null=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    price_per_night = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    rating = models.FloatField(blank=True, null=True)

    class Meta:
        
        db_table = 'hotels'
