from django.urls import path
from . import views

urlpatterns = [
    path('flights/', views.get_flights, name='get_flights'),
    path('hotels/', views.get_hotels, name='get_hotels'),
    path('cars/', views.get_cars, name='get_cars'),
    path('bookings/', views.get_bookings, name='get_bookings'),
    path('countries/', views.get_countries, name='get_countries'),
    path('auth/register/', views.register_customer, name='register_customer'),
    path('auth/login/', views.login_customer, name='login_customer'),
    path('auth/account/<int:customer_id>/', views.customer_account, name='customer_account'),
    path('', views.api_root, name='api_root'),
]
