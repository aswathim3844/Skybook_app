"""
agent_app.py
Gradio UI to test the SkyNest Agentic Planner.
Run from skynest_final/:
    uv run python agent_app.py
"""

import json
import asyncio
import gradio as gr
from dotenv import load_dotenv

from ai_agents.planner import plan_trip, PlanRequest

load_dotenv(override=True)


def format_plan(result: dict) -> str:
    """Format the raw plan dict into readable markdown."""
    if not result:
        return "*No plan generated*"

    md = ""

    # ── Trip summary ─────────────────────────────────────────────
    meta = result.get("trip_meta", {})
    if meta:
        md += f"## Trip Summary\n"
        md += f"**{meta.get('origin')} → {meta.get('destination')}**  \n"
        md += f"{meta.get('departure_date')} → {meta.get('return_date')} ({meta.get('nights')} nights)  \n"
        md += f"{meta.get('passengers')} passenger(s) · {meta.get('seat_class')} · Budget: ${meta.get('budget')}\n\n"

    # ── Quality score ─────────────────────────────────────────────
    qs = result.get("quality_score") or (result.get("evaluation") or {}).get("score")
    if qs:
        stars = "⭐" * int(float(qs))
        md += f"## Quality Score: {qs}/10 {stars}\n\n"

    # ── Pricing ───────────────────────────────────────────────────
    pricing = result.get("pricing", {})
    if pricing:
        md += "## Pricing Breakdown\n"
        md += f"| Item | Cost |\n|---|---|\n"
        md += f"| Flight | ${pricing.get('flight_cost', 'N/A')} |\n"
        md += f"| Hotel  | ${pricing.get('hotel_cost',  'N/A')} |\n"
        md += f"| Car    | ${pricing.get('car_cost',    'N/A')} |\n"
        md += f"| Subtotal | ${pricing.get('subtotal', 'N/A')} |\n"
        md += f"| **12% Bundle Discount** | **-${pricing.get('bundle_discount', 'N/A')}** |\n"
        md += f"| **Total** | **${pricing.get('final_price', pricing.get('grand_total', 'N/A'))}** |\n"
        md += f"| Miles Earned | {pricing.get('miles_earned', 'N/A')} ✈️ |\n\n"

    # ── Flights ───────────────────────────────────────────────────
    flights = result.get("flights", [])
    if flights:
        md += "## Top Flights\n"
        for i, f in enumerate(flights[:3], 1):
            if isinstance(f, dict):
                md += f"**{i}. {f.get('flight_no', 'N/A')}** — "
                md += f"{f.get('departure', 'N/A')} → {f.get('arrival', 'N/A')} "
                md += f"({f.get('duration', 'N/A')})  \n"
                md += f"Economy: ${f.get('price_economy', 'N/A')} | Business: ${f.get('price_business', 'N/A')} | {f.get('aircraft', '')}\n\n"

    # ── Hotels ────────────────────────────────────────────────────
    hotels = result.get("hotels", [])
    if hotels:
        md += "## Top Hotels\n"
        for i, h in enumerate(hotels[:3], 1):
            if isinstance(h, dict):
                stars_str = "⭐" * int(h.get("stars", 0))
                md += f"**{i}. {h.get('name', 'N/A')}** {stars_str}  \n"
                md += f"${h.get('price_night', 'N/A')}/night · Rating: {h.get('rating', 'N/A')}/5  \n"
                md += f"{h.get('description', '')}\n\n"

    # ── Cars ──────────────────────────────────────────────────────
    cars = result.get("cars", [])
    if cars:
        md += "## Rental Cars\n"
        for i, c in enumerate(cars[:3], 1):
            if isinstance(c, dict):
                md += f"**{i}. {c.get('model', 'N/A')}** ({c.get('category', '')})  \n"
                md += f"${c.get('price_day', 'N/A')}/day · {c.get('seats', 'N/A')} seats · {c.get('transmission', '')}\n\n"

    # ── Visa info ─────────────────────────────────────────────────
    visa = result.get("visa_info", "")
    if visa:
        md += f"## Visa Information\n{visa}\n\n"

    # ── Itinerary ─────────────────────────────────────────────────
    itinerary = result.get("itinerary", [])
    if itinerary and isinstance(itinerary, list):
        md += "## Day-by-Day Itinerary\n"
        for day in itinerary:
            if isinstance(day, dict):
                md += f"**Day {day.get('day', '?')}: {day.get('title', '')}**  \n"
                if day.get("morning"):
                    md += f"🌅 Morning: {day['morning']}  \n"
                if day.get("afternoon"):
                    md += f"☀️ Afternoon: {day['afternoon']}  \n"
                if day.get("evening"):
                    md += f"🌙 Evening: {day['evening']}  \n"
                md += "\n"

    return md or f"```json\n{json.dumps(result, indent=2)[:3000]}\n```"


