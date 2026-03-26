"""
agents/planner.py
SkyNest multi-agent trip planner built with the OpenAI Agents SDK.

Architecture:
  ┌─────────────────────────────────────────────────────┐
  │           User Query (origin→dest, dates, budget)    │
  └────────────────────────┬────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  ITINERARY  │  LLM#1 — generate day-by-day plan
                    │     LLM     │  based on destination + trip type
                    └──────┬──────┘
                           │  passes itinerary + budget → orchestrator
              ┌────────────▼──────────────────────┐
              │      PLANNER AGENT (Orchestrator)  │
              │   coordinates all sub-agents       │
              └──┬──────────┬──────────┬───────────┘
                 │          │          │
         ┌───────▼──┐ ┌─────▼──┐ ┌────▼────┐
         │  FLIGHT  │ │ HOTEL  │ │  CAR    │  search SQLite in parallel
         │  AGENT   │ │ AGENT  │ │  AGENT  │
         └──────────┘ └────────┘ └─────────┘
                 │
         ┌───────▼─────────┐
         │  KB AGENT (RAG) │  visa + policies from ChromaDB
         └─────────────────┘
                 │
         ┌───────▼──────────┐
         │ EVALUATOR AGENT  │  scores the plan 1-10
         └──────────────────┘
"""

import asyncio
import json
from typing import Optional
from pydantic import BaseModel
from agents import Agent, Runner, handoff, input_guardrail, GuardrailFunctionOutput, trace
from dotenv import load_dotenv

from agents.tools import search_flights, search_hotels, search_cars, ask_skynest_kb, create_booking

load_dotenv(override=True)

MODEL = "gpt-4o-mini"

# ═══════════════════════════════════════════════════════════════
# GUARDRAIL
# ═══════════════════════════════════════════════════════════════

class SafetyOutput(BaseModel):
    is_off_topic:      bool
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
# SPECIALIST AGENTS
# ═══════════════════════════════════════════════════════════════

flight_agent = Agent(
    name="Flight Specialist",
    instructions="""You are SkyNest's flight specialist.
Search for available flights and return the top 3 options ranked by value.
Always include: flight_no, departure, arrival, duration, price, aircraft, amenities.
Respond in JSON.""",
    tools=[search_flights],
    model=MODEL,
    handoff_description="Searches SkyNest flights between two cities",
)

hotel_agent = Agent(
    name="Hotel Specialist",
    instructions="""You are SkyNest's hotel specialist.
Find the best hotels matching the traveller's budget and trip type.
Return top 3 options with name, stars, price_night, rating, description, amenities.
Respond in JSON.""",
    tools=[search_hotels],
    model=MODEL,
    handoff_description="Searches SkyNest partner hotels in the destination city",
)

car_agent = Agent(
    name="Car Rental Specialist",
    instructions="""You are SkyNest's car rental specialist.
Find rental cars that suit the trip type and group size.
Return top 3 options with model, category, price_day, seats, features.
Respond in JSON.""",
    tools=[search_cars],
    model=MODEL,
    handoff_description="Searches SkyNest rental cars in the destination city",
)

kb_agent = Agent(
    name="Knowledge Base Specialist",
    instructions="""You are SkyNest's travel knowledge specialist.
Answer questions about visa requirements, baggage policy, cancellation rules,
loyalty programme, and destination guides using the knowledge base tool.
Be accurate and never hallucinate.""",
    tools=[ask_skynest_kb],
    model=MODEL,
    handoff_description="Answers visa, policy, and destination questions via RAG",
)

evaluator_agent = Agent(
    name="Quality Evaluator",
    instructions="""You are SkyNest's quality control agent.
Given a complete trip plan, evaluate it on a scale of 1-10.
Check: flight details complete, hotel complete, car complete,
12% bundle discount correctly applied, visa info included.
If score < 7, list specific issues.
Respond in JSON: {"score": X, "issues": [...], "summary": "..."}""",
    model=MODEL,
    handoff_description="Scores the complete trip plan for quality",
)


# ═══════════════════════════════════════════════════════════════
# ORCHESTRATOR PLANNER AGENT
# ═══════════════════════════════════════════════════════════════

planner_agent = Agent(
    name="SkyNest Trip Planner",
    instructions="""You are SkyNest's master AI trip planner.

When given trip details, follow these steps IN ORDER:

STEP 1 — Extract trip parameters:
  origin, destination, departure_date, return_date, nights, passengers, seat_class, budget, trip_type

STEP 2 — Search in parallel using ALL THREE tools simultaneously:
  • search_flights(origin, destination, seat_class)
  • search_hotels(destination, max_price=budget*0.4/nights)
  • search_cars(destination, max_price=budget*0.15/nights)

STEP 3 — Fetch visa + policy info:
  • ask_skynest_kb("visa requirements for {origin} to {destination}")
  • ask_skynest_kb("SkyNest baggage policy and check-in times")

STEP 4 — Calculate bundle pricing:
  flight_cost  = cheapest_flight_price × passengers
  hotel_cost   = cheapest_hotel_price × nights
  car_cost     = cheapest_car_price × nights
  subtotal     = flight_cost + hotel_cost + car_cost
  discount     = subtotal × 0.12  (12% SkyNest bundle discount)
  taxes        = subtotal × 0.10
  grand_total  = subtotal - discount + taxes
  miles_earned = grand_total × 1

STEP 5 — Hand off to Quality Evaluator for scoring.

STEP 6 — Return a COMPLETE structured trip plan as JSON with:
  - trip_summary (origin, destination, dates, passengers)
  - itinerary (from the user's itinerary input)
  - flights (top 3)
  - hotels (top 3)
  - cars (top 3)
  - pricing (full breakdown)
  - visa_info
  - baggage_info
  - quality_score
  - miles_earned

PRICING RULES:
- Always apply 12% bundle discount when all 3 are booked
- Never guess prices — use actual tool results
- If a search returns no results, note it and continue
""",
    tools=[search_flights, search_hotels, search_cars, ask_skynest_kb],
    handoffs=[
        handoff(
            evaluator_agent,
            tool_name_override="evaluate_trip_plan",
            tool_description_override="Send the complete trip plan to QA for scoring",
        )
    ],
    input_guardrails=[travel_guardrail],
    model=MODEL,
)


