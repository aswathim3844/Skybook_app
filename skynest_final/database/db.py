"""
database/db.py
SQLite database seeded with data that exactly matches the SkyNest knowledge base.
Cities: Mumbai, Delhi, London, Paris, Dubai, Singapore, Tokyo, New York, Bangkok
Flights: exact SN flight numbers, prices, times from the KB markdown files
Hotels:  exact names and prices from the KB hotel files
Cars:    exact models and daily rates from the KB rental_fleet files

Run to create + seed:
    uv run python -m database.db
    uv run python -m database.db --reset   (wipe and rebuild)
"""

import sqlite3
import json
import random
from pathlib import Path
from datetime import datetime, timedelta

DB_PATH = Path(__file__).parent.parent / "skynest.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS flights (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_no       TEXT NOT NULL,
    origin          TEXT NOT NULL,
    destination     TEXT NOT NULL,
    departure       TEXT NOT NULL,
    arrival         TEXT NOT NULL,
    duration        TEXT NOT NULL,
    duration_mins   INTEGER NOT NULL,
    price_economy   REAL NOT NULL,
    price_business  REAL NOT NULL,
    airline         TEXT NOT NULL DEFAULT 'SkyNest',
    aircraft        TEXT NOT NULL,
    amenities       TEXT NOT NULL DEFAULT '[]',
    seats_economy   INTEGER NOT NULL DEFAULT 150,
    seats_business  INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS hotels (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    city            TEXT NOT NULL,
    country         TEXT NOT NULL,
    stars           INTEGER NOT NULL,
    price_night     REAL NOT NULL,
    rating          REAL NOT NULL,
    amenities       TEXT NOT NULL DEFAULT '[]',
    description     TEXT NOT NULL DEFAULT '',
    rooms_available INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE IF NOT EXISTS cars (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company         TEXT NOT NULL,
    city            TEXT NOT NULL,
    model           TEXT NOT NULL,
    category        TEXT NOT NULL,
    price_day       REAL NOT NULL,
    seats           INTEGER NOT NULL,
    transmission    TEXT NOT NULL DEFAULT 'Automatic',
    features        TEXT NOT NULL DEFAULT '[]',
    units_available INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    flight_id   INTEGER REFERENCES flights(id),
    hotel_id    INTEGER REFERENCES hotels(id),
    car_id      INTEGER REFERENCES cars(id),
    check_in    TEXT NOT NULL,
    check_out   TEXT NOT NULL,
    nights      INTEGER NOT NULL,
    passengers  INTEGER NOT NULL DEFAULT 1,
    seat_class  TEXT NOT NULL DEFAULT 'Economy',
    total_price REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'CONFIRMED',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def _dep(time_str, dur_mins):
    """Return (departure ISO, arrival ISO) from HH:MM departure + duration."""
    dep = datetime.strptime(f"2026-04-15T{time_str}", "%Y-%m-%dT%H:%M")
    arr = dep + timedelta(minutes=dur_mins)
    return dep.strftime("%Y-%m-%dT%H:%M"), arr.strftime("%Y-%m-%dT%H:%M")


def _fmt(mins):
    return f"{mins // 60}h {mins % 60}m"


# ── Flights — exact KB data ───────────────────────────────────────
# (flight_no, origin, destination, dep_time, dur_mins, economy, business, aircraft, amenities)
FLIGHTS_KB = [
    # India → Dubai
    ("SN101", "Mumbai",    "Dubai",     "06:00", 150, 180,  650,  "Boeing 737 MAX",        ["WiFi","Meals","Entertainment","USB Charging"]),
    ("SN203", "Delhi",     "Dubai",     "07:00", 120, 160,  580,  "Boeing 737 MAX",        ["WiFi","Meals","Entertainment"]),
    # Dubai → India (return)
    ("SN102", "Dubai",     "Mumbai",    "10:00", 150, 180,  650,  "Boeing 737 MAX",        ["WiFi","Meals","Entertainment","USB Charging"]),
    # India → London
    ("SN103", "Mumbai",    "London",    "09:15", 510, 520,  1800, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Power Outlet","Lie-flat Seats","Lounge Access"]),
    ("SN201", "Delhi",     "London",    "09:00", 510, 510,  1750, "Airbus A380",           ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # London → India (return)
    ("SN104", "London",    "Mumbai",    "14:30", 510, 520,  1800, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Power Outlet","Lie-flat Seats"]),
    # India → Singapore
    ("SN105", "Mumbai",    "Singapore", "07:30", 330, 320,  980,  "Airbus A320neo",        ["WiFi","Meals","Entertainment","USB Charging"]),
    # Singapore → India (return)
    ("SN106", "Singapore", "Mumbai",    "16:00", 330, 320,  980,  "Airbus A320neo",        ["WiFi","Meals","Entertainment"]),
    # India → Bangkok
    ("SN109", "Mumbai",    "Bangkok",   "10:45", 210, 210,  720,  "Boeing 737 MAX",        ["WiFi","Meals","Entertainment"]),
    # Bangkok → India (return)
    ("SN110", "Bangkok",   "Mumbai",    "17:30", 210, 210,  720,  "Boeing 737 MAX",        ["WiFi","Meals","Entertainment"]),
    # India → New York
    ("SN107", "Mumbai",    "New York",  "02:00", 990, 780,  2600, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # New York → India (return)
    ("SN108", "New York",  "Mumbai",    "09:00", 990, 780,  2600, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
    # India → Paris
    ("SN205", "Delhi",     "Paris",     "14:00", 510, 530,  1820, "Airbus A380",           ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
    # Paris → India (return)
    ("SN206", "Paris",     "Delhi",     "20:00", 510, 530,  1820, "Airbus A380",           ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
    # India → Tokyo
    ("SN111", "Mumbai",    "Tokyo",     "08:00", 510, 680,  2200, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Premium Meals","Lie-flat Seats"]),
    # Tokyo → India (return)
    ("SN112", "Tokyo",     "Mumbai",    "19:00", 510, 680,  2200, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Premium Meals","Lie-flat Seats"]),
    # Dubai → London
    ("SN501", "Dubai",     "London",    "08:20", 445, 390,  1400, "Boeing 777-300ER",      ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # London → Dubai (return)
    ("SN502", "London",    "Dubai",     "14:00", 445, 390,  1400, "Boeing 777-300ER",      ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
    # Dubai → Singapore
    ("SN505", "Dubai",     "Singapore", "03:30", 420, 350,  1200, "Airbus A350-900",       ["WiFi","Meals","Entertainment","Lie-flat Seats"]),
    # Dubai → New York
    ("SN511", "Dubai",     "New York",  "08:45", 840, 700,  2400, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # Dubai → Paris
    ("SN507", "Dubai",     "Paris",     "09:00", 435, 420,  1500, "Airbus A350-900",       ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
    # Dubai → Tokyo
    ("SN509", "Dubai",     "Tokyo",     "22:00", 570, 580,  1950, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Lie-flat Seats","Premium Meals"]),
    # Dubai → Bangkok
    ("SN503", "Dubai",     "Bangkok",   "01:30", 330, 280,  920,  "Boeing 737 MAX",        ["WiFi","Meals","Entertainment"]),
    # London → Paris
    ("SN701", "London",    "Paris",     "07:00",  80, 110,  380,  "Airbus A320",           ["WiFi","Meals","Entertainment"]),
    # Paris → London (return)
    ("SN702", "Paris",     "London",    "10:00",  80, 110,  380,  "Airbus A320",           ["WiFi","Meals","Entertainment"]),
    # London → New York
    ("SN603", "London",    "New York",  "11:00", 420, 450,  1600, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # New York → London (return)
    ("SN604", "New York",  "London",    "18:00", 420, 450,  1600, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
    # London → Tokyo
    ("SN703", "London",    "Tokyo",     "10:30", 720, 720,  2400, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Lie-flat Seats","Premium Meals","Lounge Access"]),
    # London → Bangkok
    ("SN705", "London",    "Bangkok",   "21:00", 690, 620,  2000, "Airbus A350-900",       ["WiFi","Meals","Entertainment","Lie-flat Seats"]),
    # Bangkok → London (return)
    ("SN706", "Bangkok",   "London",    "01:00", 690, 620,  2000, "Airbus A350-900",       ["WiFi","Meals","Entertainment","Lie-flat Seats"]),
    # Singapore → London
    ("SN601", "Singapore", "London",    "21:30", 810, 650,  2200, "Airbus A380",           ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # Singapore → Paris
    ("SN605", "Singapore", "Paris",     "23:00", 780, 630,  2100, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Lie-flat Seats"]),
    # Singapore → Tokyo
    ("SN607", "Singapore", "Tokyo",     "08:00", 420, 400,  1350, "Airbus A350-900",       ["WiFi","Meals","Entertainment","Premium Meals"]),
    # Singapore → New York
    ("SN609", "Singapore", "New York",  "23:30",1110, 850,  3000, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # Singapore → Bangkok
    ("SN611", "Singapore", "Bangkok",   "07:30", 140, 120,  480,  "Airbus A320",           ["WiFi","Meals","Entertainment"]),
    # Bangkok → Singapore (return)
    ("SN612", "Bangkok",   "Singapore", "10:00", 140, 120,  480,  "Airbus A320",           ["WiFi","Meals","Entertainment"]),
    # Paris → Tokyo
    ("SN801", "Paris",     "Tokyo",     "11:30", 735, 730,  2450, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Lie-flat Seats","Premium Meals"]),
    # Tokyo → Paris (return)
    ("SN802", "Tokyo",     "Paris",     "12:00", 735, 730,  2450, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Lie-flat Seats","Premium Meals"]),
    # Paris → New York
    ("SN803", "Paris",     "New York",  "10:00", 480, 480,  1700, "Airbus A350-900",       ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # New York → Paris (return)
    ("SN804", "New York",  "Paris",     "16:00", 480, 480,  1700, "Airbus A350-900",       ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
    # Paris → Bangkok
    ("SN805", "Paris",     "Bangkok",   "22:00", 660, 600,  1980, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Lie-flat Seats"]),
    # Tokyo → New York
    ("SN901", "Tokyo",     "New York",  "10:30", 780, 780,  2700, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Premium Meals"]),
    # New York → Tokyo (return)
    ("SN902", "New York",  "Tokyo",     "13:00", 780, 780,  2700, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Premium Meals"]),
    # Tokyo → Bangkok
    ("SN903", "Tokyo",     "Bangkok",   "09:00", 360, 320,  1050, "Boeing 737 MAX",        ["WiFi","Meals","Entertainment"]),
    # Bangkok → Tokyo (return)
    ("SN904", "Bangkok",   "Tokyo",     "14:00", 360, 320,  1050, "Boeing 737 MAX",        ["WiFi","Meals","Entertainment"]),
    # New York → Bangkok
    ("SN1001","New York",  "Bangkok",   "01:00",1050, 900,  3100, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats","Lounge Access"]),
    # Bangkok → New York (return)
    ("SN1002","Bangkok",   "New York",  "22:00",1050, 900,  3100, "Boeing 787 Dreamliner", ["WiFi","Meals","Entertainment","Bar Service","Lie-flat Seats"]),
]


def generate_flights():
    flights = []
    for (fno, orig, dest, dep_t, dur, eco, biz, aircraft, amenities) in FLIGHTS_KB:
        dep, arr = _dep(dep_t, dur)
        flights.append({
            "flight_no":      fno,
            "origin":         orig,
            "destination":    dest,
            "departure":      dep,
            "arrival":        arr,
            "duration":       _fmt(dur),
            "duration_mins":  dur,
            "price_economy":  eco,
            "price_business": biz,
            "aircraft":       aircraft,
            "amenities":      json.dumps(amenities),
            "seats_economy":  random.randint(100, 180),
            "seats_business": random.randint(20, 48),
        })
    return flights


# ── Hotels — exact KB names and prices ───────────────────────────
HOTELS_KB = {
    "Dubai": [
        ("Burj SkyView Hotel",        5, 550,  4.9, "UAE",   "Ultra-luxury hotel on Sheikh Zayed Road with 42nd-floor infinity pool and stunning city views."),
        ("Atlantis The Palm Royal",   5, 480,  4.8, "UAE",   "Iconic mega-resort on Palm Jumeirah with Aquaventure Waterpark, Lost Chambers, and 30+ restaurants."),
        ("Jumeirah Madinat Hotel",    5, 400,  4.8, "UAE",   "Breathtaking Arabesque architecture on private beach. Canals, wind towers, Burj Al Arab views."),
        ("JBR Beach Boutique Hotel",  4, 220,  4.6, "UAE",   "Casual premium beach vibe at JBR Walk, Dubai Marina. Direct beach access, waterfront lifestyle."),
        ("Rove Downtown Dubai",       3, 95,   4.4, "UAE",   "Hip, design-conscious hotel near Dubai Mall with Burj Khalifa views. Popular with millennials."),
        ("Deira Central Guesthouse",  2, 38,   3.9, "UAE",   "Authentic old Dubai neighbourhood near Gold Souk and Spice Souk. Basic but clean."),
    ],
    "London": [
        ("The Connaught",             5, 750,  4.9, "UK",    "Old Money Mayfair grandeur with Helene Darroze Michelin stars, Aman spa, and legendary butler service."),
        ("The Ned London",            5, 420,  4.7, "UK",    "Restored 1920s bank building turned hotel with 9 restaurants, rooftop pool, and buzzy social scene."),
        ("Claridge's",                5, 680,  4.9, "UK",    "The quintessential London grand hotel since 1812 with Art Deco interiors and Gordon Ramsay dining."),
        ("Shoreditch Creative Hotel", 4, 210,  4.5, "UK",    "Art-forward boutique hotel in London's creative hub. Gallery space, street art tours, rooftop terrace."),
        ("Premier Inn London Heathrow",3,95,   4.2, "UK",    "Reliable hotel at Heathrow Terminal 4. Ideal for transit, soundproofed rooms, free airport shuttle."),
        ("Generator Hostel London",   2, 28,   4.1, "UK",    "Social hostel in Bloomsbury near British Museum. 24h bar, events, international crowd."),
    ],
    "Tokyo": [
        ("The Peninsula Tokyo",       5, 550,  4.9, "Japan", "Flawless luxury in Marunouchi with Imperial Palace views, Peter restaurant, spa, and indoor pool."),
        ("Park Hyatt Tokyo",          5, 500,  4.9, "Japan", "The Lost in Translation hotel — skyline-high luxury in Shinjuku with legendary New York Bar on floor 52."),
        ("Hoshinoya Tokyo",           5, 450,  4.9, "Japan", "Unique ryokan in a 17-storey tower in Otemachi. Rooftop onsen, yukata, tea ceremony, kaiseki dining."),
        ("Shinjuku Granbell Hotel",   4, 180,  4.5, "Japan", "Design-forward hotel in heart of Shinjuku with art-curated rooms and rooftop bar."),
        ("Khaosan Tokyo Origami",     2, 22,   4.3, "Japan", "Funky origami-themed hostel in historic Asakusa, 5-minute walk to Senso-ji Temple."),
    ],
    "Singapore": [
        ("Marina Bay Sands",          5, 450,  4.8, "Singapore","Iconic three-tower hotel with world's most famous infinity pool overlooking the city skyline."),
        ("The Fullerton Hotel Singapore",5,420,4.8,"Singapore","Heritage masterpiece in a grand neoclassical building by Marina Bay. Historic grandeur."),
        ("Capella Singapore",         5, 600,  4.9, "Singapore","Stunning resort on Sentosa Island with colonial and contemporary architecture, private pool villas."),
        ("The Amara Hotel Singapore", 4, 180,  4.5, "Singapore","Contemporary hotel in Tanjong Pagar with stylish rooms and good connectivity to the CBD."),
        ("ibis Budget Singapore",     2, 85,   3.8, "Singapore","Compact budget rooms near Novena MRT with excellent value for money."),
    ],
    "New York": [
        ("The Plaza Hotel",           5, 650,  4.9, "USA",   "NYC's most iconic landmark hotel on Central Park South. Timeless luxury since 1907."),
        ("The NoMad Hotel",           5, 420,  4.8, "USA",   "Sophisticated Beaux-Arts gem near Madison Square Park with excellent Andrew Carmellini dining."),
        ("1 Hotel Brooklyn Bridge",   5, 380,  4.7, "USA",   "Eco-luxury hotel with stunning Brooklyn Bridge views and nature-inspired design."),
        ("Arlo Midtown",              4, 180,  4.5, "USA",   "Smart micro-hotel in Midtown with rooftop bar. Best value in Manhattan."),
        ("Pod 51",                    2, 95,   4.0, "USA",   "Smart budget hotel in Midtown East with compact but well-designed rooms."),
    ],
    "Bangkok": [
        ("Mandarin Oriental Bangkok", 5, 350,  4.9, "Thailand","The grande dame of Bangkok luxury with 140 years of five-star history on the Chao Phraya river."),
        ("Capella Bangkok",           5, 500,  5.0, "Thailand","Ultra-luxury riverside retreat with stunning Chao Phraya views and private pool suites."),
        ("The Peninsula Bangkok",     5, 380,  4.8, "Thailand","Riverside masterpiece with private boat jetty, stunning pool, and legendary service."),
        ("Avani Riverside Bangkok",   4, 160,  4.5, "Thailand","Modern hotel with great river views and excellent connectivity in Thon Buri."),
        ("ibis Bangkok Riverside",    3, 75,   4.0, "Thailand","Great value riverside hotel with free shuttle to the sky train. Budget traveller favourite."),
    ],
    "Paris": [
        ("Hôtel Plaza Athénée",       5, 900,  5.0, "France","Iconic palace hotel on Avenue Montaigne with Eiffel Tower view and Alain Ducasse dining."),
        ("Le Bristol Paris",          5, 800,  4.9, "France","Palace hotel on Rue du Faubourg Saint-Honoré with three Michelin stars and rooftop pool."),
        ("Hôtel Bourg Tibourg",       4, 280,  4.6, "France","Beautifully decorated boutique hotel in the Marais with opulent interiors."),
        ("Hôtel des Arts Montmartre", 3, 120,  4.3, "France","Charming hotel in Montmartre neighbourhood with Sacré-Cœur views and artistic atmosphere."),
        ("ibis Paris Gare du Nord",   2, 90,   3.9, "France","Budget hotel steps from Eurostar terminal, perfect for quick Paris visits."),
    ],
    "Mumbai": [
        ("The Taj Mahal Palace Mumbai",5,380,  4.9, "India", "Iconic heritage hotel overlooking Gateway of India. Opulent rooms, multiple award-winning restaurants."),
        ("The Oberoi Mumbai",         5, 320,  4.8, "India", "Luxury high-rise in Nariman Point with panoramic Arabian Sea views and award-winning cuisine."),
        ("ITC Maratha Mumbai",        5, 280,  4.7, "India", "Grand hotel inspired by Maratha architecture near the airport. Excellent for business travellers."),
        ("Trident Bandra Kurla",      4, 180,  4.5, "India", "Contemporary business hotel in BKC financial district with beautiful outdoor pool."),
        ("ibis Mumbai Airport",       3, 85,   4.1, "India", "Modern budget hotel minutes from Chhatrapati Shivaji International Airport."),
    ],
    "Delhi": [
        ("The Leela Palace New Delhi",5, 350,  4.9, "India", "Palatial hotel inspired by Mughal and Rajput architecture. Butler service, spa, fine dining."),
        ("The Imperial New Delhi",    5, 320,  4.9, "India", "Colonial masterpiece in the heart of Lutyens' Delhi. Heritage suites, art deco architecture."),
        ("Taj Palace New Delhi",      5, 300,  4.8, "India", "Palatial hotel with lush gardens near the diplomatic enclave. Excellent for VIP travellers."),
        ("Lemon Tree Premier Delhi",  3, 110,  4.3, "India", "Cheerful mid-range hotel near Aerocity with great F&B options and airport accessibility."),
    ],
}

HOTEL_AMENITIES_POOL = [
    "Free WiFi", "Pool", "Spa", "Gym", "Restaurant", "Bar",
    "Room Service", "Concierge", "Parking", "Airport Shuttle",
    "Business Centre", "Kids Club", "Rooftop Terrace", "Valet Parking",
]


def generate_hotels():
    hotels = []
    for city, entries in HOTELS_KB.items():
        for name, stars, price, rating, country, desc in entries:
            amenities = random.sample(HOTEL_AMENITIES_POOL, random.randint(4, 8))
            hotels.append({
                "name":            name,
                "city":            city,
                "country":         country,
                "stars":           stars,
                "price_night":     price,
                "rating":          rating,
                "amenities":       json.dumps(amenities),
                "description":     desc,
                "rooms_available": random.randint(5, 40),
            })
    return hotels


# ── Cars — exact KB models and daily rates ────────────────────────
CARS_KB = {
    "Dubai": [
        ("SkyRent UAE",    "Kia Picanto",        "Budget",  25,  4, "Automatic"),
        ("SkyRent UAE",    "Toyota Yaris",       "Budget",  30,  5, "Automatic"),
        ("LuxuryCars Dubai","Hyundai Tucson",    "Standard",55,  5, "Automatic"),
        ("LuxuryCars Dubai","Toyota Camry",      "Standard",58,  5, "Automatic"),
        ("LuxuryCars Dubai","Nissan Patrol 4x4", "Premium", 95,  7, "Automatic"),
        ("LuxuryCars Dubai","BMW X5",            "Premium", 105, 5, "Automatic"),
        ("LuxuryCars Dubai","Mercedes-Benz GLE", "Luxury",  145, 5, "Automatic"),
        ("LuxuryCars Dubai","Porsche Cayenne",   "Luxury",  160, 5, "Automatic"),
    ],
    "London": [
        ("BritDrive",   "Volkswagen Polo",        "Budget",   38, 5, "Manual"),
        ("EcoRide UK",  "Vauxhall Corsa-e",       "Electric", 42, 5, "Automatic"),
        ("BritDrive",   "Volkswagen Golf",        "Standard", 58, 5, "Manual"),
        ("BritDrive",   "Ford Galaxy",            "Standard", 70, 7, "Automatic"),
        ("BritDrive",   "BMW 3 Series",           "Premium",  95, 5, "Automatic"),
        ("BritDrive",   "Range Rover Evoque",     "Premium", 110, 5, "Automatic"),
        ("BritDrive",   "Mercedes-Benz S-Class",  "Luxury",  200, 4, "Automatic"),
        ("BritDrive",   "Range Rover Autobiography","Luxury",220, 4, "Automatic"),
    ],
    "Tokyo": [
        ("SkyRent Japan","Toyota Aqua Hybrid",    "Eco",     48, 5, "Automatic"),
        ("SkyRent Japan","Honda Fit",             "Compact", 52, 5, "Automatic"),
        ("SkyRent Japan","Suzuki Jimny 4x4",      "Standard",55, 4, "Manual"),
        ("SkyRent Japan","Toyota Noah Minivan",   "Standard",75, 7, "Automatic"),
        ("SkyRent Japan","Toyota Crown Hybrid",   "Premium", 95, 5, "Automatic"),
        ("SkyRent Japan","Lexus RX",              "Luxury",  110,5, "Automatic"),
    ],
    "Singapore": [
        ("SkyRent SG",  "Hyundai Avante",         "Budget",   65, 5, "Automatic"),
        ("SkyRent SG",  "Toyota Vios",            "Standard", 68, 5, "Automatic"),
        ("SkyRent SG",  "Toyota Camry",           "Standard", 95, 5, "Automatic"),
        ("SkyRent SG",  "Honda CR-V",             "Premium", 105, 5, "Automatic"),
        ("SkyRent SG",  "BMW X3",                 "Luxury",  155, 5, "Automatic"),
        ("SkyRent SG",  "Mercedes-Benz S-Class",  "Luxury",  280, 4, "Automatic"),
    ],
    "New York": [
        ("SkyRent USA", "Hyundai Elantra",        "Budget",   42, 5, "Automatic"),
        ("SkyRent USA", "Toyota Corolla",         "Budget",   45, 5, "Automatic"),
        ("SkyRent USA", "Chevrolet Equinox",      "Standard", 68, 5, "Automatic"),
        ("SkyRent USA", "Chrysler Pacifica",      "Standard", 75, 7, "Automatic"),
        ("SkyRent USA", "BMW 5 Series",           "Premium", 115, 5, "Automatic"),
        ("SkyRent USA", "Ford Mustang Convertible","Sports",  120, 4, "Automatic"),
    ],
    "Bangkok": [
        ("SkyRent TH",  "Toyota Yaris",           "Budget",   20, 5, "Automatic"),
        ("SkyRent TH",  "Honda Jazz",             "Budget",   22, 5, "Automatic"),
        ("SkyRent TH",  "Honda CR-V",             "Standard", 50, 5, "Automatic"),
        ("SkyRent TH",  "Toyota Fortuner 4x4",    "Standard", 55, 7, "Automatic"),
        ("SkyRent TH",  "Toyota Alphard MPV",     "Premium",  90, 7, "Automatic"),
        ("SkyRent TH",  "BMW 5 Series",           "Luxury",  110, 5, "Automatic"),
    ],
    "Paris": [
        ("EcoRide FR",  "Renault Clio",           "Budget",   30, 5, "Manual"),
        ("EcoRide FR",  "Peugeot 208 Electric",   "Electric", 36, 5, "Automatic"),
        ("SkyRent FR",  "Volkswagen Passat",      "Standard", 60, 5, "Automatic"),
        ("SkyRent FR",  "Citroën SpaceTourer",    "Standard", 72, 7, "Automatic"),
        ("SkyRent FR",  "BMW 5 Series",           "Premium",  98, 5, "Automatic"),
        ("SkyRent FR",  "Volvo XC60",             "Luxury",  105, 5, "Automatic"),
    ],
    "Mumbai": [
        ("SkyRent India","Hyundai i10",           "Budget",   16, 5, "Manual"),
        ("SkyRent India","Maruti Suzuki Swift",   "Budget",   18, 5, "Manual"),
        ("SkyRent India","Honda City",            "Standard", 32, 5, "Automatic"),
        ("SkyRent India","Maruti Ertiga",         "Standard", 38, 7, "Manual"),
        ("SkyRent India","Toyota Innova Crysta",  "Premium",  55, 7, "Automatic"),
        ("SkyRent India","Hyundai Tucson",        "Premium",  60, 5, "Automatic"),
    ],
    "Delhi": [
        ("SkyRent India","Hyundai i10",           "Budget",   16, 5, "Manual"),
        ("SkyRent India","Maruti Suzuki Swift",   "Budget",   18, 5, "Manual"),
        ("SkyRent India","Honda City",            "Standard", 32, 5, "Automatic"),
        ("SkyRent India","Toyota Innova Crysta",  "Premium",  55, 7, "Automatic"),
        ("SkyRent India","Mercedes-Benz E-Class", "Luxury",  110, 5, "Automatic"),
    ],
}

CAR_FEATURES_POOL = [
    "GPS", "Bluetooth", "USB Charging", "Air Conditioning",
    "Child Seat", "Unlimited Mileage", "Full Insurance",
    "Roadside Assistance", "Apple CarPlay", "Reverse Camera",
]


def generate_cars():
    cars = []
    for city, entries in CARS_KB.items():
        for company, model, category, price, seats, trans in entries:
            features = random.sample(CAR_FEATURES_POOL, random.randint(4, 7))
            cars.append({
                "company":         company,
                "city":            city,
                "model":           model,
                "category":        category,
                "price_day":       price,
                "seats":           seats,
                "transmission":    trans,
                "features":        json.dumps(features),
                "units_available": random.randint(3, 10),
            })
    return cars


# ── Seed + Init ───────────────────────────────────────────────────

def seed(conn):
    random.seed(42)
    flights = generate_flights()
    conn.executemany(
        """INSERT INTO flights
           (flight_no,origin,destination,departure,arrival,duration,duration_mins,
            price_economy,price_business,aircraft,amenities,seats_economy,seats_business)
           VALUES (:flight_no,:origin,:destination,:departure,:arrival,:duration,:duration_mins,
                   :price_economy,:price_business,:aircraft,:amenities,:seats_economy,:seats_business)""",
        flights,
    )

    hotels = generate_hotels()
    conn.executemany(
        """INSERT INTO hotels
           (name,city,country,stars,price_night,rating,amenities,description,rooms_available)
           VALUES (:name,:city,:country,:stars,:price_night,:rating,:amenities,:description,:rooms_available)""",
        hotels,
    )

    cars = generate_cars()
    conn.executemany(
        """INSERT INTO cars
           (company,city,model,category,price_day,seats,transmission,features,units_available)
           VALUES (:company,:city,:model,:category,:price_day,:seats,:transmission,:features,:units_available)""",
        cars,
    )

    conn.commit()
    print(f"Seeded {len(flights)} flights, {len(hotels)} hotels, {len(cars)} cars")


def init_db(reset: bool = False):
    if reset and DB_PATH.exists():
        DB_PATH.unlink()
        print("Old database deleted")
    conn = get_connection()
    conn.executescript(SCHEMA)
    conn.commit()
    if conn.execute("SELECT COUNT(*) FROM flights").fetchone()[0] == 0:
        seed(conn)
    else:
        print("Database already seeded — skipping")
    conn.close()


if __name__ == "__main__":
    import sys
    init_db(reset="--reset" in sys.argv)
    conn = get_connection()
    print(f"Flights : {conn.execute('SELECT COUNT(*) FROM flights').fetchone()[0]}")
    print(f"Hotels  : {conn.execute('SELECT COUNT(*) FROM hotels').fetchone()[0]}")
    print(f"Cars    : {conn.execute('SELECT COUNT(*) FROM cars').fetchone()[0]}")
    # Quick check
    print("\nSample Mumbai→Dubai flights:")
    for r in conn.execute("SELECT flight_no,departure,price_economy,price_business FROM flights WHERE origin='Mumbai' AND destination='Dubai'").fetchall():
        print(f"  {r['flight_no']}  dep={r['departure']}  eco=${r['price_economy']}  biz=${r['price_business']}")
    conn.close()
