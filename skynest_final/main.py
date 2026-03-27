"""
main.py
SkyNest FastAPI Backend — all endpoints consumed by the Next.js frontend.

Start:
    uvicorn main:app --reload --port 8000
"""

import json
import random
import string
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from database.db import get_connection, init_db


# ─────────────────────────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise SQLite on first startup."""
    init_db()
    yield

app = FastAPI(
    title="SkyNest API",
    version="1.0.0",
    description="Backend for SkyNest AI Travel Platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────
# REQUEST / RESPONSE MODELS
# ─────────────────────────────────────────────────────────────────

class FlightSearchRequest(BaseModel):
    origin:      str
    destination: str
    seat_class:  str = "Economy"
    max_price:   Optional[float] = None

class HotelSearchRequest(BaseModel):
    city:       str
    max_price:  Optional[float] = None
    min_stars:  int = 1

class CarSearchRequest(BaseModel):
    city:      str
    max_price: Optional[float] = None
    category:  Optional[str]   = None

class BookingRequest(BaseModel):
    name:        str
    email:       str
    flight_id:   int
    hotel_id:    int
    car_id:      int
    check_in:    str
    check_out:   str
    nights:      int
    passengers:  int = 1
    seat_class:  str = "Economy"
    total_price: float

class ChatRequest(BaseModel):
    message: str
    history: list = []          # list of [user_msg, ai_reply] pairs

class PlanRequest(BaseModel):
    name:           str
    email:          str
    origin:         str
    destination:    str
    departure_date: str
    return_date:    str
    nights:         int
    passengers:     int   = 1
    seat_class:     str   = "Economy"
    budget:         float = 3000
    trip_type:      str   = "Cultural Exploration"


# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    return dict(row)

def _rows_to_list(rows) -> list[dict]:
    return [dict(r) for r in rows]

def _parse_json_fields(items: list[dict], *fields) -> list[dict]:
    for item in items:
        for f in fields:
            if isinstance(item.get(f), str):
                try:
                    item[f] = json.loads(item[f])
                except Exception:
                    pass
    return items


# ─────────────────────────────────────────────────────────────────
# FLIGHT ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@app.post("/flights/search")
def search_flights(req: FlightSearchRequest):
    """Search available SkyNest flights between two cities."""
    conn     = get_connection()
    price_col = "price_economy" if req.seat_class.lower() != "business" else "price_business"
    avail_col = "seats_economy" if req.seat_class.lower() != "business" else "seats_business"

    sql = f"""
        SELECT id, flight_no, origin, destination,
               departure, arrival, duration, duration_mins,
               price_economy, price_business, airline, aircraft,
               amenities, seats_economy, seats_business
        FROM   flights
        WHERE  LOWER(origin)      = LOWER(?)
          AND  LOWER(destination) = LOWER(?)
          AND  {avail_col}        > 0
          {"AND " + price_col + " <= ?" if req.max_price else ""}
        ORDER  BY {price_col} ASC
        LIMIT  6
    """
    params = [req.origin, req.destination] + ([req.max_price] if req.max_price else [])
    rows   = _rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()

    flights = _parse_json_fields(rows, "amenities")
    # Add selected seat price for frontend convenience
    for f in flights:
        f["price"] = f["price_economy"] if req.seat_class.lower() != "business" else f["price_business"]
        f["seat_class"] = req.seat_class
        f["seats_available"] = f["seats_economy"] if req.seat_class.lower() != "business" else f["seats_business"]

    return {"flights": flights}


# ─────────────────────────────────────────────────────────────────
# HOTEL ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@app.post("/hotels/search")
def search_hotels(req: HotelSearchRequest):
    """Search SkyNest partner hotels in a city."""
    conn = get_connection()
    sql  = """
        SELECT id, name, city, country, stars, price_night,
               rating, amenities, description, rooms_available
        FROM   hotels
        WHERE  LOWER(city) = LOWER(?)
          AND  stars >= ?
          AND  rooms_available > 0
          {}
        ORDER  BY rating DESC, price_night ASC
        LIMIT  6
    """.format("AND price_night <= ?" if req.max_price else "")
    params = [req.city, req.min_stars] + ([req.max_price] if req.max_price else [])
    rows   = _rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()
    hotels = _parse_json_fields(rows, "amenities")
    return {"hotels": hotels}


# ─────────────────────────────────────────────────────────────────
# CAR ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@app.post("/cars/search")
def search_cars(req: CarSearchRequest):
    """Search SkyNest rental cars in a city."""
    conn    = get_connection()
    filters = ["LOWER(city) = LOWER(?)", "units_available > 0"]
    params  = [req.city]

    if req.max_price:
        filters.append("price_day <= ?"); params.append(req.max_price)
    if req.category:
        filters.append("LOWER(category) = LOWER(?)"); params.append(req.category)

    sql  = f"""
        SELECT id, company, city, model, category, price_day,
               seats, transmission, features, units_available
        FROM   cars
        WHERE  {" AND ".join(filters)}
        ORDER  BY price_day ASC
        LIMIT  6
    """
    rows = _rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()
    cars = _parse_json_fields(rows, "features")
    return {"cars": cars}


# ─────────────────────────────────────────────────────────────────
# BOOKING ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@app.post("/bookings")
def create_booking(req: BookingRequest):
    """Confirm a SkyNest bundle booking and update availability."""
    ref  = "SN" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO bookings
               (booking_ref,name,email,flight_id,hotel_id,car_id,
                check_in,check_out,nights,passengers,seat_class,total_price,status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'CONFIRMED')""",
            (ref, req.name, req.email, req.flight_id, req.hotel_id, req.car_id,
             req.check_in, req.check_out, req.nights, req.passengers,
             req.seat_class, req.total_price),
        )
        seat_col = "seats_economy" if req.seat_class.lower() != "business" else "seats_business"
        conn.execute(
            f"UPDATE flights SET {seat_col} = MAX(0, {seat_col} - ?) WHERE id = ?",
            (req.passengers, req.flight_id),
        )
        conn.execute(
            "UPDATE hotels SET rooms_available = MAX(0, rooms_available - 1) WHERE id = ?",
            (req.hotel_id,),
        )
        conn.execute(
            "UPDATE cars SET units_available = MAX(0, units_available - 1) WHERE id = ?",
            (req.car_id,),
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Booking failed: {e}")
    conn.close()
    return {
        "booking_ref":  ref,
        "status":       "CONFIRMED",
        "total_price":  req.total_price,
        "miles_earned": int(req.total_price),
    }


@app.get("/bookings/{ref}")
def get_booking(ref: str):
    """Retrieve a booking by its reference code."""
    conn = get_connection()
    row  = conn.execute(
        "SELECT * FROM bookings WHERE booking_ref = ?", (ref.upper(),)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking = dict(row)

    # Enrich with flight / hotel / car details
    conn = get_connection()
    if booking.get("flight_id"):
        f = conn.execute("SELECT * FROM flights WHERE id = ?", (booking["flight_id"],)).fetchone()
        if f:
            fd = dict(f); fd["amenities"] = json.loads(fd.get("amenities", "[]"))
            booking["flight"] = fd
    if booking.get("hotel_id"):
        h = conn.execute("SELECT * FROM hotels WHERE id = ?", (booking["hotel_id"],)).fetchone()
        if h:
            hd = dict(h); hd["amenities"] = json.loads(hd.get("amenities", "[]"))
            booking["hotel"] = hd
    if booking.get("car_id"):
        c = conn.execute("SELECT * FROM cars WHERE id = ?", (booking["car_id"],)).fetchone()
        if c:
            cd = dict(c); cd["features"] = json.loads(cd.get("features", "[]"))
            booking["car"] = cd
    conn.close()
    return booking


# ─────────────────────────────────────────────────────────────────
# CHAT ENDPOINT (RAG Copilot)
# ─────────────────────────────────────────────────────────────────

@app.post("/chat")
def chat(req: ChatRequest):
    """
    AI Copilot endpoint powered by the advanced RAG pipeline.
    history format: list of [user_msg, ai_reply] pairs
    """
    # Convert list-of-pairs history to role-dict format
    history_dicts = []
    for pair in req.history:
        if isinstance(pair, (list, tuple)) and len(pair) == 2:
            history_dicts.append({"role": "user",      "content": pair[0]})
            history_dicts.append({"role": "assistant",  "content": pair[1]})

    try:
        from rag.query import answer_question
        reply, sources = answer_question(req.message, history_dicts)
        return {
            "reply":   reply,
            "sources": [
                {"source": c.metadata.get("source", ""), "type": c.metadata.get("type", "")}
                for c in sources[:3]
            ],
        }
    except Exception as e:
        # Graceful fallback if KB not yet ingested
        return {
            "reply": (
                f"I'm SkyNest AI Copilot! The knowledge base is still loading. "
                f"Please run 'python -m rag.ingest' to enable full RAG responses. "
                f"Error: {e}"
            ),
            "sources": [],
        }


# ─────────────────────────────────────────────────────────────────
# AI PLANNER ENDPOINT (Multi-Agent)
# ─────────────────────────────────────────────────────────────────

@app.post("/plan")
async def plan_trip(req: PlanRequest):
    """
    Full AI trip planning pipeline:
      1. Itinerary LLM generates day-by-day plan
      2. OpenAI Agents SDK orchestrates flight/hotel/car search
      3. Pricing breakdown with 12% bundle discount
      4. Visa + policy info from RAG knowledge base
      5. Quality evaluation score
    """
    from ai_agents.planner import plan_trip as _plan_trip, PlanRequest as AgentPlanRequest

    agent_req = AgentPlanRequest(
        name=req.name,
        email=req.email,
        origin=req.origin,
        destination=req.destination,
        departure_date=req.departure_date,
        return_date=req.return_date,
        nights=req.nights,
        passengers=req.passengers,
        seat_class=req.seat_class,
        budget=req.budget,
        trip_type=req.trip_type,
    )
    try:
        result = await _plan_trip(agent_req)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Planning failed: {e}")


# ─────────────────────────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    conn = get_connection()
    stats = {
        "flights": conn.execute("SELECT COUNT(*) FROM flights").fetchone()[0],
        "hotels":  conn.execute("SELECT COUNT(*) FROM hotels").fetchone()[0],
        "cars":    conn.execute("SELECT COUNT(*) FROM cars").fetchone()[0],
        "bookings":conn.execute("SELECT COUNT(*) FROM bookings").fetchone()[0],
    }
    conn.close()
    return {"status": "ok", "service": "SkyNest API", "db": stats}

@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}