def format_raw(result: dict) -> str:
    """Show raw JSON for debugging."""
    return f"```json\n{json.dumps(result, indent=2)}\n```"


def run_plan(
    name, email, origin, destination,
    departure, returns, nights, passengers,
    seat_class, budget, trip_type
):
    """Called by Gradio — runs the async planner synchronously."""
    if not origin or not destination:
        return "Please fill in at least origin and destination.", "{}"

    req = PlanRequest(
        name=name or "Traveller",
        email=email or "test@skynest.aero",
        origin=origin,
        destination=destination,
        departure_date=departure or "2026-04-15",
        return_date=returns or "2026-04-22",
        nights=int(nights) if nights else 7,
        passengers=int(passengers) if passengers else 1,
        seat_class=seat_class,
        budget=float(budget) if budget else 3000,
        trip_type=trip_type,
    )

    try:
        result = asyncio.run(plan_trip(req))
        return format_plan(result), format_raw(result)
    except Exception as e:
        error_msg = f"## Error\n```\n{type(e).__name__}: {e}\n```"
        return error_msg, "{}"


# ── Build UI ──────────────────────────────────────────────────────

theme = gr.themes.Soft(font=["Inter", "system-ui", "sans-serif"])

with gr.Blocks(title="SkyNest AI Planner 🧠", theme=theme) as ui:
    gr.Markdown("# ✈️ SkyNest AI Planner\nMulti-agent trip planning — fill the form and hit **Plan My Trip**")

    with gr.Row():

        # ── Left: Input form ──────────────────────────────────────
        with gr.Column(scale=1):
            gr.Markdown("### Trip Details")

            with gr.Row():
                name  = gr.Textbox(label="Name",  placeholder="Jeffy",           value="Jeffy")
                email = gr.Textbox(label="Email", placeholder="jeffy@email.com",  value="jeffy@email.com")

            with gr.Row():
                origin      = gr.Textbox(label="From",        placeholder="Mumbai",  value="Mumbai")
                destination = gr.Textbox(label="To",          placeholder="Dubai",   value="Dubai")

            with gr.Row():
                departure = gr.Textbox(label="Departure Date", placeholder="2026-04-15", value="2026-04-15")
                returns   = gr.Textbox(label="Return Date",    placeholder="2026-04-22", value="2026-04-22")

            with gr.Row():
                nights     = gr.Number(label="Nights",     value=7,    minimum=1, maximum=30)
                passengers = gr.Number(label="Passengers", value=2,    minimum=1, maximum=9)

            with gr.Row():
                seat_class = gr.Dropdown(
                    label="Seat Class",
                    choices=["Economy", "Business"],
                    value="Economy",
                )
                budget = gr.Number(label="Total Budget ($)", value=3000, minimum=500)

            trip_type = gr.Dropdown(
                label="Trip Type",
                choices=[
                    "Cultural Exploration",
                    "Beach & Relaxation",
                    "Adventure & Hiking",
                    "Romantic Getaway",
                    "Family Holiday",
                    "Business Trip",
                    "Food & Nightlife",
                ],
                value="Cultural Exploration",
            )

            plan_btn = gr.Button("🧠 Plan My Trip", variant="primary", size="lg")

            gr.Markdown(
                "**What happens when you click:**  \n"
                "1. Itinerary LLM generates day-by-day plan  \n"
                "2. FlightAgent + HotelAgent + CarAgent run in parallel  \n"
                "3. Bundle pricing with 12% discount calculated  \n"
                "4. Visa info fetched from RAG knowledge base  \n"
                "5. Evaluator scores the plan quality  \n"
                "*(Takes 20–40 seconds)*"
            )

        # ── Right: Output ─────────────────────────────────────────
        with gr.Column(scale=1):
            gr.Markdown("### Trip Plan")
            plan_output = gr.Markdown(
                value="*Your trip plan will appear here...*",
                label="Plan",
                height=600,
            )

    with gr.Row():
        gr.Markdown("### Raw JSON Output (for debugging)")
    with gr.Row():
        raw_output = gr.Markdown(
            value="*Raw agent output will appear here*",
            label="Raw JSON",
            height=300,
        )

    plan_btn.click(
        fn=run_plan,
        inputs=[
            name, email, origin, destination,
            departure, returns, nights, passengers,
            seat_class, budget, trip_type,
        ],
        outputs=[plan_output, raw_output],
    )


if __name__ == "__main__":
    ui.launch(inbrowser=True)
