

import json
from typing import Optional
from agents import function_tool
from database.db import get_connection



# CORE HELPERS  (plain Python — callable from anywhere)


def _search_flights_db(
    origin: str,
    destination: str,
    seat_class: str = "Economy",
    max_price: Optional[float] = None,
) -> dict:
    """Returns {'flights': [...]} dict."""
    conn = get_connection()
    price_col = "price_economy" if seat_class.lower() != "business" else "price_business"
    avail_col = "seats_economy" if seat_class.lower() != "business" else "seats_business"

    sql = f"""
        SELECT id, flight_no, origin, destination,
               departure, arrival, duration, duration_mins,
               price_economy, price_business, aircraft, airline, amenities,
               seats_economy, seats_business
        FROM   flights
        WHERE  LOWER(origin)      = LOWER(?)
          AND  LOWER(destination) = LOWER(?)
          AND  {avail_col}        > 0
          {"AND " + price_col + " <= ?" if max_price else ""}
        ORDER  BY {price_col} ASC
        LIMIT  5
    """
    params = [origin, destination] + ([max_price] if max_price else [])
    rows   = conn.execute(sql, params).fetchall()
    conn.close()

    if not rows:
        return {"flights": [], "message": f"No SkyNest flights found from {origin} to {destination}."}

    flights = []
    for r in rows:
        price = r["price_economy"] if seat_class.lower() != "business" else r["price_business"]
        flights.append({
            "id":              r["id"],
            "flight_no":       r["flight_no"],
            "origin":          r["origin"],
            "destination":     r["destination"],
            "departure":       r["departure"],
            "arrival":         r["arrival"],
            "duration":        r["duration"],
            "duration_mins":   r["duration_mins"],
            "price_economy":   r["price_economy"],
            "price_business":  r["price_business"],
            "price":           price,
            "seat_class":      seat_class,
            "airline":         r["airline"],
            "aircraft":        r["aircraft"],
            "amenities":       json.loads(r["amenities"]),
            "seats_available": r[avail_col],
        })
    return {"flights": flights}


def _search_hotels_db(
    city: str,
    max_price: Optional[float] = None,
    min_stars: int = 1,
) -> dict:
    """Returns {'hotels': [...]} dict."""
    conn = get_connection()
    sql  = """
        SELECT id, name, city, country, stars, price_night,
               rating, amenities, description, rooms_available
        FROM   hotels
        WHERE  LOWER(city) = LOWER(?)
          AND  stars        >= ?
          AND  rooms_available > 0
          {}
        ORDER  BY rating DESC, price_night ASC
        LIMIT  5
    """.format("AND price_night <= ?" if max_price else "")
    params = [city, min_stars] + ([max_price] if max_price else [])
    rows   = conn.execute(sql, params).fetchall()
    conn.close()

    if not rows:
        return {"hotels": [], "message": f"No hotels found in {city}."}

    return {"hotels": [
        {
            "id":              r["id"],
            "name":            r["name"],
            "city":            r["city"],
            "country":         r["country"],
            "stars":           r["stars"],
            "price_night":     r["price_night"],
            "rating":          r["rating"],
            "amenities":       json.loads(r["amenities"]),
            "description":     r["description"],
            "rooms_available": r["rooms_available"],
        }
        for r in rows
    ]}


def _search_cars_db(
    city: str,
    max_price: Optional[float] = None,
    category: Optional[str] = None,
) -> dict:
    """Returns {'cars': [...]} dict."""
    conn    = get_connection()
    filters = ["LOWER(city) = LOWER(?)", "units_available > 0"]
    params  = [city]
    if max_price:
        filters.append("price_day <= ?"); params.append(max_price)
    if category:
        filters.append("LOWER(category) = LOWER(?)"); params.append(category)

    sql = f"""
        SELECT id, company, city, model, category,
               price_day, seats, transmission, features, units_available
        FROM   cars
        WHERE  {" AND ".join(filters)}
        ORDER  BY price_day ASC
        LIMIT  5
    """
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    if not rows:
        return {"cars": [], "message": f"No rental cars found in {city}."}

    return {"cars": [
        {
            "id":              r["id"],
            "company":         r["company"],
            "city":            r["city"],
            "model":           r["model"],
            "category":        r["category"],
            "price_day":       r["price_day"],
            "seats":           r["seats"],
            "transmission":    r["transmission"],
            "features":        json.loads(r["features"]),
            "units_available": r["units_available"],
        }
        for r in rows
    ]}


