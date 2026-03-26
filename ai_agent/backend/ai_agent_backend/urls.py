from django.urls import path
from . import views

urlpatterns = [
    path('api/generate-response/', views.generate_response, name='generate_response'),
]