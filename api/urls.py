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
    path('planner/sessions/', views.planner_sessions, name='planner_sessions'),
    path('planner/sessions/<int:session_id>/', views.planner_session_detail, name='planner_session_detail'),
    path('planner/sessions/<int:session_id>/messages/', views.planner_session_message, name='planner_session_message'),
    path('planner/sessions/<int:session_id>/plan/', views.planner_session_plan, name='planner_session_plan'),
    path('planner/sessions/<int:session_id>/drafts/<int:draft_id>/', views.planner_draft_update, name='planner_draft_update'),
    path('planner/sessions/<int:session_id>/drafts/<int:draft_id>/revalidate/', views.planner_draft_revalidate, name='planner_draft_revalidate'),
    path('planner/provider-status/', views.provider_status, name='provider_status'),
    path('health/', views.health_status, name='health_status'),
    path('ready/', views.readiness_status, name='readiness_status'),
    path('auth/register/', views.register_customer, name='register_customer'),
    path('auth/login/', views.login_customer, name='login_customer'),
    path('auth/account/<int:customer_id>/', views.customer_account, name='customer_account'),
    path('', views.api_root, name='api_root'),
]
