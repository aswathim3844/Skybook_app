"""
agent_app.py — SkyNest Backend Test UI  (fixed)
Run:
    uv run python agent_app.py

FIXES vs original:
  1. format_flights/hotels/cars — handle list OR nested dict input
  2. run_planner — uses asyncio.run() safely via nest_asyncio patch
  3. format_pricing — key names match what calculate_pricing() returns
  4. Trip summary now always shows because trip_meta is always set
"""

import asyncio
import json

import gradio as gr
from dotenv import load_dotenv

# ── nest_asyncio patch (Gradio runs its own event loop) ──────────
try:
    import nest_asyncio
    nest_asyncio.apply()
except ImportError:
    pass   # install with: pip install nest_asyncio

load_dotenv(override=True)

from ai_agents.planner import plan_trip, PlanRequest
from rag.query import answer_question

CITIES = [
    "Mumbai", "Delhi",
    "Dubai",
    "London", "Paris",
    "Singapore", "Bangkok", "Tokyo",
    "New York",
]

TRIP_TYPES = [
    "Cultural Exploration", "Beach & Relaxation", "Adventure & Activities",
    "Family Trip", "Business Travel", "Luxury", "Honeymoon",
]


# ══════════════════════════════════════════════════════════════════
# SECTION 1 — RAG COPILOT
# ══════════════════════════════════════════════════════════════════

def chat(message, history):
    history_dicts = []
    for item in history:
        if isinstance(item, dict):
            history_dicts.append(item)
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            history_dicts.append({"role": "user",      "content": item[0]})
            history_dicts.append({"role": "assistant",  "content": item[1]})
    try:
        answer, chunks = answer_question(message, history_dicts)
        sources = list({
            c.metadata.get("source", "").replace("\\", "/").split("/")[-1]
            for c in chunks
        })
        source_line = f"\n\n*Sources: {', '.join(sources[:3])}*" if sources else ""
        return answer + source_line
    except Exception as e:
        return f"Sorry, I couldn't answer that right now: {e}"


# ══════════════════════════════════════════════════════════════════
# FORMAT HELPERS  (all defensive — accept list OR nested dict)
# ══════════════════════════════════════════════════════════════════

def _to_list(data, key: str) -> list:
    """
    Normalise data to a plain list regardless of shape:
      [...]            → [...]
      {"flights": [...]} → [...]
      None / {}        → []
    """
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get(key, [])
    return []


def format_flights(flights) -> str:
    flights = _to_list(flights, "flights")
    if not flights:
        return "*No flights found — check origin/destination are in the database.*"

    out = "### ✈️ Flights\n"
    for i, f in enumerate(flights[:3], 1):
        if not isinstance(f, dict):
            continue
        badge = " 🏅 *Recommended*" if i == 1 else ""
        out += f"**{i}. {f.get('flight_no', 'N/A')}**{badge}  \n"
        out += (
            f"{f.get('origin', '')} → {f.get('destination', '')} | "
            f"{f.get('departure', 'N/A')} → {f.get('arrival', 'N/A')} | "
            f"Duration: {f.get('duration', 'N/A')}  \n"
        )
        out += (
            f"Economy: **${f.get('price_economy', 'N/A')}** | "
            f"Business: **${f.get('price_business', 'N/A')}** | "
            f"{f.get('aircraft', '')}  \n"
        )
        amenities = f.get("amenities", [])
        if amenities:
            out += f"Amenities: {', '.join(amenities[:4])}  \n"
        out += "\n"
    return out


def format_hotels(hotels) -> str:
    hotels = _to_list(hotels, "hotels")
    if not hotels:
        return "*No hotels found — destination may not be in the database.*"

    out = "### 🏨 Hotels\n"
    for i, h in enumerate(hotels[:3], 1):
        if not isinstance(h, dict):
            continue
        badge = " 🏅 *Recommended*" if i == 1 else ""
        stars = "⭐" * int(h.get("stars", 0))
        out += f"**{i}. {h.get('name', 'N/A')}** {stars}{badge}  \n"
        out += (
            f"${h.get('price_night', 'N/A')}/night | "
            f"Rating: {h.get('rating', 'N/A')}/5 | "
            f"{h.get('rooms_available', '?')} rooms available  \n"
        )
        desc = h.get("description", "")
        if desc:
            out += f"{desc[:150]}{'...' if len(desc) > 150 else ''}  \n"
        out += "\n"
    return out


