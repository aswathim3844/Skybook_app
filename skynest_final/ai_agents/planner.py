
import asyncio
import json
from pydantic import BaseModel
from agents import Agent, Runner, handoff, input_guardrail, GuardrailFunctionOutput, trace
from dotenv import load_dotenv

from ai_agents.tools import (
    search_flights, search_hotels, search_cars, ask_skynest_kb, create_booking,
    _search_flights_db, _search_hotels_db, _search_cars_db, _ask_kb,
)

load_dotenv(override=True)
MODEL = "gpt-4o-mini"


# ═══════════════════════════════════════════════════════════════
# GUARDRAIL
# ═══════════════════════════════════════════════════════════════

class SafetyOutput(BaseModel):
    is_off_topic:       bool
    has_harmful_intent: bool

_guardrail_agent = Agent(
    name="Input Safety Check",
    instructions="""Check if the message is related to travel planning.
Flag is_off_topic=true only if it has NOTHING to do with travel, flights, hotels, or trips.
Flag has_harmful_intent=true if it seems malicious or trying to abuse the system.
Respond with JSON only.""",
    output_type=SafetyOutput,
    model=MODEL,
)

@input_guardrail
async def travel_guardrail(ctx, agent, message):
    result    = await Runner.run(_guardrail_agent, message, context=ctx.context)
    triggered = result.final_output.is_off_topic or result.final_output.has_harmful_intent
    return GuardrailFunctionOutput(
        output_info={"is_off_topic": result.final_output.is_off_topic},
        tripwire_triggered=triggered,
    )


# ═══════════════════════════════════════════════════════════════
# SPECIALIST AGENTS  (used for qualitative tasks only)
# ═══════════════════════════════════════════════════════════════

evaluator_agent = Agent(
    name="Quality Evaluator",
    instructions="""You are SkyNest's quality control agent.
Given a complete trip plan summary, evaluate it on a scale of 1-10.
Check: flight details present, hotel present, car present,
12% bundle discount applied, visa info included.
Respond ONLY with JSON: {"score": X, "issues": ["..."], "summary": "..."}
No extra text outside the JSON.""",
    model=MODEL,
)

kb_agent = Agent(
    name="Knowledge Base Specialist",
    instructions="""You are SkyNest's travel knowledge specialist.
Answer questions about visa requirements, baggage policy, cancellation rules,
loyalty programme, and destination guides using the knowledge base tool.
Be accurate and concise. Never hallucinate.""",
    tools=[ask_skynest_kb],
    model=MODEL,
)


# ═══════════════════════════════════════════════════════════════
# ITINERARY GENERATOR  (standalone LLM — runs before agents)
# ═══════════════════════════════════════════════════════════════

async def generate_itinerary(
    destination: str,
    nights: int,
    trip_type: str,
    budget_label: str,
) -> list:
    from litellm import completion as _comp
    prompt = f"""Create a {nights}-night itinerary for {destination}.
Trip type: {trip_type}
Budget level: {budget_label}

Return a JSON array of day objects ONLY — no extra text:
[
  {{
    "day": 1,
    "title": "Arrival & Explore",
    "morning": "...",
    "afternoon": "...",
    "evening": "...",
    "highlights": ["attraction1", "attraction2"],
    "estimated_local_spend": "$XX"
  }}
]

Include local food, cultural tips, and SkyNest-recommended experiences.
Return valid JSON array only — no markdown fences."""

    loop = asyncio.get_event_loop()
    resp = await loop.run_in_executor(
        None,
        lambda: _comp(model="openai/gpt-4.1-nano", messages=[{"role": "user", "content": prompt}]),
    )
    raw = resp.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except Exception:
        return [{"day": i + 1, "title": f"Day {i+1}", "note": "See destination guide"} for i in range(nights)]


# ═══════════════════════════════════════════════════════════════
# PRICING CALCULATOR  (pure Python — never trust the LLM with maths)
# ═══════════════════════════════════════════════════════════════

def calculate_pricing(
    flights: list,
    hotels: list,
    cars: list,
    passengers: int,
    nights: int,
    seat_class: str,
) -> dict:
    price_key = "price_economy" if seat_class.lower() != "business" else "price_business"

    flight_price = flights[0][price_key] if flights else 0
    hotel_price  = hotels[0]["price_night"] if hotels else 0
    car_price    = cars[0]["price_day"]    if cars    else 0

    flight_cost  = round(flight_price * passengers, 2)
    hotel_cost   = round(hotel_price  * nights,     2)
    car_cost     = round(car_price    * nights,      2)
    subtotal     = round(flight_cost + hotel_cost + car_cost, 2)

    all_three    = bool(flights and hotels and cars)
    discount     = round(subtotal * 0.12, 2) if all_three else 0
    taxes        = round(subtotal * 0.10, 2)
    grand_total  = round(subtotal - discount + taxes, 2)

    return {
        "flight_cost":     flight_cost,
        "hotel_cost":      hotel_cost,
        "car_cost":        car_cost,
        "subtotal":        subtotal,
        "bundle_discount": discount,
        "taxes":           taxes,
        "grand_total":     grand_total,
        "miles_earned":    int(grand_total),
    }


