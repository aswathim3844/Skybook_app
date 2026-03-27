"""
rag/ingest.py
Advanced RAG ingestion pipeline for SkyNest Knowledge Base.

WHY THIS PIPELINE IS BETTER than the simple LangChain one:
  1. Semantic chunking  — each chunk gets a headline + summary + original text,
     making retrieval hit on *intent* not just keywords.
  2. Parallel processing — multiple documents chunked simultaneously.
  3. Dual-representation — the stored text includes both summary and raw text,
     so embedding captures both semantic meaning and exact phrasing.
  4. Overlap is deliberate — the LLM chooses where to overlap, not a fixed window.

Run once (or after updating the knowledge base):
    python -m rag.ingest
"""

import os
import json
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from chromadb import PersistentClient
from tqdm import tqdm
from litellm import completion
from multiprocessing import Pool
from tenacity import retry, wait_exponential

load_dotenv(override=True)

# ── Config ───────────────────────────────────────────────────────
MODEL            = "openai/gpt-4.1-nano"
EMBEDDING_MODEL  = "text-embedding-3-large"
AVERAGE_CHUNK_SIZE = 100
WORKERS          = 3

BASE              = Path(__file__).parent.parent
DB_NAME           = str(BASE / "vector_db" / "preprocessed_db")
KNOWLEDGE_BASE    = Path(__file__).parent.parent / "knowledge-base"
COLLECTION_NAME   = "skynest_docs"

wait = wait_exponential(multiplier=1, min=10, max=240)

openai_client = OpenAI()


# ── Pydantic models ──────────────────────────────────────────────

class Chunk(BaseModel):
    headline: str = Field(
        description="A brief heading (3-8 words) most likely to be surfaced in a user query"
    )
    summary: str = Field(
        description="2-4 sentences summarising this chunk to answer common questions"
    )
    original_text: str = Field(
        description="The exact original text of this chunk, unchanged"
    )

    def to_page_content(self, source: str, doc_type: str) -> dict:
        return {
            "page_content": f"{self.headline}\n\n{self.summary}\n\n{self.original_text}",
            "metadata": {"source": source, "type": doc_type},
        }


class Chunks(BaseModel):
    chunks: list[Chunk]


# ── Document loading ─────────────────────────────────────────────

def fetch_documents() -> list[dict]:
    """Walk the knowledge-base folder and load every .md file."""
    documents = []
    if not KNOWLEDGE_BASE.exists():
        raise FileNotFoundError(
            f"Knowledge base not found at {KNOWLEDGE_BASE}\n"
            "Please unzip skynest_knowledge_base.zip into the project root."
        )
    for folder in KNOWLEDGE_BASE.iterdir():
        if not folder.is_dir():
            continue
        doc_type = folder.name
        for md_file in folder.rglob("*.md"):
            text = md_file.read_text(encoding="utf-8")
            documents.append({
                "type":   doc_type,
                "source": md_file.as_posix(),
                "text":   text,
            })
    print(f"📄 Loaded {len(documents)} documents from {KNOWLEDGE_BASE}")
    return documents


# ── Chunking ─────────────────────────────────────────────────────

def _make_prompt(doc: dict) -> str:
    how_many = max(1, len(doc["text"]) // AVERAGE_CHUNK_SIZE)
    return f"""You split a travel-company document into overlapping chunks for a RAG knowledge base.

Document type : {doc["type"]}
Document path : {doc["source"]}

A chat assistant will use these chunks to answer questions about SkyNest's flights, hotels,
cars, packages, destinations, and visa policies.

Split the document into roughly {how_many} chunks (more or fewer is fine).
Include ~25 % overlap so boundary content appears in multiple chunks.
For EACH chunk provide:
  headline     — a 3-8 word heading (what a user would search)
  summary      — 2-4 sentences answering likely questions about this chunk
  original_text — the exact chunk text, copied verbatim from the document

Together the chunks must cover the ENTIRE document with no omissions.

Document:
{doc["text"]}

Return the chunks now."""


@retry(wait=wait)
def _process_document(doc: dict) -> list[dict]:
    messages = [{"role": "user", "content": _make_prompt(doc)}]
    response = completion(model=MODEL, messages=messages, response_format=Chunks)
    raw      = response.choices[0].message.content
    chunks   = Chunks.model_validate_json(raw).chunks
    return [c.to_page_content(doc["source"], doc["type"]) for c in chunks]


def create_chunks(documents: list[dict]) -> list[dict]:
    all_chunks: list[dict] = []
    with Pool(processes=WORKERS) as pool:
        for result in tqdm(
            pool.imap_unordered(_process_document, documents),
            total=len(documents),
            desc="Chunking documents",
        ):
            all_chunks.extend(result)
    print(f"✂️  Created {len(all_chunks)} chunks")
    return all_chunks


# ── Embedding + ChromaDB ─────────────────────────────────────────

def create_embeddings(chunks: list[dict]):
    Path(DB_NAME).mkdir(parents=True, exist_ok=True)
    chroma = PersistentClient(path=DB_NAME)

    # Drop + recreate collection for a clean ingest
    existing = [c.name for c in chroma.list_collections()]
    if COLLECTION_NAME in existing:
        chroma.delete_collection(COLLECTION_NAME)

    texts  = [c["page_content"] for c in chunks]
    metas  = [c["metadata"]     for c in chunks]

    # Batch embeddings (OpenAI max 2048 per call)
    BATCH = 500
    vectors = []
    for i in range(0, len(texts), BATCH):
        batch_texts = texts[i : i + BATCH]
        emb_data    = openai_client.embeddings.create(
            model=EMBEDDING_MODEL, input=batch_texts
        ).data
        vectors.extend([e.embedding for e in emb_data])

    collection = chroma.get_or_create_collection(COLLECTION_NAME)
    ids        = [str(i) for i in range(len(chunks))]
    collection.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metas)

    print(f"✅ Vector store ready — {collection.count()} vectors @ {len(vectors[0])}d")
    return collection


# ── Entry point ──────────────────────────────────────────────────

if __name__ == "__main__":
    docs   = fetch_documents()
    chunks = create_chunks(docs)
    create_embeddings(chunks)
    print("🚀 Ingestion complete")