def format_cars(cars) -> str:
    cars = _to_list(cars, "cars")
    if not cars:
        return "*No cars found — destination may not be in the database.*"

    out = "### 🚗 Rental Cars\n"
    for i, c in enumerate(cars[:3], 1):
        if not isinstance(c, dict):
            continue
        badge = " 🏅 *Recommended*" if i == 1 else ""
        out += (
            f"**{i}. {c.get('model', 'N/A')}** "
            f"({c.get('category', '')}){badge}  \n"
        )
        out += (
            f"${c.get('price_day', 'N/A')}/day | "
            f"{c.get('seats', 'N/A')} seats | "
            f"{c.get('transmission', '')} | "
            f"{c.get('company', '')}  \n"
        )
        features = c.get("features", [])
        if features:
            out += f"Features: {', '.join(features[:4])}  \n"
        out += "\n"
    return out


def format_pricing(pricing: dict) -> str:
    if not pricing:
        return "*Pricing will appear after search*"

    # Handles both key name variants
    bundle_discount = pricing.get("bundle_discount", pricing.get("discount", 0))
    grand_total     = pricing.get("grand_total",     pricing.get("final_price", "N/A"))

    lines = [
        "### 💰 Pricing Breakdown",
        "",
        "| Item | Cost |",
        "|---|---|",
        f"| ✈️ Flights (× passengers) | **${pricing.get('flight_cost', 'N/A')}** |",
        f"| 🏨 Hotel (× nights) | **${pricing.get('hotel_cost', 'N/A')}** |",
        f"| 🚗 Car Rental (× nights) | **${pricing.get('car_cost', 'N/A')}** |",
        f"| Subtotal | ${pricing.get('subtotal', 'N/A')} |",
        f"| 🎉 **12% Bundle Discount** | **-${bundle_discount}** |",
        f"| Taxes (10%) | ${pricing.get('taxes', 'N/A')} |",
        f"| **✈️ Grand Total** | **${grand_total}** |",
        f"| SkyNest Miles Earned | ✨ {pricing.get('miles_earned', 'N/A')} miles |",
        "",
        f"> *You saved **${bundle_discount}** by booking flights, hotel, and car together!*",
    ]
    return "\n".join(lines)


def format_itinerary(itinerary) -> str:
    if not itinerary or not isinstance(itinerary, list):
        return "*Itinerary will appear after search*"

    out = "### 🗺️ Day-by-Day Itinerary\n\n"
    for day in itinerary:
        if not isinstance(day, dict):
            continue
        out += f"**Day {day.get('day', '?')}: {day.get('title', '')}**  \n"
        if day.get("morning"):
            out += f"🌅 **Morning:** {day['morning']}  \n"
        if day.get("afternoon"):
            out += f"☀️ **Afternoon:** {day['afternoon']}  \n"
        if day.get("evening"):
            out += f"🌙 **Evening:** {day['evening']}  \n"
        highlights = day.get("highlights", [])
        if highlights:
            out += f"📍 Highlights: {', '.join(highlights)}  \n"
        spend = day.get("estimated_local_spend")
        if spend:
            out += f"💵 Est. local spend: {spend}  \n"
        out += "\n"
    return out


def format_visa_quality(visa_info: str, baggage_info: str, evaluation: dict) -> str:
    out = ""

    if visa_info:
        out += f"### 🛂 Visa Requirements\n{visa_info}\n\n---\n\n"

    if baggage_info:
        out += f"### 🧳 Baggage & Check-in Policy\n{baggage_info}\n\n---\n\n"

    if evaluation:
        score   = evaluation.get("score", "?")
        summary = evaluation.get("summary", "")
        issues  = evaluation.get("issues", [])
        stars   = "⭐" * min(int(float(score)), 10) if score != "?" else ""
        out += f"### 🎯 AI Quality Score: **{score}/10** {stars}\n"
        if summary:
            out += f"{summary}  \n"
        if issues:
            out += "\n**Issues flagged:**  \n"
            for issue in issues:
                out += f"- {issue}  \n"

    return out or "*Visa and quality info will appear after search*"


# ══════════════════════════════════════════════════════════════════
# MAIN PLANNER RUNNER
# ══════════════════════════════════════════════════════════════════

