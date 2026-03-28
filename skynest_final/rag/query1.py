

from pathlib import Path
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from litellm import completion
from pydantic import BaseModel, Field
from tenacity import retry, wait_exponential
from dotenv import load_dotenv

load_dotenv(override=True)

MODEL           = "openai/gpt-4.1-nano"
EMBEDDING_MODEL = "text-embedding-3-large"
RETRIEVAL_K     = 20    
FINAL_K         = 10
DB_NAME         = str(Path(__file__).parent.parent / "vector_db")

wait   = wait_exponential(multiplier=1, min=2, max=30)
_store = None


def _get_store() -> Chroma:
    global _store
    if _store is None:
        _store = Chroma(
            persist_directory=DB_NAME,
            embedding_function=OpenAIEmbeddings(model=EMBEDDING_MODEL),
        )
    return _store


class RankOrder(BaseModel):
    order: list[int] = Field(description="Chunk IDs 1-indexed, most to least relevant")


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


def _retrieve(query: str) -> list[Document]:
    return _get_store().similarity_search(query, k=RETRIEVAL_K)


def _merge(a: list[Document], b: list[Document]) -> list[Document]:
    seen, merged = set(), list(a)
    seen.update(d.page_content for d in a)
    for d in b:
        if d.page_content not in seen:
            merged.append(d)
            seen.add(d.page_content)
    return merged


@retry(wait=wait)
def _rewrite_query(question: str, history: list[dict]) -> str:
    history_text = "\n".join(f"{m['role']}: {m['content']}" for m in history[-6:])
    prompt = f"""You help retrieve from a SkyNest Airlines travel knowledge base.
Conversation so far:
{history_text}

User question: {question}

Rewrite as a SHORT specific KB search query (max 15 words).
Focus on: destination, policy name, visa type, flight route, hotel name.
Reply ONLY with the rewritten query."""
    resp = completion(model=MODEL, messages=[{"role": "user", "content": prompt}])
    return resp.choices[0].message.content.strip()


@retry(wait=wait)
def _rerank(question: str, docs: list[Document]) -> list[Document]:
    body = f"Question:\n{question}\n\nChunks:\n"
    for i, d in enumerate(docs, 1):
        body += f"# CHUNK {i}:\n{d.page_content[:400]}\n\n"
    body += "Return all chunk IDs reranked from most to least relevant."

    sys_p = """You are a document re-ranker for a travel knowledge base.
Rank chunks by relevance to the question.
CRITICAL: Put the single most directly relevant chunk FIRST (rank 1).
For comparative questions, prefer chunks containing BOTH items being compared.
For multi-part questions, prefer chunks covering the most parts.
Reply with JSON only: {"order": [1, 5, 3, ...]}"""

    resp  = completion(
        model=MODEL,
        messages=[
            {"role": "system", "content": sys_p},
            {"role": "user",   "content": body},
        ],
        response_format=RankOrder,
    )
    order   = RankOrder.model_validate_json(resp.choices[0].message.content).order
    valid   = [i - 1 for i in order if 1 <= i <= len(docs)]
    visited = set(valid)
    valid  += [i for i in range(len(docs)) if i not in visited]
    return [docs[i] for i in valid]


def fetch_context(question: str, history: list[dict] | None = None) -> list[Document]:
    history   = history or []
    rewritten = _rewrite_query(question, history)
    docs1     = _retrieve(question)    # original query
    docs2     = _retrieve(rewritten)   # rewritten query
    merged    = _merge(docs1, docs2)
    reranked  = _rerank(question, merged)
    return reranked[:FINAL_K]


@retry(wait=wait)
def answer_question(
    question: str,
    history: list[dict] | None = None,
) -> tuple[str, list[Document]]:
    history  = history or []
    docs     = fetch_context(question, history)
    context  = "\n\n".join(
        f"[Source: {d.metadata.get('source', '?')}]\n{d.page_content}"
        for d in docs
    )
    messages = (
        [{"role": "system", "content": SYSTEM_PROMPT.format(context=context)}]
        + history
        + [{"role": "user", "content": question}]
    )
    resp = completion(model=MODEL, messages=messages)
    return resp.choices[0].message.content, docs


if __name__ == "__main__":
    q = "Do I need a visa to travel from India to Dubai?"
    ans, ctx = answer_question(q)
    print(f"Q: {q}\n\nA: {ans}\n\nSources: {len(ctx)}")
