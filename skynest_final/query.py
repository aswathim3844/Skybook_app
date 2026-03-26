"""
rag/query.py
Advanced RAG query pipeline:
  1. Rewrite the user question for better retrieval
  2. Retrieve with BOTH the original and rewritten queries (dual retrieval)
  3. Merge + deduplicate the two result sets
  4. LLM rerank the merged set → keep top-K
  5. Answer with the final context

This is the best pipeline — it handles typos, ambiguous phrasing,
and multi-hop questions far better than a single embedding lookup.
"""

from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv
from chromadb import PersistentClient
from litellm import completion
from pydantic import BaseModel, Field
from tenacity import retry, wait_exponential

load_dotenv(override=True)

# ── Config ───────────────────────────────────────────────────────
MODEL           = "openai/gpt-4.1-nano"
EMBEDDING_MODEL = "text-embedding-3-large"
RETRIEVAL_K     = 20    # candidates per retrieval pass
FINAL_K         = 10    # after reranking, keep this many

BASE            = Path(__file__).parent.parent
DB_NAME         = str(BASE / "vector_db" / "preprocessed_db")
COLLECTION_NAME = "skynest_docs"

wait = wait_exponential(multiplier=1, min=2, max=30)

openai_client = OpenAI()

# Lazy-load the Chroma collection so import never crashes if DB not yet built
_collection = None

def _get_collection():
    global _collection
    if _collection is None:
        chroma = PersistentClient(path=DB_NAME)
        _collection = chroma.get_or_create_collection(COLLECTION_NAME)
    return _collection


# ── Pydantic models ──────────────────────────────────────────────

class Chunk(BaseModel):
    page_content: str
    metadata:     dict

class RankOrder(BaseModel):
    order: list[int] = Field(
        description="Chunk IDs ordered from most to least relevant (1-indexed)"
    )


# ── System prompt ─────────────────────────────────────────────────

SYSTEM_PROMPT = """You are SkyNest AI Copilot — a knowledgeable, friendly travel assistant.
You answer questions about SkyNest flights, hotels, car rentals, visa policies,
baggage rules, loyalty programme, and travel destinations.

RULES:
• Only provide information about SkyNest's own services.
• NEVER mention or recommend other airlines, hotels, or companies.
• If a route or service is not in the context, say "SkyNest does not currently offer this."
• If you don't know something, say so — never make up information.
• Be accurate, warm, and concise.

Relevant extracts from the SkyNest Knowledge Base:
{context}
"""


# ── Core helpers ─────────────────────────────────────────────────

def _embed(text: str) -> list[float]:
    return openai_client.embeddings.create(
        model=EMBEDDING_MODEL, input=[text]
    ).data[0].embedding


def _retrieve(query: str) -> list[Chunk]:
    vector  = _embed(query)
    results = _get_collection().query(query_embeddings=[vector], n_results=RETRIEVAL_K)
    return [
        Chunk(page_content=doc, metadata=meta)
        for doc, meta in zip(results["documents"][0], results["metadatas"][0])
    ]


def _merge(a: list[Chunk], b: list[Chunk]) -> list[Chunk]:
    seen, merged = set(), list(a)
    seen.update(c.page_content for c in a)
    for c in b:
        if c.page_content not in seen:
            merged.append(c)
            seen.add(c.page_content)
    return merged


@retry(wait=wait)
def _rerank(question: str, chunks: list[Chunk]) -> list[Chunk]:
    sys_p = (
        "You are a document re-ranker. Given a question and numbered chunks, "
        "return ALL chunk IDs ordered from most to least relevant. "
        "Reply with JSON only."
    )
    body = f"Question:\n{question}\n\nChunks:\n"
    for i, c in enumerate(chunks, 1):
        body += f"# CHUNK {i}:\n{c.page_content[:400]}\n\n"
    body += "Return all chunk IDs reranked."

    resp  = completion(
        model=MODEL,
        messages=[
            {"role": "system",  "content": sys_p},
            {"role": "user",    "content": body},
        ],
        response_format=RankOrder,
    )
    order = RankOrder.model_validate_json(resp.choices[0].message.content).order
    # Guard against out-of-range indices
    valid = [i - 1 for i in order if 1 <= i <= len(chunks)]
    # Append any chunk that was missed
    visited = set(valid)
    valid  += [i for i in range(len(chunks)) if i not in visited]
    return [chunks[i] for i in valid]


@retry(wait=wait)
def _rewrite_query(question: str, history: list[dict]) -> str:
    """Rewrite the question to improve Knowledge Base retrieval."""
    history_text = "\n".join(
        f"{m['role']}: {m['content']}" for m in history[-6:]  # last 3 turns
    )
    prompt = f"""You help retrieve from a travel knowledge base about SkyNest Airlines.
Conversation so far:
{history_text}

User's latest question:
{question}

Rewrite it as a SHORT, specific search query (≤ 15 words) that best surfaces relevant content.
Focus on key entities: destination, policy name, visa type, etc.
Reply ONLY with the rewritten query, nothing else."""
    resp = completion(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content.strip()


# ── Public API ────────────────────────────────────────────────────

def fetch_context(question: str, history: list[dict] | None = None) -> list[Chunk]:
    """Dual-retrieval + LLM rerank → top FINAL_K chunks."""
    history = history or []
    rewritten = _rewrite_query(question, history)
    chunks1   = _retrieve(question)
    chunks2   = _retrieve(rewritten)
    merged    = _merge(chunks1, chunks2)
    reranked  = _rerank(question, merged)
    return reranked[:FINAL_K]


@retry(wait=wait)
def answer_question(question: str, history: list[dict] | None = None) -> tuple[str, list[Chunk]]:
    """
    Full RAG answer.
    Returns (answer_text, list_of_source_chunks).
    history format: [{"role": "user"|"assistant", "content": "..."}]
    """
    history  = history or []
    chunks   = fetch_context(question, history)
    context  = "\n\n".join(
        f"[Source: {c.metadata.get('source','?')}]\n{c.page_content}" for c in chunks
    )
    system_p = SYSTEM_PROMPT.format(context=context)
    messages = [{"role": "system", "content": system_p}] + history + [
        {"role": "user", "content": question}
    ]
    resp = completion(model=MODEL, messages=messages)
    return resp.choices[0].message.content, chunks


# ── Quick test ───────────────────────────────────────────────────
if __name__ == "__main__":
    q = "Do I need a visa to travel from India to Dubai?"
    ans, ctx = answer_question(q)
    print(f"Q: {q}\n\nA: {ans}\n\nSources used: {len(ctx)}")