def run_planner(
    name, email, origin, destination,
    departure, returns, nights, passengers,
    seat_class, budget, trip_type,
    progress=gr.Progress(),
):
    """Runs the full pipeline and returns 7 Markdown strings for the UI."""
    EMPTY = ("", "", "", "", "", "", "")

    if not origin or not destination:
        return ("*Please select origin and destination.*",) + ("",) * 6

    progress(0.05, desc="Validating inputs...")

    req = PlanRequest(
        name=name           or "Traveller",
        email=email         or "traveller@skynest.aero",
        origin=origin,
        destination=destination,
        departure_date=departure or "2026-04-15",
        return_date=returns      or "2026-04-22",
        nights=int(nights)       if nights     else 7,
        passengers=int(passengers) if passengers else 1,
        seat_class=seat_class,
        budget=float(budget)     if budget     else 3000,
        trip_type=trip_type,
    )

    try:
        progress(0.2, desc="Searching flights, hotels, cars in parallel...")

        # Run the async pipeline synchronously inside Gradio
        # nest_asyncio.apply() at the top makes this safe
        result = asyncio.run(plan_trip(req))

        progress(0.85, desc="Formatting results...")

        meta    = result.get("trip_meta", {})
        flights = result.get("flights", [])
        hotels  = result.get("hotels",  [])
        cars    = result.get("cars",    [])

        # Trip summary header
        header = (
            f"## ✈️ {meta.get('origin')} → {meta.get('destination')}\n\n"
            f"**{meta.get('departure_date')}** → **{meta.get('return_date')}** &nbsp;|&nbsp; "
            f"{meta.get('nights')} nights &nbsp;|&nbsp; "
            f"{meta.get('passengers')} passenger(s) &nbsp;|&nbsp; "
            f"{meta.get('seat_class')} &nbsp;|&nbsp; "
            f"Budget: ${meta.get('budget'):,.0f}\n\n"
            f"---\n\n"
            f"✅ Found **{len(flights)}** flights · **{len(hotels)}** hotels · **{len(cars)}** cars"
        )

        progress(1.0, desc="Done!")
        return (
            header,
            format_flights(flights),
            format_hotels(hotels),
            format_cars(cars),
            format_pricing(result.get("pricing", {})),
            format_itinerary(result.get("itinerary", [])),
            format_visa_quality(
                result.get("visa_info", ""),
                result.get("baggage_info", ""),
                result.get("evaluation", {}),
            ),
        )

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        err = f"## ❌ Error\n```\n{type(e).__name__}: {e}\n\n{tb[-800:]}\n```"
        return (err, "", "", "", "", "", "")


# ══════════════════════════════════════════════════════════════════
# GRADIO UI
# ══════════════════════════════════════════════════════════════════

theme = gr.themes.Soft(font=["Inter", "system-ui", "sans-serif"])