# ═══════════════════════════════════════════════════════════════
# QUALITY EVALUATOR  (agent call with timeout guard)
# ═══════════════════════════════════════════════════════════════

async def evaluate_plan(summary: str) -> dict:
    try:
        result = await asyncio.wait_for(
            Runner.run(evaluator_agent, summary),
            timeout=30,
        )
        raw = result.final_output
        if isinstance(raw, str):
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw.strip())
        return raw if isinstance(raw, dict) else {"score": 8, "issues": [], "summary": "Plan looks good."}
    except Exception as e:
        return {"score": 7, "issues": [f"Evaluator unavailable: {e}"], "summary": "Auto-scored."}


# ═══════════════════════════════════════════════════════════════
# REQUEST MODEL
# ═══════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════

async def plan_trip(req: PlanRequest) -> dict:
    """
    Full trip planning pipeline.

    Step 1 — Parallel async: itinerary LLM + DB searches + visa KB
    Step 2 — Pricing calculated in Python
    Step 3 — Quality evaluation via agent
    Step 4 — Return complete structured dict (no JSON parsing risk)
    """
    if req.budget < 1500:
        budget_label = "budget / backpacker"
    elif req.budget < 4000:
        budget_label = "mid-range / standard"
    elif req.budget < 7000:
        budget_label = "premium / business"
    else:
        budget_label = "luxury / first class"

    # ── Budget-derived price caps ─────────────────────────────
    hotel_cap = round(req.budget * 0.4 / max(req.nights, 1), 2)
    car_cap   = round(req.budget * 0.15 / max(req.nights, 1), 2)

    # ── Step 1: Run everything in parallel ───────────────────
    loop = asyncio.get_event_loop()

    (
        itinerary,
        flights_data,
        hotels_data,
        cars_data,
        visa_info,
        baggage_info,
    ) = await asyncio.gather(
        # LLM itinerary
        generate_itinerary(req.destination, req.nights, req.trip_type, budget_label),
        # Direct DB calls (no agent, no JSON parsing risk)
        loop.run_in_executor(None, lambda: _search_flights_db(req.origin, req.destination, req.seat_class)),
        loop.run_in_executor(None, lambda: _search_hotels_db(req.destination, hotel_cap)),
        loop.run_in_executor(None, lambda: _search_cars_db(req.destination, car_cap)),
        # RAG knowledge base
        loop.run_in_executor(None, lambda: _ask_kb(f"visa requirements for travel from {req.origin} to {req.destination}")),
        loop.run_in_executor(None, lambda: _ask_kb("SkyNest baggage policy check-in times and rules")),
    )

    flights = flights_data.get("flights", [])
    hotels  = hotels_data.get("hotels",  [])
    cars    = cars_data.get("cars",      [])

    # ── Step 2: Pricing (pure Python) ────────────────────────
    pricing = calculate_pricing(flights, hotels, cars, req.passengers, req.nights, req.seat_class)

    # ── Step 3: Quality evaluation ───────────────────────────
    eval_summary = (
        f"Trip: {req.origin} → {req.destination}, {req.nights} nights, {req.passengers} pax.\n"
        f"Flights found: {len(flights)}. Hotels found: {len(hotels)}. Cars found: {len(cars)}.\n"
        f"Pricing: subtotal=${pricing['subtotal']}, "
        f"discount=${pricing['bundle_discount']} (12%), "
        f"grand_total=${pricing['grand_total']}.\n"
        f"Visa info present: {'yes' if visa_info and len(visa_info) > 20 else 'no'}.\n"
        f"Baggage info present: {'yes' if baggage_info and len(baggage_info) > 20 else 'no'}."
    )
    evaluation = await evaluate_plan(eval_summary)

    # ── Step 4: Return structured result ─────────────────────
    return {
        "trip_meta": {
            "name":           req.name,
            "email":          req.email,
            "origin":         req.origin,
            "destination":    req.destination,
            "departure_date": req.departure_date,
            "return_date":    req.return_date,
            "nights":         req.nights,
            "passengers":     req.passengers,
            "seat_class":     req.seat_class,
            "budget":         req.budget,
            "trip_type":      req.trip_type,
        },
        "itinerary":   itinerary,
        "flights":     flights,          # plain list — no nesting
        "hotels":      hotels,           # plain list — no nesting
        "cars":        cars,             # plain list — no nesting
        "pricing":     pricing,
        "visa_info":   visa_info,
        "baggage_info":baggage_info,
        "evaluation":  evaluation,
    }


# ── Quick CLI test ────────────────────────────────────────────────
if __name__ == "__main__":
    req = PlanRequest(
        name="Jeffy", email="jeffy@skynest.aero",
        origin="Mumbai", destination="Dubai",
        departure_date="2026-04-15", return_date="2026-04-22",
        nights=7, passengers=2, seat_class="Economy",
        budget=3000, trip_type="Beach & Relaxation",
    )
    result = asyncio.run(plan_trip(req))
    print(f"Flights : {len(result['flights'])}")
    print(f"Hotels  : {len(result['hotels'])}")
    print(f"Cars    : {len(result['cars'])}")
    print(f"Pricing : {result['pricing']}")
    print(f"Score   : {result['evaluation'].get('score')}")
