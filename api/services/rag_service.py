from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.conf import settings
import numpy as np
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from api.services.llm_service import LlmService
wait = wait_exponential(multiplier=1, min=2, max=30)

logger = logging.getLogger(__name__)

RETRIEVAL_K = 24
FINAL_K = 10
SEMANTIC_FLOOR = 0.12
ADVANCED_RETRIEVAL_K = 20
STOPWORDS = {
    "a",
    "about",
    "an",
    "and",
    "are",
    "can",
    "for",
    "from",
    "have",
    "how",
    "i",
    "if",
    "in",
    "is",
    "me",
    "my",
    "of",
    "on",
    "or",
    "our",
    "please",
    "tell",
    "that",
    "the",
    "their",
    "this",
    "to",
    "we",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
    "your",
}
DOC_TYPE_ALIASES = {
    "visa_policies": {"visa", "authorisation", "passport", "entry", "consulate", "embassy"},
    "flights_policies": {"baggage", "cancel", "cancellation", "refund", "meals", "loyalty", "policy"},
    "destinations": {"destination", "visit", "weather", "attractions", "guide", "city"},
    "flights_routes": {"route", "flight", "fly", "direct", "stopover", "connection"},
    "hotels": {"hotel", "stay", "room", "resort", "accommodation"},
    "packages": {"package", "bundle", "holiday", "deal", "tour"},
    "cars": {"car", "rental", "drive", "vehicle"},
    "company": {"company", "privacy", "terms", "refund", "loyalty"},
}
wait = wait_exponential(multiplier=1, min=2, max=30)
ADVANCED_MANIFEST_NAME = "advanced_rag_manifest.json"


SYSTEM_PROMPT = """You are SkyBook AI Copilot, a knowledgeable travel assistant for SkyBook.
You answer questions about SkyBook flights, hotels, cars, packages, visa policies,
baggage rules, loyalty programme, and destinations.

Rules:
- Only provide information about SkyBook and the context supplied.
- If the context does not support a claim, state professionally that the information is not currently available.
- Never invent routes, policies, or prices.
- Be concise, accurate, and helpful.
- Prefer clean formatting that is easy to read in chat.
- Use short paragraphs or flat bullet lists when listing allowances, rules, or steps.
- If the answer contains categories, use simple headings like "Cabin baggage" or "Checked baggage".
- Avoid one huge block of text.

Relevant extracts from the SkyBook travel information library:
{context}
"""


@dataclass
class RagDocument:
    page_content: str
    metadata: dict[str, Any]


@dataclass
class _EmbeddedChunk:
    document: RagDocument
    vector: np.ndarray


@dataclass
class _ScoredDocument:
    score: float
    document: RagDocument