def _ask_kb(question: str) -> str:
    """Query the RAG knowledge base. Returns plain-text answer."""
    try:
        from rag.query import answer_question
        answer, _ = answer_question(question)
        return answer
    except Exception as e:
        return f"Knowledge base unavailable: {e}. Run 'python -m rag.ingest' first."


# @function_tool WRAPPERS  (used by OpenAI Agents SDK)


@function_tool
def search_flights(
    origin: str,
    destination: str,
    seat_class: str = "Economy",
    max_price: Optional[float] = None,
) -> str:
    """
    Search SkyNest flights between two cities.
    Returns up to 5 available flights as a JSON string.
    seat_class must be 'Economy' or 'Business'.
    """
    return json.dumps(_search_flights_db(origin, destination, seat_class, max_price))


@function_tool
def search_hotels(
    city: str,
    max_price: Optional[float] = None,
    min_stars: int = 1,
) -> str:
    """
    Search SkyNest partner hotels in a destination city.
    Returns up to 5 hotels as a JSON string.
    """
    return json.dumps(_search_hotels_db(city, max_price, min_stars))


@function_tool
def search_cars(
    city: str,
    max_price: Optional[float] = None,
    category: Optional[str] = None,
) -> str:
    """
    Search SkyNest rental cars in a destination city.
    Returns up to 5 cars as a JSON string.
    category options: Budget, Standard, Premium, Luxury, Eco, Electric
    """
    return json.dumps(_search_cars_db(city, max_price, category))


@function_tool
def ask_skynest_kb(question: str) -> str:
    """
    Query the SkyNest RAG knowledge base for visa requirements,
    baggage policy, cancellation rules, loyalty programme details,
    destination guides, and travel tips.
    Returns a plain-text answer.
    """
    return _ask_kb(question)


@function_tool
def create_booking(
    name: str,
    email: str,
    flight_id: int,
    hotel_id: int,
    car_id: int,
    check_in: str,
    check_out: str,
    nights: int,
    passengers: int,
    seat_class: str,
    total_price: float,
) -> str:
    """
    Confirm and persist a SkyNest bundle booking.
    Decrements seat/room/car availability in the database.
    Returns booking reference and status as JSON.
    """
    import random, string
    ref  = "SN" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO bookings
               (booking_ref,name,email,flight_id,hotel_id,car_id,
                check_in,check_out,nights,passengers,seat_class,total_price,status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'CONFIRMED')""",
            (ref, name, email, flight_id, hotel_id, car_id,
             check_in, check_out, nights, passengers, seat_class, total_price),
        )
        seat_col = "seats_economy" if seat_class.lower() != "business" else "seats_business"
        conn.execute(
            f"UPDATE flights SET {seat_col} = MAX(0, {seat_col} - ?) WHERE id = ?",
            (passengers, flight_id),
        )
        conn.execute(
            "UPDATE hotels SET rooms_available = MAX(0, rooms_available - 1) WHERE id = ?",
            (hotel_id,),
        )
        conn.execute(
            "UPDATE cars SET units_available = MAX(0, units_available - 1) WHERE id = ?",
            (car_id,),
        )
        conn.commit()
        return json.dumps({"booking_ref": ref, "status": "CONFIRMED", "total_price": total_price})
    except Exception as e:
        conn.rollback()
        return json.dumps({"error": str(e), "status": "FAILED"})
    finally:
        conn.close()

