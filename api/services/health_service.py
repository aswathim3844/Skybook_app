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
    chroma_path = Path(getattr(settings, "AI_CHROMA_DB_PATH", ""))
    knowledge_path = Path(getattr(settings, "AI_KNOWLEDGE_BASE_PATH", ""))
    manifest_path = vector_path / "rag_index_manifest.json"
    advanced_manifest_path = vector_path / "advanced_rag_manifest.json"
    llm_provider = getattr(settings, "LLM_PROVIDER", "openai")
    llm_configured = bool(getattr(settings, "GROQ_API_KEY", "")) if llm_provider == "groq" else bool(getattr(settings, "OPENAI_API_KEY", ""))
    manifest = {}
    advanced_manifest = {}
    if manifest_path.exists():
        try:
            import json

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}
    if advanced_manifest_path.exists():
        try:
            import json

            advanced_manifest = json.loads(advanced_manifest_path.read_text(encoding="utf-8"))
        except Exception:
            advanced_manifest = {}
    return {
        "ok": llm_configured or knowledge_path.exists(),
        "openai_configured": bool(getattr(settings, "OPENAI_API_KEY", "")),
        "llm_provider": llm_provider,
        "llm_configured": llm_configured,
        "vector_db_exists": vector_path.exists(),
        "chroma_db_exists": chroma_path.exists(),
        "knowledge_base_exists": knowledge_path.exists(),
        "prebuilt_index_exists": manifest_path.exists(),
        "advanced_index_exists": advanced_manifest_path.exists(),
        "indexed_chunk_count": manifest.get("chunk_count"),
        "vector_dimensions": manifest.get("vector_dimensions"),
        "advanced_chunk_count": advanced_manifest.get("chunk_count"),
        "advanced_vector_dimensions": advanced_manifest.get("vector_dimensions"),
        "advanced_collection_name": advanced_manifest.get("collection_name"),
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