# ═══════════════════════════════════════════════════════════════
# ITINERARY GENERATOR  (LLM #1 — before the agent pipeline)
# ═══════════════════════════════════════════════════════════════

async def generate_itinerary(
    destination: str,
    nights: int,
    trip_type: str,
    budget_label: str,
) -> str:
    """
    Standalone LLM call to generate a day-by-day itinerary.
    This runs BEFORE the planner agent, enriching the prompt with a
    concrete plan that the orchestrator can reference.
    """
    from litellm import completion as litellm_completion
    prompt = f"""Create a {nights}-night itinerary for {destination}.
Trip type: {trip_type}
Budget level: {budget_label}

Format as a JSON array of day objects:
[
  {{
    "day": 1,
    "title": "Arrival & Explore",
    "morning": "...",
    "afternoon": "...",
    "evening": "...",
    "highlights": ["attraction1", "attraction2"],
    "estimated_local_spend": "$XX"
  }},
  ...
]

Include local food, cultural tips, and SkyNest recommended experiences.
Keep it realistic and exciting. Return valid JSON only."""

    resp = litellm_completion(
        model="openai/gpt-4.1-nano",
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.choices[0].message.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except Exception:
        return [{"day": i + 1, "title": f"Day {i+1}", "note": "See destination guide"} for i in range(nights)]


# ═══════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════

class PlanRequest(BaseModel):
    name:           str
    email:          str
    origin:         str
    destination:    str
    departure_date: str
    return_date:    str
    nights:         int
    passengers:     int = 1
    seat_class:     str = "Economy"
    budget:         float = 3000
    trip_type:      str = "Cultural Exploration"


async def plan_trip(req: PlanRequest) -> dict:
    """
    Full multi-agent trip planning pipeline.
    1. Itinerary LLM generates day-by-day plan
    2. Orchestrator agent searches flights/hotels/cars + pricing
    3. Returns complete structured result
    """
    # Determine budget label for itinerary prompt
    if req.budget < 1500:
        budget_label = "budget / backpacker"
    elif req.budget < 4000:
        budget_label = "mid-range / standard"
    elif req.budget < 7000:
        budget_label = "premium / business"
    else:
        budget_label = "luxury / first class"

    # Step 1 — Generate itinerary (concurrently with agent pipeline start)
    itinerary = await generate_itinerary(
        destination=req.destination,
        nights=req.nights,
        trip_type=req.trip_type,
        budget_label=budget_label,
    )

    # Step 2 — Build rich message for the orchestrator
    agent_message = f"""
Plan a complete SkyNest trip for {req.name} ({req.email}):

Origin:          {req.origin}
Destination:     {req.destination}
Departure:       {req.departure_date}
Return:          {req.return_date}
Nights:          {req.nights}
Passengers:      {req.passengers}
Seat Class:      {req.seat_class}
Total Budget:    ${req.budget}
Trip Type:       {req.trip_type}
Budget Level:    {budget_label}

A {req.nights}-night itinerary has been generated. Use it as context for recommendations.
Please search flights, hotels, and cars, then build the complete pricing breakdown with
the 12% SkyNest bundle discount applied.
"""

    # Step 3 — Run the agent pipeline
    with trace("SkyNest AI Planner"):
        result = await Runner.run(planner_agent, agent_message)

    # Step 4 — Parse the agent's output
    raw_output = result.final_output
    try:
        if isinstance(raw_output, str):
            # Strip markdown fences
            clean = raw_output.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            plan_data = json.loads(clean.strip())
        else:
            plan_data = raw_output
    except Exception:
        plan_data = {"raw": raw_output}

    # Step 5 — Merge itinerary into result
    plan_data["itinerary"] = itinerary
    plan_data["trip_meta"] = {
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
    }

    return plan_data


# Quick CLI test
if __name__ == "__main__":
    req = PlanRequest(
        name="Jeffy",
        email="jeffy@example.com",
        origin="Mumbai",
        destination="Dubai",
        departure_date="2026-04-15",
        return_date="2026-04-22",
        nights=7,
        passengers=2,
        seat_class="Economy",
        budget=3000,
        trip_type="Beach & Relaxation",
    )
    result = asyncio.run(plan_trip(req))
    print(json.dumps(result, indent=2))