with gr.Blocks(title="SkyNest Backend Test", theme=theme) as ui:

    gr.Markdown(
        "# ✈️ SkyNest — Backend Test UI\n"
        "*Mirrors exactly what the teammate's Next.js frontend calls*"
    )

    with gr.Tabs():

        # ── TAB 1: RAG Copilot ────────────────────────────────────
        with gr.TabItem("🤖 AI Copilot (RAG Chat)"):
            gr.Markdown(
                "### SkyNest AI Copilot\n"
                "Tests the `POST /chat` endpoint — advanced RAG with dual-collection retrieval."
            )
            with gr.Row():
                chip1 = gr.Button("🛂 Visa for Dubai from India?",  size="sm")
                chip2 = gr.Button("☀️ Best time to visit London?",   size="sm")
                chip3 = gr.Button("🧳 SkyNest baggage allowance?",   size="sm")
            with gr.Row():
                chip4 = gr.Button("❌ How to cancel a booking?",     size="sm")
                chip5 = gr.Button("💺 SkyNest Elite tier benefits?",  size="sm")
                chip6 = gr.Button("🏨 Tokyo hotels with onsen?",     size="sm")

            copilot = gr.ChatInterface(
                fn=chat,
                chatbot=gr.Chatbot(height=420, type="messages"),
                textbox=gr.Textbox(
                    placeholder="Ask anything about SkyNest...", show_label=False
                ),
            )

            for chip, q in [
                (chip1, "Do I need a visa for Dubai from India?"),
                (chip2, "What is the best time to visit London?"),
                (chip3, "What is the SkyNest baggage allowance policy?"),
                (chip4, "How do I cancel my SkyNest booking?"),
                (chip5, "What are the benefits of SkyNest Elite tier?"),
                (chip6, "Which Tokyo hotel has a rooftop onsen?"),
            ]:
                chip.click(lambda q=q: q, outputs=copilot.textbox)

        # ── TAB 2: AI Planner ─────────────────────────────────────
        with gr.TabItem("🧠 AI Planner (Agentic)"):
            gr.Markdown(
                "### Multi-Agent Trip Planner\n"
                "**Pipeline:** Itinerary LLM → DB searches (parallel) → "
                "Pricing calculator → Visa RAG → Evaluator Agent\n\n"
                "*Takes 15–40 seconds*"
            )

            with gr.Row():
                with gr.Column(scale=1):
                    gr.Markdown("#### Trip Details")
                    with gr.Row():
                        inp_name  = gr.Textbox(label="Name",  value="Jeffy",              scale=1)
                        inp_email = gr.Textbox(label="Email", value="jeffy@skynest.aero", scale=1)
                    with gr.Row():
                        inp_origin = gr.Dropdown(label="From", choices=CITIES, value="Mumbai", scale=1)
                        inp_dest   = gr.Dropdown(label="To",   choices=CITIES, value="Dubai",  scale=1)
                    with gr.Row():
                        inp_dep = gr.Textbox(label="Departure Date", value="2026-04-15", scale=1)
                        inp_ret = gr.Textbox(label="Return Date",    value="2026-04-22", scale=1)
                    with gr.Row():
                        inp_nights = gr.Number(label="Nights",     value=7, minimum=1, maximum=30, scale=1)
                        inp_pax    = gr.Number(label="Passengers", value=2, minimum=1, maximum=9,  scale=1)
                    with gr.Row():
                        inp_class  = gr.Dropdown(
                            label="Seat Class", choices=["Economy", "Business"], value="Economy", scale=1
                        )
                        inp_budget = gr.Number(label="Budget ($)", value=3000, minimum=500, scale=1)
                    inp_type = gr.Dropdown(
                        label="Trip Type", choices=TRIP_TYPES, value="Cultural Exploration"
                    )
                    search_btn = gr.Button("🚀 Search with AI Agents", variant="primary", size="lg")
                    gr.Markdown(
                        "**What happens:**  \n"
                        "1. Itinerary LLM generates day-by-day plan  \n"
                        "2. Flight + Hotel + Car DB queries run in parallel  \n"
                        "3. 12% bundle discount calculated in Python  \n"
                        "4. Visa info fetched from RAG knowledge base  \n"
                        "5. Evaluator Agent scores the plan 1–10"
                    )

                with gr.Column(scale=1):
                    gr.Markdown("#### Trip Summary")
                    out_summary = gr.Markdown("*Your trip plan will appear here after searching...*")

            gr.Markdown("---")
            with gr.Tabs():
                with gr.TabItem("✈️ Flights"):
                    out_flights = gr.Markdown("*Run the planner to see flights*")
                with gr.TabItem("🏨 Hotels"):
                    out_hotels = gr.Markdown("*Run the planner to see hotels*")
                with gr.TabItem("🚗 Cars"):
                    out_cars = gr.Markdown("*Run the planner to see cars*")
                with gr.TabItem("💰 Pricing"):
                    out_pricing = gr.Markdown("*Run the planner to see pricing*")
                with gr.TabItem("🗺️ Itinerary"):
                    out_itinerary = gr.Markdown("*Run the planner to see itinerary*")
                with gr.TabItem("🛂 Visa & Quality"):
                    out_visa = gr.Markdown("*Run the planner to see visa info and quality score*")

            search_btn.click(
                fn=run_planner,
                inputs=[
                    inp_name, inp_email, inp_origin, inp_dest,
                    inp_dep, inp_ret, inp_nights, inp_pax,
                    inp_class, inp_budget, inp_type,
                ],
                outputs=[
                    out_summary, out_flights, out_hotels,
                    out_cars, out_pricing, out_itinerary, out_visa,
                ],
            )


if __name__ == "__main__":
    ui.launch(inbrowser=True)