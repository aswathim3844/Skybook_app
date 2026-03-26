# SkyNest Backend 🛫

AI-powered travel platform backend — FastAPI + SQLite + ChromaDB + OpenAI Agents SDK.

---

## Architecture

```
                          ┌─────────────────────────────────────────────┐
                          │           Next.js Frontend                   │
                          └──────────────────┬──────────────────────────┘
                                             │  HTTP
                          ┌──────────────────▼──────────────────────────┐
                          │           FastAPI  (main.py)                 │
                          │  /flights/search  /hotels/search             │
                          │  /cars/search     /bookings                  │
                          │  /chat            /plan  ◄── AI Planner      │
                          └──────┬────────────────────────┬──────────────┘
                                 │                        │
                  ┌──────────────▼──────┐     ┌──────────▼────────────────┐
                  │   SQLite Database   │     │  RAG Pipeline (ChromaDB)  │
                  │  flights / hotels   │     │  Advanced: dual-retrieval  │
                  │  cars   / bookings  │     │  + LLM rerank + query      │
                  └─────────────────────┘     │  rewrite                   │
                                              └────────────────────────────┘
                                                         ▲
                                              ┌──────────┴──────────────────┐
                                              │  OpenAI Agents SDK Pipeline │
                                              │                             │
                                              │  Itinerary LLM              │
                                              │       ↓                     │
                                              │  Planner Agent (orch.)      │
                                              │   ├─ Flight Agent           │
                                              │   ├─ Hotel Agent            │
                                              │   ├─ Car Agent              │
                                              │   ├─ KB Agent (RAG)         │
                                              │   └─ Evaluator Agent        │
                                              └─────────────────────────────┘
```

---

## Setup

### 1. Clone and install
```bash
git clone <your-repo>
cd skynest-backend
pip install -r requirements.txt
```

### 2. Environment
```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 3. Initialise the database
```bash
python -m database.db
# ✅ Seeded ~200 flights, ~120 hotels, ~100 cars
```

### 4. Ingest the knowledge base (RAG)
```bash
# First unzip the knowledge base:
unzip skynest_knowledge_base.zip -d .

# Then run ingestion (takes 2-5 min depending on KB size):
python -m rag.ingest
# ✅ Vector store ready — N vectors @ 3072d
```

### 5. Start the server
```bash
uvicorn main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health + DB stats |
| POST | `/flights/search` | Search flights (origin, destination, seat_class) |
| POST | `/hotels/search` | Search hotels (city, max_price, min_stars) |
| POST | `/cars/search` | Search cars (city, max_price, category) |
| POST | `/bookings` | Create a booking → returns booking_ref |
| GET | `/bookings/{ref}` | Retrieve booking details |
| POST | `/chat` | RAG Copilot chat |
| POST | `/plan` | Full AI trip planner (multi-agent) |

### POST /plan — AI Planner payload
```json
{
  "name":           "Jeffy",
  "email":          "jeffy@example.com",
  "origin":         "Mumbai",
  "destination":    "Dubai",
  "departure_date": "2026-04-15",
  "return_date":    "2026-04-22",
  "nights":         7,
  "passengers":     2,
  "seat_class":     "Economy",
  "budget":         4000,
  "trip_type":      "Beach & Relaxation"
}
```

### POST /plan — response shape
```json
{
  "trip_meta":     { ... },
  "itinerary":     [ { "day": 1, "title": "...", "morning": "...", ... }, ... ],
  "flights":       { "flights": [ ... ] },
  "hotels":        { "hotels": [ ... ] },
  "cars":          { "cars":   [ ... ] },
  "pricing": {
    "flight_cost":  1040,
    "hotel_cost":   1680,
    "car_cost":     455,
    "subtotal":     3175,
    "discount":     381,
    "taxes":        317,
    "grand_total":  3111,
    "miles_earned": 3111
  },
  "visa_info":     "...",
  "quality_score": { "score": 9, "issues": [], "summary": "Excellent plan" }
}
```

---

## RAG Pipeline — Why the Advanced One?

We chose the **advanced pipeline** over the simple LangChain one for these reasons:

| Feature | Simple (LangChain) | Advanced (chosen) |
|---------|-------------------|-------------------|
| Chunking | Fixed window | LLM semantic chunks with headline + summary |
| Retrieval | Single query | Dual (original + rewritten query) |
| Reranking | None | LLM rerank of merged candidates |
| Query rewrite | No | Yes — handles ambiguous phrasing |
| Overlap | Fixed 200 chars | LLM-chosen ~25% semantic overlap |

---

## Database Reset

To wipe and re-seed:
```bash
python -m database.db --reset
```

---

## Project Structure

```
skynest-backend/
├── database/
│   ├── __init__.py
│   └── db.py          ← SQLite schema + rich seed data (200+ flights, 120+ hotels)
├── rag/
│   ├── __init__.py
│   ├── ingest.py      ← Advanced RAG ingestion (run once)
│   └── query.py       ← Dual-retrieval + rerank query pipeline
├── agents/
│   ├── __init__.py
│   ├── tools.py       ← @function_tool decorated DB + RAG tools
│   └── planner.py     ← OpenAI Agents SDK multi-agent orchestrator
├── main.py            ← FastAPI app (all endpoints)
├── requirements.txt
├── .env.example
└── README.md
```