class RagService:
    def __init__(self) -> None:
        self.llm = LlmService()
        self._embedder = None
        self._embedded_chunks: list[_EmbeddedChunk] | None = None
        self._chroma_collection = None
        self._openai_client = None
        self._progress_callback = None

    def set_progress_callback(self, callback) -> None:
        self._progress_callback = callback

    def is_configured(self) -> bool:
        return Path(settings.AI_KNOWLEDGE_BASE_PATH).exists()

    def answer_question(
        self,
        question: str,
        history: list[dict[str, Any]] | None = None,
    ) -> tuple[str, list[RagDocument]]:
        history = history or []
        chunks = self.fetch_context(question, history)
        if not chunks:
            return (
                "The requested information is not currently available in SkyBook's travel information resources. "
                "Please verify with customer support or check again later.",
                [],
            )
        context = "\n\n".join(
            f"[Source: {chunk.metadata.get('source', '?')}]\n{chunk.page_content}" for chunk in chunks
        )
        if not self.llm.is_configured():
            return self._build_extract_answer(question, chunks), chunks
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
            *history,
            {"role": "user", "content": question},
        ]
        try:
            response = self._chat(messages)
        except Exception as exc:  # pragma: no cover
            logger.warning("LLM answer generation failed, using extractive KB fallback: %s", exc)
            return self._build_extract_answer(question, chunks), chunks
        return self._format_answer(response), chunks

    def fetch_context(
        self,
        question: str,
        history: list[dict[str, Any]] | None = None,
    ) -> list[RagDocument]:
        history = history or []
        advanced = self._advanced_retrieve(question, history)
        if advanced:
            return advanced[:FINAL_K]

        queries = [question]
        rewritten = self._rewrite_query(question, history)
        if rewritten and rewritten.lower() != question.lower():
            queries.append(rewritten)

        ranked = self._hybrid_retrieve(queries)
        return ranked[:FINAL_K]

    def build_advanced_index(self, force: bool = False) -> dict[str, Any]:
        knowledge_path = Path(settings.AI_KNOWLEDGE_BASE_PATH)
        if not knowledge_path.exists():
            raise RuntimeError(f"Knowledge base not found at {knowledge_path}")

        openai_client = self._get_openai_client()
        if openai_client is None:
            raise RuntimeError("OpenAI API key is required for the advanced RAG pipeline.")

        try:
            from chromadb import PersistentClient
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("chromadb must be installed for the advanced RAG pipeline.") from exc

        vector_path = Path(settings.AI_VECTOR_DB_PATH)
        chroma_path = Path(getattr(settings, "AI_CHROMA_DB_PATH", vector_path / "preprocessed_db"))
        collection_name = getattr(settings, "AI_RAG_COLLECTION_NAME", "skybook_docs")
        manifest_path = vector_path / ADVANCED_MANIFEST_NAME

        documents = self._load_raw_documents()
        if not documents:
            raise RuntimeError("No markdown documents were found in the knowledge base.")
        self._progress(f"Loaded {len(documents)} knowledge-base documents.")

        chunks = self._create_semantic_chunks(documents)
        if not chunks:
            raise RuntimeError("Advanced chunk generation produced no chunks.")
        self._progress(f"Prepared {len(chunks)} semantic chunks.")

        chroma_path.mkdir(parents=True, exist_ok=True)
        vector_path.mkdir(parents=True, exist_ok=True)
        chroma = PersistentClient(path=str(chroma_path))
        existing = {item.name for item in chroma.list_collections()}
        if force and collection_name in existing:
            chroma.delete_collection(collection_name)
        collection = chroma.get_or_create_collection(collection_name)

        texts = [chunk["page_content"] for chunk in chunks]
        metadatas = [chunk["metadata"] for chunk in chunks]
        vectors = self._embed_openai_texts(texts)
        self._progress(f"Created {len(vectors)} embeddings.")
        ids = [f"advanced-{index}" for index in range(len(chunks))]

        if force and getattr(collection, "count", None) and collection.count():
            try:
                collection.delete(ids=ids)
            except Exception:
                pass
        collection = chroma.get_or_create_collection(collection_name)
        collection.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metadatas)

        manifest_path.write_text(
            json.dumps(
                {
                    "backend": "advanced",
                    "chunk_count": len(chunks),
                    "vector_dimensions": len(vectors[0]) if vectors else 0,
                    "knowledge_base_path": str(knowledge_path),
                    "vector_path": str(vector_path),
                    "chroma_path": str(chroma_path),
                    "collection_name": collection_name,
                    "embedding_model": "text-embedding-3-large",
                    "chunk_model": self.llm.config.model if self.llm.is_configured() else "gpt-4.1-nano",
                },
                ensure_ascii=True,
                indent=2,
            ),
            encoding="utf-8",
        )
        self._chroma_collection = None
        return {
            "chunk_count": len(chunks),
            "chroma_path": str(chroma_path),
            "collection_name": collection_name,
        }

    def _merge_chunks(self, left: list[RagDocument], right: list[RagDocument]) -> list[RagDocument]:
        merged = list(left)
        seen = {chunk.page_content for chunk in left}
        for chunk in right:
            if chunk.page_content not in seen:
                merged.append(chunk)
                seen.add(chunk.page_content)
        return merged

    @retry(wait=wait, stop=stop_after_attempt(3))

    def _rewrite_query(self, question: str, history: list[dict[str, Any]]) -> str:
        if not history:
            return question.strip()
        if not self.llm.is_configured():
            return self._rewrite_query_without_llm(question, history)
        history_text = "\n".join(
            f"{message.get('role', 'user')}: {message.get('content', '')}" for message in history[-6:]
        )
        prompt = f"""You improve retrieval for a travel knowledge base about SkyBook.
Conversation so far:
{history_text}

User question:
{question}

Rewrite it as one short, specific KB search query in no more than 15 words.
Focus on the strongest retrieval anchors such as:
- destination
- route
- visa or baggage policy name
- hotel or product name

Reply only with the rewritten query."""
        try:
            return self._chat([{"role": "user", "content": prompt}]).strip()
        except Exception as exc:  # pragma: no cover
            logger.warning("LLM query rewrite failed, using heuristic rewrite: %s", exc)
            return self._rewrite_query_without_llm(question, history)

    @retry(wait=wait, stop=stop_after_attempt(3))

    def _rerank(self, question: str, chunks: list[RagDocument]) -> list[RagDocument]:
        if not chunks:
            return []
        if not self.llm.is_configured():
            return self._heuristic_rerank(question, chunks)

        chunk_lines = []
        for index, chunk in enumerate(chunks, start=1):
            chunk_lines.append(f"# CHUNK {index}\n{chunk.page_content[:500]}")
        prompt = (
            "Rank the following chunks from most relevant to least relevant for the user question.\n"
            "Put the single most directly relevant chunk first.\n"
            "For comparative questions, prefer chunks that mention both compared items.\n"
            "For multi-part questions, prefer chunks covering the most parts.\n"
            "Return JSON only in the form {\"order\": [1,2,...]}.\n\n"
            f"Question:\n{question}\n\nChunks:\n" + "\n\n".join(chunk_lines)
        )
        raw = self._chat([{"role": "user", "content": prompt}], json_mode=True)
        try:
            order = json.loads(raw).get("order", [])
        except json.JSONDecodeError:
            logger.warning("Failed to parse rerank response: %s", raw)
            return self._heuristic_rerank(question, chunks)

        valid_indexes = [index - 1 for index in order if isinstance(index, int) and 1 <= index <= len(chunks)]
        visited = set(valid_indexes)
        valid_indexes.extend(index for index in range(len(chunks)) if index not in visited)
        return [chunks[index] for index in valid_indexes]

    @retry(wait=wait, stop=stop_after_attempt(3))

    def _chat(self, messages: list[dict[str, str]], json_mode: bool = False) -> str:
        return self.llm.chat(messages, json_mode=json_mode)

    def _format_answer(self, answer: str) -> str:
        text = (answer or "").strip()
        if not text:
            return text

        # Normalize malformed inline bold headings like "**Economy — Saver Fare **- ..."
        text = re.sub(r"\s*(\*\*[^*]+:\*\*)\s*", r"\n\n\1 ", text)
        text = re.sub(r"\*\*(.+?)\s*\*\*\s*-\s*", r"\n\n\1\n- ", text)
        text = re.sub(r"(?<!\*)\*\*([^*\n]+)\s*$", r"\1", text)
        text = re.sub(r"^\*\*([^*\n]+)$", r"\1", text, flags=re.MULTILINE)

        # Turn repeated inline dash lists into separate lines.
        text = re.sub(r"\s-\s", r"\n- ", text)

        # Collapse excessive blank lines while preserving section breaks.
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return text

    def _semantic_retrieve(self, question: str) -> list[_ScoredDocument]:
        embedder = self._get_local_embedder()
        if embedder is None:
            return []

        chunks = self._get_embedded_chunks()
        if not chunks:
            return []

        query_vector = self._normalize(np.array(embedder.encode(question), dtype=float))
        scored: list[_ScoredDocument] = []
        for chunk in chunks:
            score = float(np.dot(query_vector, chunk.vector))
            if score > SEMANTIC_FLOOR:
                scored.append(_ScoredDocument(score=score, document=chunk.document))

        scored.sort(key=lambda item: item.score, reverse=True)
        return scored[:RETRIEVAL_K]

    def _advanced_retrieve(self, question: str, history: list[dict[str, Any]]) -> list[RagDocument]:
        collection = self._get_chroma_collection()
        openai_client = self._get_openai_client()
        if collection is None or openai_client is None:
            return []

        try:
            rewritten = self._rewrite_query(question, history)
            queries = [question]
            if rewritten and rewritten.lower() != question.lower():
                queries.append(rewritten)
            merged: list[RagDocument] = []
            for query in queries:
                vector = self._embed_openai_text(query)
                results = collection.query(query_embeddings=[vector], n_results=ADVANCED_RETRIEVAL_K)
                docs = [
                    RagDocument(page_content=doc, metadata=meta or {})
                    for doc, meta in zip(results.get("documents", [[]])[0], results.get("metadatas", [[]])[0])
                ]
                merged = self._merge_chunks(merged, docs)
            return self._rerank(question, merged)[:FINAL_K]
        except Exception as exc:  # pragma: no cover
            logger.warning("Advanced Chroma retrieval failed, falling back to local index: %s", exc)
            return []

    def _hybrid_retrieve(self, queries: list[str]) -> list[RagDocument]:
        combined: dict[str, _ScoredDocument] = {}
        for index, query in enumerate(queries):
            query_weight = 1.0 if index == 0 else 0.8
            for item in self._semantic_retrieve(query):
                key = self._document_key(item.document)
                score = item.score * query_weight + self._keyword_score(query, item.document)
                existing = combined.get(key)
                if existing is None or score > existing.score:
                    combined[key] = _ScoredDocument(score=score, document=item.document)

        if not combined:
            return self._keyword_retrieve(queries[0])

        ordered = sorted(combined.values(), key=lambda item: item.score, reverse=True)
        top_docs = [item.document for item in ordered[:RETRIEVAL_K]]
        return self._rerank(queries[0], top_docs)

    def _keyword_retrieve(self, question: str) -> list[RagDocument]:
        scored: list[_ScoredDocument] = []
        for chunk in self._load_chunked_documents():
            score = self._keyword_score(question, chunk)
            if score > 0:
                scored.append(_ScoredDocument(score=score, document=chunk))

        scored.sort(key=lambda item: item.score, reverse=True)
        return [item.document for item in scored[:FINAL_K]]

    def _get_embedded_chunks(self) -> list[_EmbeddedChunk]:
        if self._embedded_chunks is None:
            indexed_chunks = self._load_indexed_chunks()
            if indexed_chunks is not None:
                self._embedded_chunks = indexed_chunks
                return self._embedded_chunks

            embedder = self._get_local_embedder()
            if embedder is None:
                self._embedded_chunks = []
                return self._embedded_chunks

            documents = self._load_chunked_documents()
            if not documents:
                self._embedded_chunks = []
                return self._embedded_chunks

            vectors = embedder.encode([document.page_content for document in documents])
            self._embedded_chunks = [
                _EmbeddedChunk(document=document, vector=self._normalize(np.array(vector, dtype=float)))
                for document, vector in zip(documents, vectors)
            ]
        return self._embedded_chunks

    def _load_indexed_chunks(self) -> list[_EmbeddedChunk] | None:
        vector_path = Path(settings.AI_VECTOR_DB_PATH)
        vectors_path = vector_path / "rag_index_vectors.npy"
        chunks_path = vector_path / "rag_index_chunks.json"

        if not vectors_path.exists() or not chunks_path.exists():
            return None

        try:
            vectors = np.load(vectors_path)
            raw_chunks = json.loads(chunks_path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to load prebuilt RAG index, falling back to runtime index: %s", exc)
            return None

        if len(raw_chunks) != len(vectors):
            logger.warning("Prebuilt RAG index is out of sync with chunk metadata, rebuilding at runtime.")
            return None

        return [
            _EmbeddedChunk(
                document=RagDocument(
                    page_content=item.get("page_content", ""),
                    metadata=item.get("metadata") or {},
                ),
                vector=np.array(vector, dtype=float),
            )
            for item, vector in zip(raw_chunks, vectors)
        ]

    def _load_raw_documents(self) -> list[dict[str, str]]:
        knowledge_path = Path(settings.AI_KNOWLEDGE_BASE_PATH)
        if not knowledge_path.exists():
            return []
        documents: list[dict[str, str]] = []
        for file_path in knowledge_path.rglob("*.md"):
            try:
                text = file_path.read_text(encoding="utf-8")
            except Exception:
                continue
            documents.append(
                {
                    "type": file_path.parent.name,
                    "source": file_path.as_posix(),
                    "text": text,
                }
            )
        return documents

    def _create_semantic_chunks(self, documents: list[dict[str, str]]) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        total = len(documents)
        for doc_position, document in enumerate(documents, start=1):
            self._progress(f"Chunking document {doc_position}/{total}: {document['source']}")
            generated = self._generate_semantic_chunks(document)
            if generated:
                chunks.extend(generated)
                self._progress(f"Added {len(generated)} semantic chunks from {document['source']}")
                continue
            title = self._extract_title(document["text"], Path(document["source"]))
            for index, part in enumerate(self._chunk_markdown(document["text"], title=title), start=1):
                chunks.append(
                    {
                        "page_content": part,
                        "metadata": {
                            "source": document["source"],
                            "type": document["type"],
                            "title": title,
                            "chunk_index": index,
                            "chunk_strategy": "fallback_local",
                        },
                    }
                )
            self._progress(f"Fell back to local chunking for {document['source']}")
        return chunks

    def _generate_semantic_chunks(self, document: dict[str, str]) -> list[dict[str, Any]]:
        if not self.llm.is_configured():
            return []
        approx_chunks = max(1, len(document["text"]) // 1200)
        prompt = f"""You split a travel-company document into overlapping semantic chunks for a RAG knowledge base.

Document type: {document["type"]}
Document source: {document["source"]}

Return JSON only in this form:
{{
  "chunks": [
    {{
      "headline": "short heading",
      "summary": "2-4 sentence summary",
      "original_text": "verbatim chunk text"
    }}
  ]
}}

Rules:
- Create roughly {approx_chunks} chunks.
- Cover the whole document with no major omissions.
- Keep some overlap between neighboring chunks.
- original_text must stay faithful to the source.
- headline should match likely user search wording.

Document:
{document["text"]}
"""
        payload = None
        for attempt in range(1, 4):
            try:
                self._progress(f"Semantic chunk request attempt {attempt}/3 for {document['source']}")
                payload = json.loads(self._chat([{"role": "user", "content": prompt}], json_mode=True))
                break
            except Exception as exc:  # pragma: no cover
                logger.warning("Semantic chunk generation failed for %s on attempt %s: %s", document["source"], attempt, exc)
                self._progress(
                    f"Semantic chunk generation failed on attempt {attempt}/3 for {document['source']}: {exc}"
                )
        if payload is None:
            return []

        raw_chunks = payload.get("chunks", [])
        formatted = []
        for index, item in enumerate(raw_chunks, start=1):
            headline = str(item.get("headline", "")).strip()
            summary = str(item.get("summary", "")).strip()
            original_text = str(item.get("original_text", "")).strip()
            if not original_text:
                continue
            page_content = "\n\n".join(part for part in [headline, summary, original_text] if part)
            formatted.append(
                {
                    "page_content": page_content,
                    "metadata": {
                        "source": document["source"],
                        "type": document["type"],
                        "title": headline or self._extract_title(document["text"], Path(document["source"])),
                        "chunk_index": index,
                        "headline": headline,
                        "summary": summary,
                        "chunk_strategy": "semantic_llm",
                    },
                }
            )
        return formatted

    def _load_chunked_documents(self) -> list[RagDocument]:
        knowledge_path = Path(settings.AI_KNOWLEDGE_BASE_PATH)
        if not knowledge_path.exists():
            return []

        documents: list[RagDocument] = []
        for file_path in knowledge_path.rglob("*.md"):
            try:
                text = file_path.read_text(encoding="utf-8")
            except Exception:
                continue

            title = self._extract_title(text, file_path)
            parts = self._chunk_markdown(text, title=title)
            doc_type = file_path.parent.name
            for index, part in enumerate(parts, start=1):
                headings = self._extract_headings(part)
                route = self._extract_route_metadata(file_path, doc_type)
                documents.append(
                    RagDocument(
                        page_content=part,
                        metadata={
                            "source": file_path.as_posix(),
                            "type": doc_type,
                            "title": title,
                            "headings": headings,
                            "filename": file_path.stem,
                            "chunk_index": index,
                            **route,
                        },
                    )
                )
        return documents

    def _chunk_markdown(self, text: str, title: str | None = None) -> list[str]:
        blocks = [block.strip() for block in re.split(r"\n\s*\n", text) if block.strip()]
        chunks: list[str] = []
        current: list[str] = []
        current_len = 0

        for block in blocks:
            block_len = len(block)
            if current and current_len + block_len > 1100:
                chunks.append(self._decorate_chunk("\n\n".join(current), title))
                current = [block]
                current_len = block_len
            else:
                current.append(block)
                current_len += block_len

        if current:
            chunks.append(self._decorate_chunk("\n\n".join(current), title))
        return chunks or [self._decorate_chunk(text[:1100], title)]

    def _get_local_embedder(self):
        if self._embedder is False:
            return None
        if self._embedder is not None:
            return self._embedder

        try:
            from sentence_transformers import SentenceTransformer

            # Do not hang trying to download a model at request time.
            self._embedder = SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
            return self._embedder
        except Exception as exc:  # pragma: no cover
            logger.warning("Local embedding model unavailable, using keyword retrieval fallback: %s", exc)
            self._embedder = False
            return None

    def _get_openai_client(self):
        if self._openai_client is not None:
            return self._openai_client
        api_key = str(getattr(settings, "OPENAI_API_KEY", "") or "").strip()
        if not api_key or api_key.lower() == "your-openai-key":
            self._openai_client = False
            return None
        self._openai_client = OpenAI(api_key=api_key)
        return self._openai_client

    def _embed_openai_text(self, text: str) -> list[float]:
        client = self._get_openai_client()
        if client is None:
            raise RuntimeError("OpenAI client unavailable for advanced embeddings.")
        response = client.embeddings.create(model="text-embedding-3-large", input=[text])
        return response.data[0].embedding

    def _embed_openai_texts(self, texts: list[str]) -> list[list[float]]:
        client = self._get_openai_client()
        if client is None:
            raise RuntimeError("OpenAI client unavailable for advanced embeddings.")
        batch_size = 500
        vectors: list[list[float]] = []
        total_batches = max(1, (len(texts) + batch_size - 1) // batch_size)
        for batch_index, start in enumerate(range(0, len(texts), batch_size), start=1):
            self._progress(f"Embedding batch {batch_index}/{total_batches}")
            response = client.embeddings.create(model="text-embedding-3-large", input=texts[start : start + batch_size])
            vectors.extend(item.embedding for item in response.data)
        return vectors

    def _get_chroma_collection(self):
        manifest_path = Path(settings.AI_VECTOR_DB_PATH) / ADVANCED_MANIFEST_NAME
        if not manifest_path.exists():
            return None
        if self._chroma_collection is not None:
            return self._chroma_collection
        try:
            from chromadb import PersistentClient
        except Exception as exc:  # pragma: no cover
            logger.warning("chromadb unavailable for advanced retrieval: %s", exc)
            self._chroma_collection = False
            return None
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            chroma = PersistentClient(path=manifest.get("chroma_path") or str(getattr(settings, "AI_CHROMA_DB_PATH")))
            self._chroma_collection = chroma.get_or_create_collection(
                manifest.get("collection_name") or getattr(settings, "AI_RAG_COLLECTION_NAME", "skybook_docs")
            )
            return self._chroma_collection
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to load advanced Chroma collection: %s", exc)
            self._chroma_collection = False
            return None

    def _progress(self, message: str) -> None:
        if self._progress_callback is not None:
            try:
                self._progress_callback(message)
            except Exception:
                pass

    def _normalize(self, vector: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vector)
        if norm == 0:
            return vector
        return vector / norm

    def _rewrite_query_without_llm(self, question: str, history: list[dict[str, Any]]) -> str:
        user_turns = [
            str(message.get("content", "")).strip()
            for message in history[-4:]
            if str(message.get("role", "user")).lower() == "user" and str(message.get("content", "")).strip()
        ]
        if not user_turns:
            return question.strip()
        return " | ".join([*user_turns[-2:], question.strip()])

    def _heuristic_rerank(self, question: str, chunks: list[RagDocument]) -> list[RagDocument]:
        ranked = sorted(
            chunks,
            key=lambda chunk: self._keyword_score(question, chunk),
            reverse=True,
        )
        return ranked

    def _keyword_score(self, question: str, document: RagDocument) -> float:
        metadata = document.metadata or {}
        query_terms = self._tokenize(question)
        if not query_terms:
            return 0.0

        haystack = " ".join(
            [
                document.page_content.lower(),
                str(metadata.get("source", "")).lower(),
                str(metadata.get("title", "")).lower(),
                " ".join(metadata.get("headings") or []).lower(),
                str(metadata.get("filename", "")).lower(),
                str(metadata.get("origin", "")).lower(),
                str(metadata.get("destination", "")).lower(),
            ]
        )
        score = 0.0
        for term in query_terms:
            if term in haystack:
                score += 1.0
            if term == str(metadata.get("origin", "")).lower():
                score += 1.25
            if term == str(metadata.get("destination", "")).lower():
                score += 1.25

        doc_type = str(metadata.get("type", "")).lower()
        aliases = DOC_TYPE_ALIASES.get(doc_type, set())
        if aliases.intersection(query_terms):
            score += 1.5

        if doc_type == "visa_policies":
            origin = str(metadata.get("origin", "")).lower()
            destination = str(metadata.get("destination", "")).lower()
            if origin and origin in query_terms:
                score += 2.0
            if destination and destination in query_terms:
                score += 2.0

        if doc_type == "flights_routes":
            route_parts = {str(metadata.get("origin", "")).lower(), str(metadata.get("destination", "")).lower()}
            route_matches = len(route_parts.intersection(query_terms) - {""})
            score += route_matches * 1.5

        return score

    def _build_extract_answer(self, question: str, chunks: list[RagDocument]) -> str:
        top_chunks = chunks[:3]
        query_terms = self._tokenize(question)
        lines = ["Here is the information currently available from SkyBook:"]
        for chunk in top_chunks:
            title = chunk.metadata.get("title") or chunk.metadata.get("filename") or chunk.metadata.get("source")
            excerpt_lines = []
            for line in chunk.page_content.splitlines():
                clean = line.strip(" -|")
                if len(clean) < 12:
                    continue
                if query_terms and not any(term in clean.lower() for term in query_terms):
                    if len(excerpt_lines) >= 2:
                        break
                    continue
                excerpt_lines.append(clean)
                if len(excerpt_lines) == 2:
                    break
            if not excerpt_lines:
                excerpt_lines.append(chunk.page_content.strip().splitlines()[0][:220])
            lines.append(f"{title}: {' '.join(excerpt_lines)}")
        lines.append("If helpful, I can narrow this down to visa guidance, baggage policy, or destination details.")
        return "\n".join(lines)

    def _extract_title(self, text: str, file_path: Path) -> str:
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                return stripped.lstrip("#").strip()
        return file_path.stem.replace("_", " ").title()

    def _extract_headings(self, text: str) -> list[str]:
        headings = []
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                headings.append(stripped.lstrip("#").strip())
        return headings[:6]

    def _extract_route_metadata(self, file_path: Path, doc_type: str) -> dict[str, str]:
        stem = file_path.stem.lower()
        if doc_type not in {"visa_policies", "flights_routes"} or "_to_" not in stem:
            return {}
        origin, destination = stem.split("_to_", 1)
        return {"origin": origin.replace("_", " "), "destination": destination.replace("_", " ")}

    def _decorate_chunk(self, content: str, title: str | None) -> str:
        content = content.strip()
        if title and title.lower() not in content.lower():
            return f"{title}\n\n{content}"
        return content

    def _tokenize(self, text: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[a-zA-Z]{2,}", text.lower())
            if token not in STOPWORDS
        }

    def _document_key(self, document: RagDocument) -> str:
        metadata = document.metadata or {}
        return "|".join(
            [
                str(metadata.get("source", "")),
                str(metadata.get("chunk_index", "")),
                document.page_content[:120],
            ]
        )
