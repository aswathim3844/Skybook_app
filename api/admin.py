from django.contrib import admin
from .models import Flights, Hotels, Countries, Airports

admin.site.register(Flights)
admin.site.register(Hotels)
admin.site.register(Countries)
admin.site.register(Airports)