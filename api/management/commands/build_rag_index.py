from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.services.rag_service import RagService


class Command(BaseCommand):
    help = "Build a RAG index from the knowledge base. Defaults to the advanced OpenAI + Chroma pipeline."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Rebuild the index even if it already exists.")
        parser.add_argument(
            "--backend",
            choices=["advanced", "local"],
            default=getattr(settings, "AI_RAG_BUILD_BACKEND", "advanced"),
            help="Choose the advanced OpenAI+Chroma pipeline or the local fallback pipeline.",
        )

    def handle(self, *args, **options):
        knowledge_path = Path(settings.AI_KNOWLEDGE_BASE_PATH)
        if not knowledge_path.exists():
            raise CommandError(f"Knowledge base not found at {knowledge_path}")

        service = RagService()
        service.set_progress_callback(lambda message: self.stdout.write(message))
        backend = options["backend"]
        force = bool(options["force"])

        if backend == "advanced":
            manifest_path = Path(settings.AI_VECTOR_DB_PATH) / "advanced_rag_manifest.json"
            if manifest_path.exists() and not force:
                self.stdout.write(
                    self.style.WARNING(
                        f"Advanced RAG index already exists at {manifest_path}. Use --force to rebuild."
                    )
                )
                return
            self.stdout.write("Starting advanced RAG build...")
            stats = service.build_advanced_index(force=force)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Advanced RAG index ready: {stats['chunk_count']} chunks in {stats['chroma_path']}"
                )
            )
            return

        manifest_path = Path(settings.AI_VECTOR_DB_PATH) / "rag_index_manifest.json"
        if manifest_path.exists() and not force:
            self.stdout.write(
                self.style.WARNING(
                    f"Local RAG index already exists at {manifest_path}. Use --force to rebuild."
                )
            )
            return

        embedder = service._get_local_embedder()
        if embedder is None:
            raise CommandError(
                "Local embedding model is unavailable. Install sentence-transformers and cache the model first."
            )

        documents = service._load_chunked_documents()
        if not documents:
            raise CommandError("No markdown documents were found in the knowledge base.")

        vector_path = Path(settings.AI_VECTOR_DB_PATH)
        vector_path.mkdir(parents=True, exist_ok=True)

        self.stdout.write(f"Building local RAG index from {len(documents)} chunks...")
        vectors = embedder.encode([document.page_content for document in documents])
        normalized_vectors = np.array(
            [service._normalize(np.array(vector, dtype=float)) for vector in vectors],
            dtype=np.float32,
        )

        serializable_chunks = [
            {
                "page_content": document.page_content,
                "metadata": document.metadata,
            }
            for document in documents
        ]

        (vector_path / "rag_index_vectors.npy").write_bytes(b"")
        np.save(vector_path / "rag_index_vectors.npy", normalized_vectors)
        (vector_path / "rag_index_chunks.json").write_text(
            json.dumps(serializable_chunks, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        (vector_path / "rag_index_manifest.json").write_text(
            json.dumps(
                {
                    "backend": "local",
                    "chunk_count": len(serializable_chunks),
                    "vector_dimensions": int(normalized_vectors.shape[1]) if normalized_vectors.size else 0,
                    "knowledge_base_path": str(knowledge_path),
                    "vector_path": str(vector_path),
                    "embedding_model": "all-MiniLM-L6-v2",
                },
                ensure_ascii=True,
                indent=2,
            ),
            encoding="utf-8",
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Local RAG index ready: {len(serializable_chunks)} chunks written to {vector_path}"
            )
        )
