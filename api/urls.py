from django.urls import path
from . import views

urlpatterns = [
    path('flights/', views.get_flights, name='get_flights'),
    path('flights/search', views.search_flights, name='search_flights'),
    path('flight-locations/', views.get_flight_locations, name='get_flight_locations'),
    path('hotels/', views.get_hotels, name='get_hotels'),
    path('hotels/search', views.search_hotels, name='search_hotels'),
    path('cars/', views.get_cars, name='get_cars'),
    path('cars/search', views.search_cars, name='search_cars'),
    path('bookings/', views.get_bookings, name='get_bookings'),
    path('bookings/<str:reference>/', views.retrieve_booking, name='retrieve_booking'),
    path('countries/', views.get_countries, name='get_countries'),
    path('chat', views.ai_chat, name='ai_chat'),
    path('auth/register/', views.register_customer, name='register_customer'),
    path('auth/login/', views.login_customer, name='login_customer'),
    path('auth/account/<int:customer_id>/', views.customer_account, name='customer_account'),
    path('', views.api_root, name='api_root'),
]
