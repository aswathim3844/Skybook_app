from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.db import connection


def check_database() -> dict:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"ok": True, "engine": settings.DATABASES["default"]["ENGINE"]}
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "error": str(exc)}


def check_rag() -> dict:
    vector_path = Path(getattr(settings, "AI_VECTOR_DB_PATH", ""))
    knowledge_path = Path(getattr(settings, "AI_KNOWLEDGE_BASE_PATH", ""))
    return {
        "ok": bool(getattr(settings, "OPENAI_API_KEY", "")),
        "openai_configured": bool(getattr(settings, "OPENAI_API_KEY", "")),
        "vector_db_exists": vector_path.exists(),
        "knowledge_base_exists": knowledge_path.exists(),
    }


def check_providers() -> dict:
    return {
        "flight_provider": settings.FLIGHT_PROVIDER,
        "hotel_provider": settings.HOTEL_PROVIDER,
        "car_provider": settings.CAR_PROVIDER,
        "mock_providers_enabled": settings.ENABLE_MOCK_PROVIDERS,
        "flight_provider_configured": bool(settings.FLIGHT_PROVIDER_BASE_URL)
        if settings.FLIGHT_PROVIDER not in ["local_db", "mock_provider"]
        else True,
        "hotel_provider_configured": bool(settings.HOTEL_PROVIDER_BASE_URL)
        if settings.HOTEL_PROVIDER not in ["local_db", "mock_provider"]
        else True,
        "car_provider_configured": bool(settings.CAR_PROVIDER_BASE_URL)
        if settings.CAR_PROVIDER not in ["local_db", "mock_provider"]
        else True,
    }


def build_health_report() -> dict:
    database = check_database()
    rag = check_rag()
    providers = check_providers()
    return {
        "ok": database["ok"],
        "database": database,
        "rag": rag,
        "providers": providers,
    }
