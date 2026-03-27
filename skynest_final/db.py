"""
database/db.py
SkyNest SQLite database — schema, connection helper, and seed data.
Run directly to (re)create and seed the database:
    python -m database.db
"""

import sqlite3
import json
import random
import string
from pathlib import Path
from datetime import datetime, timedelta

DB_PATH = Path(__file__).parent / "skynest.db"


# ─────────────────────────────────────────────────────────────────
# CONNECTION HELPER
# ─────────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row          # rows behave like dicts
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ─────────────────────────────────────────────────────────────────
# SCHEMA
# ─────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS flights (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_no               TEXT NOT NULL,
    origin                  TEXT NOT NULL,
    destination             TEXT NOT NULL,
    departure               TEXT NOT NULL,   -- ISO datetime string
    arrival                 TEXT NOT NULL,
    duration                TEXT NOT NULL,   -- e.g. "8h 30m"
    duration_mins           INTEGER NOT NULL,
    price_economy           REAL NOT NULL,
    price_business          REAL NOT NULL,
    airline                 TEXT NOT NULL DEFAULT 'SkyNest',
    aircraft                TEXT NOT NULL,
    amenities               TEXT NOT NULL DEFAULT '[]',  -- JSON list
    seats_economy           INTEGER NOT NULL DEFAULT 150,
    seats_business          INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS hotels (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT NOT NULL,
    city                    TEXT NOT NULL,
    country                 TEXT NOT NULL,
    stars                   INTEGER NOT NULL,
    price_night             REAL NOT NULL,
    rating                  REAL NOT NULL,
    amenities               TEXT NOT NULL DEFAULT '[]',
    description             TEXT NOT NULL DEFAULT '',
    rooms_available         INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE IF NOT EXISTS cars (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    company                 TEXT NOT NULL,
    city                    TEXT NOT NULL,
    model                   TEXT NOT NULL,
    category                TEXT NOT NULL,
    price_day               REAL NOT NULL,
    seats                   INTEGER NOT NULL,
    transmission            TEXT NOT NULL DEFAULT 'Automatic',
    features                TEXT NOT NULL DEFAULT '[]',
    units_available         INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS bookings (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref             TEXT UNIQUE NOT NULL,
    name                    TEXT NOT NULL,
    email                   TEXT NOT NULL,
    flight_id               INTEGER REFERENCES flights(id),
    hotel_id                INTEGER REFERENCES hotels(id),
    car_id                  INTEGER REFERENCES cars(id),
    check_in                TEXT NOT NULL,
    check_out               TEXT NOT NULL,
    nights                  INTEGER NOT NULL,
    passengers              INTEGER NOT NULL DEFAULT 1,
    seat_class              TEXT NOT NULL DEFAULT 'Economy',
    total_price             REAL NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'CONFIRMED',
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def create_schema(conn: sqlite3.Connection):
    conn.executescript(SCHEMA)
    conn.commit()


# ─────────────────────────────────────────────────────────────────
# SEED DATA
# ─────────────────────────────────────────────────────────────────

AIRCRAFT_TYPES = [
    "Boeing 787 Dreamliner",
    "Airbus A350-900",
    "Boeing 777-300ER",
    "Airbus A380",
    "Boeing 737 MAX 9",
    "Airbus A321neo",
    "Boeing 767-400",
    "Airbus A330-900neo",
]

ALL_AMENITIES = ["WiFi", "Meals", "Entertainment", "USB Charging",
                  "Extra Legroom", "Power Outlet", "Premium Meals",
                  "Lie-flat Seats", "Bar Service", "Lounge Access"]

HOTEL_AMENITIES_POOL = [
    "Free WiFi", "Pool", "Spa", "Gym", "Restaurant", "Bar",
    "Room Service", "Concierge", "Parking", "Airport Shuttle",
    "Business Centre", "Kids Club", "Rooftop Terrace", "Valet Parking",
]

CAR_FEATURES_POOL = [
    "GPS", "Bluetooth", "USB Charging", "Air Conditioning",
    "Child Seat", "Unlimited Mileage", "Full Insurance",
    "Roadside Assistance", "Apple CarPlay", "Reverse Camera",
]

CITY_COUNTRY = {
    "Mumbai":      "India",
    "Delhi":       "India",
    "Bangalore":   "India",
    "Chennai":     "India",
    "Hyderabad":   "India",
    "Kolkata":     "India",
    "New York":    "USA",
    "Los Angeles": "USA",
    "Chicago":     "USA",
    "London":      "UK",
    "Paris":       "France",
    "Frankfurt":   "Germany",
    "Amsterdam":   "Netherlands",
    "Dubai":       "UAE",
    "Singapore":   "Singapore",
    "Tokyo":       "Japan",
    "Sydney":      "Australia",
    "Bangkok":     "Thailand",
    "Cape Town":   "South Africa",
    "Toronto":     "Canada",
    "Vancouver":   "Canada",
}

# (origin, destination, duration_mins, economy_base, business_multiplier)
ROUTES = [
    # Indian domestic
    ("Mumbai",    "Delhi",        110,  90,  3.5),
    ("Delhi",     "Mumbai",       110,  90,  3.5),
    ("Mumbai",    "Bangalore",     95,  80,  3.2),
    ("Bangalore", "Mumbai",        95,  80,  3.2),
    ("Delhi",     "Bangalore",    155, 100,  3.2),
    ("Mumbai",    "Chennai",      105,  85,  3.2),
    ("Mumbai",    "Hyderabad",     85,  75,  3.0),
    ("Delhi",     "Kolkata",      140,  95,  3.0),
    ("Bangalore", "Chennai",       60,  65,  2.8),
    ("Mumbai",    "Kolkata",      175, 110,  3.2),
    # India → Middle East / SE Asia
    ("Mumbai",    "Dubai",        210, 280,  3.8),
    ("Delhi",     "Dubai",        225, 290,  3.8),
    ("Dubai",     "Mumbai",       210, 280,  3.8),
    ("Mumbai",    "Singapore",    390, 420,  3.5),
    ("Delhi",     "Singapore",    400, 430,  3.5),
    ("Singapore", "Mumbai",       390, 420,  3.5),
    ("Mumbai",    "Bangkok",      320, 350,  3.4),
    ("Bangkok",   "Mumbai",       320, 350,  3.4),
    # India → Europe
    ("Mumbai",    "London",       555, 580,  4.2),
    ("Delhi",     "London",       510, 550,  4.2),
    ("London",    "Mumbai",       555, 580,  4.2),
    ("Mumbai",    "Paris",        540, 560,  4.0),
    ("Delhi",     "Frankfurt",    490, 530,  4.0),
    ("Mumbai",    "Amsterdam",    530, 545,  4.0),
    # India → USA
    ("Mumbai",    "New York",     975, 820,  4.5),
    ("Delhi",     "New York",     900, 800,  4.5),
    ("Mumbai",    "Los Angeles",  990, 840,  4.5),
    ("Mumbai",    "Chicago",      940, 810,  4.5),
    ("New York",  "Mumbai",       975, 820,  4.5),
    # India → Australia/Africa
    ("Mumbai",    "Sydney",       690, 680,  4.3),
    ("Mumbai",    "Cape Town",    570, 620,  4.3),
    ("Cape Town", "Mumbai",       570, 620,  4.3),
    # India → Canada
    ("Toronto",   "Mumbai",       855, 790,  4.4),
    ("Vancouver", "Delhi",        870, 800,  4.4),
    # Europe / Middle East hub
    ("London",    "New York",     420, 520,  4.2),
    ("New York",  "London",       420, 520,  4.2),
    ("London",    "Dubai",        415, 480,  4.0),
    ("Dubai",     "Singapore",    440, 380,  3.8),
    ("Dubai",     "London",       415, 480,  4.0),
    ("Paris",     "Tokyo",        735, 650,  4.2),
    ("Tokyo",     "Paris",        735, 650,  4.2),
    ("Frankfurt", "Singapore",    730, 620,  4.1),
    ("Amsterdam", "Cape Town",    665, 590,  4.2),
    ("London",    "Sydney",       1260, 900, 4.5),
    ("London",    "Bangkok",      680, 580,  4.1),
    ("Bangkok",   "Tokyo",        295, 320,  3.8),
    ("Singapore", "Tokyo",        385, 360,  3.8),
    ("Tokyo",     "Sydney",       555, 520,  4.1),
    ("Toronto",   "London",       420, 500,  4.1),
    ("Vancouver", "Tokyo",        555, 530,  4.2),
    ("Los Angeles","Tokyo",       640, 600,  4.2),
    ("New York",  "Paris",        425, 510,  4.1),
    ("Chicago",   "Frankfurt",    490, 530,  4.1),
]

def _fmt_duration(mins: int) -> str:
    return f"{mins // 60}h {mins % 60}m"

def _add_minutes(base: str, mins: int) -> str:
    dt = datetime.fromisoformat(base)
    return (dt + timedelta(minutes=mins)).isoformat(timespec="minutes")

BASE_DATES = [
    "2026-04-01T06:00", "2026-04-01T09:30", "2026-04-01T13:00",
    "2026-04-01T17:30", "2026-04-01T22:00",
    "2026-04-15T07:00", "2026-04-15T11:45", "2026-04-15T16:00",
    "2026-04-15T20:30", "2026-05-01T08:00", "2026-05-01T14:00",
    "2026-05-01T19:00", "2026-05-15T06:30", "2026-05-15T12:00",
    "2026-06-01T10:00", "2026-06-15T08:00",
]

def _flight_no(origin: str, idx: int) -> str:
    code = "".join(w[0] for w in origin.split())[:2].upper()
    return f"SN{code}{idx:03d}"

def generate_flights() -> list[dict]:
    flights = []
    idx = 100
    for (orig, dest, dur, eco_base, biz_mult) in ROUTES:
        # 2-4 departure times per route
        n_times = random.randint(2, 4)
        chosen = random.sample(BASE_DATES, min(n_times, len(BASE_DATES)))
        for dep in chosen:
            eco  = round(eco_base * random.uniform(0.9, 1.15), 2)
            biz  = round(eco * biz_mult, 2)
            amenities = random.sample(ALL_AMENITIES, random.randint(3, 6))
            flights.append({
                "flight_no":       _flight_no(orig, idx),
                "origin":          orig,
                "destination":     dest,
                "departure":       dep,
                "arrival":         _add_minutes(dep, dur + random.randint(-5, 20)),
                "duration":        _fmt_duration(dur),
                "duration_mins":   dur,
                "price_economy":   eco,
                "price_business":  biz,
                "aircraft":        random.choice(AIRCRAFT_TYPES),
                "amenities":       json.dumps(amenities),
                "seats_economy":   random.randint(80, 180),
                "seats_business":  random.randint(20, 48),
            })
            idx += 1
    return flights


# ── Hotels ──────────────────────────────────────────────────────

HOTELS_RAW = {
    "Mumbai": [
        ("The Taj Mahal Palace",     5, 380, 4.9, "Iconic heritage hotel overlooking the Gateway of India, with opulent rooms and world-class dining."),
        ("The Oberoi Mumbai",        5, 320, 4.8, "Luxury high-rise hotel in Nariman Point with panoramic sea views and award-winning restaurants."),
        ("Trident Bandra Kurla",     4, 220, 4.6, "Contemporary business hotel in the financial district with a beautiful outdoor pool."),
        ("ITC Grand Central",        4, 195, 4.5, "Sophisticated hotel with eco-friendly design and multiple dining options in Parel."),
        ("Ibis Mumbai Airport",      3, 110, 4.1, "Modern budget hotel minutes from Chhatrapati Shivaji International Airport."),
        ("The St. Regis Mumbai",     5, 410, 4.9, "Ultra-luxury hotel in Lower Parel with a rooftop pool and butler service."),
    ],
    "Delhi": [
        ("The Imperial New Delhi",   5, 360, 4.9, "A colonial masterpiece in the heart of Lutyens' Delhi with heritage suites."),
        ("Taj Palace New Delhi",     5, 340, 4.8, "Palatial hotel with lush gardens, near the diplomatic enclave."),
        ("The Leela Ambience Gurugram", 5, 300, 4.7, "Grand luxury hotel in Gurugram with a massive spa and conference facilities."),
        ("Hyatt Regency Delhi",      5, 280, 4.6, "Well-located 5-star in Bhikaji Cama Place with a rooftop pool."),
        ("Lemon Tree Premier",       3, 120, 4.3, "Cheerful mid-range hotel with great F&B options near Aerocity."),
        ("Radisson Blu Plaza",       4, 210, 4.5, "Contemporary hotel with a stunning lobby atrium in Mahipalpur."),
    ],
    "Bangalore": [
        ("The Leela Palace Bengaluru", 5, 350, 4.8, "Ultra-luxury property inspired by Mysore Palace architecture."),
        ("ITC Gardenia",             5, 310, 4.8, "India's largest LEED Platinum certified luxury hotel in CBD."),
        ("Taj MG Road",              5, 290, 4.7, "Elegant hotel on MG Road combining heritage and modernity."),
        ("Sheraton Grand Bengaluru", 4, 220, 4.6, "Spacious rooms and excellent event facilities in Whitefield."),
        ("Lemon Tree Hotel",         3, 105, 4.2, "Smart budget option near Electronic City with good connectivity."),
        ("The Ritz-Carlton Bengaluru", 5, 380, 4.9, "Redefining luxury with butler service and sky dining experiences."),
    ],
    "London": [
        ("The Savoy",                5, 620, 4.9, "London's most iconic luxury hotel on the Strand, with art deco rooms."),
        ("Claridge's",               5, 590, 4.9, "Mayfair's finest art deco masterpiece, the quintessential London luxury."),
        ("The Ned",                  4, 380, 4.7, "A stunning 1920s bank building transformed into 252 rooms and 9 restaurants."),
        ("Premier Inn London City",  3, 185, 4.2, "Reliable mid-range hotel in the heart of the City of London."),
        ("CitizenM Tower of London", 3, 165, 4.3, "Smart micro-hotel with mood-pad controlled rooms near the Tower of London."),
        ("The Connaught",            5, 680, 5.0, "Mayfair's most beloved hotel, with Michelin-starred dining and legendary service."),
    ],
    "Paris": [
        ("Hotel Ritz Paris",         5, 950, 5.0, "The original grande dame of Paris luxury, with legendary Coco Chanel suite."),
        ("Le Bristol Paris",         5, 820, 4.9, "Palace hotel on Rue du Faubourg Saint-Honoré, home to three Michelin stars."),
        ("Hotel Lutetia",            5, 680, 4.8, "Iconic Left Bank palace hotel with stunning Art Deco interiors."),
        ("Hotel des Grands Boulevards", 4, 290, 4.6, "Beautifully designed boutique hotel on the historic grands boulevards."),
        ("ibis Paris Gare du Nord",  2, 120, 3.9, "Budget-friendly hotel steps from the Eurostar terminal."),
        ("Four Seasons George V",    5, 1100, 5.0, "One of the world's finest hotels, with floral art installations and 3 Michelin stars."),
    ],
    "Dubai": [
        ("Burj Al Arab Jumeirah",    5, 1800, 5.0, "The world's most iconic hotel — a sail-shaped marvel on its own island."),
        ("Atlantis The Palm",        5, 680, 4.8, "Legendary resort on the Palm with waterpark access and world-class dining."),
        ("Four Seasons Resort Dubai", 5, 750, 4.9, "Beachfront luxury on Jumeirah Beach with a private beach and infinity pool."),
        ("Address Dubai Marina",     5, 520, 4.7, "Sleek skyscraper hotel in Dubai Marina with panoramic Gulf views."),
        ("Premier Inn Dubai Airport", 3, 155, 4.1, "Great value hotel minutes from DXB with complimentary transfers."),
        ("Sofitel Dubai The Palm",   5, 490, 4.7, "French-inspired luxury resort on the Palm Jumeirah with a private beach."),
    ],
    "Singapore": [
        ("Marina Bay Sands",         5, 650, 4.8, "The iconic three-tower hotel with the world's most famous infinity pool."),
        ("Raffles Singapore",        5, 720, 4.9, "The legendary white colonial hotel, birthplace of the Singapore Sling."),
        ("The Fullerton Hotel",      5, 560, 4.8, "A heritage masterpiece in a grand neoclassical building by the bay."),
        ("Andaz Singapore",          5, 420, 4.7, "Modern luxury in the heart of Bugis with stunning city views."),
        ("ibis Budget Singapore",    2, 110, 3.8, "Compact budget rooms near Novena MRT with excellent value."),
        ("Capella Singapore",        5, 810, 4.9, "Stunning resort on Sentosa Island with colonial and contemporary architecture."),
    ],
    "Tokyo": [
        ("The Peninsula Tokyo",      5, 680, 4.9, "Flawless luxury in Marunouchi with unrivalled views of the Imperial Palace."),
        ("Park Hyatt Tokyo",         5, 620, 4.9, "The Lost in Translation hotel — skyline-high luxury in Shinjuku."),
        ("The Ritz-Carlton Tokyo",   5, 700, 4.9, "Cloud-touching luxury on the top floors of the Midtown Tower."),
        ("Hotel Gajoen Tokyo",       4, 380, 4.7, "A museum-like boutique hotel filled with Japanese art and history."),
        ("Dormy Inn Akihabara",      3, 135, 4.3, "Excellent value Japanese business hotel with natural hot spring baths."),
        ("Aman Tokyo",               5, 880, 5.0, "Minimalist sanctuary in the Otemachi Tower with Mt Fuji views."),
    ],
    "Sydney": [
        ("Park Hyatt Sydney",        5, 620, 4.9, "Steps from the Opera House with unmatched views of the Sydney Harbour."),
        ("Intercontinental Sydney",  5, 540, 4.8, "Grand heritage building in the CBD with rooftop bar and harbour views."),
        ("The Fullerton Hotel Sydney", 5, 480, 4.7, "A beautifully restored heritage building in the heart of the CBD."),
        ("Meriton Suites Sydney",    4, 280, 4.5, "Spacious serviced apartments with kitchenettes, perfect for families."),
        ("ibis Sydney Airport",      3, 145, 4.0, "Convenient airport hotel with free shuttle and soundproofed rooms."),
        ("Sofitel Sydney Darling Harbour", 5, 510, 4.7, "Elegant French luxury meets Sydney harbour views."),
    ],
    "Bangkok": [
        ("Mandarin Oriental Bangkok", 5, 560, 4.9, "The grande dame of Bangkok luxury, with 140 years of five-star history."),
        ("Capella Bangkok",          5, 680, 5.0, "Ultra-luxury riverside retreat with stunning Chao Phraya views."),
        ("The Peninsula Bangkok",    5, 520, 4.8, "Riverside masterpiece with private boat jetty and stunning pool."),
        ("Centara Grand at Zen",     4, 260, 4.5, "Award-winning hotel above CentralWorld mall in the shopping district."),
        ("ibis Bangkok Riverside",   3, 110, 4.0, "Great value riverside hotel with free shuttle to the sky train."),
        ("Anantara Siam Bangkok",    5, 490, 4.7, "Regal Thai-inspired luxury in the heart of Ratchaprasong."),
    ],
    "New York": [
        ("The Plaza Hotel",          5, 850, 4.9, "NYC's most iconic landmark hotel on Central Park South."),
        ("Four Seasons New York",    5, 780, 4.9, "Classic Midtown luxury with the city's highest rooms and butler service."),
        ("The Standard High Line",   4, 420, 4.7, "Trendy hotel straddling the High Line with panoramic Hudson River views."),
        ("The NoMad Hotel",          4, 380, 4.6, "Sophisticated Beaux-Arts gem near Madison Square Park."),
        ("Pod 51",                   2, 145, 4.0, "Smart micro-hotel in Midtown East — great value in an expensive city."),
        ("Aman New York",            5, 1100, 5.0, "Jaw-dropping crown jewel on Fifth Avenue inside the Crown Building."),
    ],
    "Los Angeles": [
        ("Shutters on the Beach",    5, 620, 4.9, "The only beachfront luxury hotel in LA, steps from the Santa Monica waves."),
        ("Hotel Bel-Air",            5, 780, 4.9, "Hidden in a wooded canyon, the most romantic hotel in Los Angeles."),
        ("The Ritz-Carlton Marina del Rey", 5, 540, 4.7, "Waterfront resort with yacht marina views and rooftop pool."),
        ("The Line Hotel LA",        4, 280, 4.5, "Hipster-cool hotel in Koreatown with a rooftop pool and great dining."),
        ("Freehand Los Angeles",     3, 165, 4.2, "Stylish hostel-meets-boutique-hotel in a 1920s building in Koreatown."),
        ("Chateau Marmont",          5, 520, 4.8, "Legendary rock'n'roll Gothic castle hideaway on Sunset Strip."),
    ],
    "Chicago": [
        ("The Langham Chicago",      5, 540, 4.9, "Stunning waterfront luxury in the historic IBM Building."),
        ("Four Seasons Chicago",     5, 580, 4.8, "Classic luxury in the Magnificent Mile with breathtaking lake views."),
        ("Soho House Chicago",       4, 320, 4.6, "Members' club hotel in the West Loop warehouse district."),
        ("Virgin Hotels Chicago",    4, 265, 4.5, "Playfully designed hotel in the historic Old Dearborn Bank Building."),
        ("HI Chicago Hostel",        2, 65,  3.9, "Award-winning budget hostel in a prime Loop location."),
        ("Ace Hotel Chicago",        4, 295, 4.6, "Stylish boutique hotel in Logan Square with excellent bar scene."),
    ],
    "Frankfurt": [
        ("Steigenberger Frankfurter Hof", 5, 390, 4.8, "Frankfurt's grand dame luxury hotel since 1876, near the banking district."),
        ("The Westin Grand Frankfurt", 5, 340, 4.7, "Sophisticated high-rise in the city centre with an excellent health club."),
        ("Hilton Frankfurt City Centre", 4, 250, 4.5, "Contemporary hotel with excellent rail and metro connections."),
        ("Motel One Frankfurt Airport", 3, 130, 4.2, "Smart budget hotel with direct Airport terminal access."),
        ("Villa Kennedy",            5, 420, 4.8, "Elegant villa-style luxury hotel in the Sachsenhausen quarter."),
    ],
    "Amsterdam": [
        ("Hotel V Nesplein",         4, 280, 4.7, "Boutique design hotel in a 17th-century canal house near the Rembrandt House."),
        ("Pulitzer Amsterdam",       5, 480, 4.8, "25 restored canal houses joined to create a uniquely Dutch luxury hotel."),
        ("The Dylan Amsterdam",      5, 520, 4.9, "Award-winning boutique hotel in a former 17th-century theatre."),
        ("INK Hotel Amsterdam",      4, 260, 4.5, "A former newspaper building reimagined as a creative design hotel."),
        ("Stayokay Amsterdam Vondelpark", 2, 75, 4.1, "Classic hostel in a beautiful heritage building beside Vondelpark."),
    ],
    "Cape Town": [
        ("One&Only Cape Town",       5, 580, 4.9, "Spectacular marina-side luxury resort at the foot of Table Mountain."),
        ("Cape Grace Hotel",         5, 520, 4.8, "Elegant waterfront hotel on a private quay in the V&A Waterfront."),
        ("Belmond Mount Nelson Hotel", 5, 490, 4.8, "Cape Town's beloved 'Pink Lady' with legendary afternoon tea."),
        ("The Silo Hotel",           5, 680, 5.0, "Architectural marvel in a repurposed grain silo with extraordinary art."),
        ("The Backpack Hostel",      2, 60,  4.3, "Award-winning eco-hostel in De Waterkant with a lovely garden pool."),
    ],
    "Toronto": [
        ("The St. Regis Toronto",    5, 520, 4.8, "Stunning tower in the financial district with butler service."),
        ("Four Seasons Toronto",     5, 560, 4.9, "Flagship luxury in Yorkville with an award-winning spa."),
        ("Hotel X Toronto",          4, 320, 4.6, "Lakefront resort-style hotel with a rooftop pool and tennis courts."),
        ("The Drake Hotel",          3, 195, 4.4, "Legendary boutique hotel and creative hub in West Queen West."),
        ("Holiday Inn Toronto Downtown", 3, 150, 4.0, "Reliable mid-range hotel close to Union Station and the CN Tower."),
    ],
    "Vancouver": [
        ("Fairmont Pacific Rim",     5, 560, 4.9, "Ultra-modern luxury with a rooftop pool and stunning harbour views."),
        ("Rosewood Hotel Georgia",   5, 520, 4.8, "Elegantly restored 1927 heritage hotel in the heart of downtown."),
        ("JW Marriott Parq Vancouver", 5, 440, 4.7, "Contemporary luxury in a stunning cascading tower in downtown."),
        ("The Burrard",              3, 185, 4.4, "Stylishly renovated mid-century motel in the West End."),
        ("Samesun Vancouver",        2, 65,  4.2, "Fun social hostel perfectly located on Granville Street."),
    ],
    "Chennai": [
        ("ITC Grand Chola",          5, 320, 4.8, "India's largest LEED Platinum luxury hotel inspired by Chola temples."),
        ("The Leela Palace Chennai", 5, 290, 4.7, "Palatial beachfront hotel on the Bay of Bengal."),
        ("Taj Coromandel Chennai",   5, 270, 4.7, "An enduring icon of luxury in the heart of Nungambakkam."),
        ("Hyatt Regency Chennai",    4, 200, 4.5, "Modern hotel in Anna Salai with a spectacular rooftop pool."),
        ("ibis Chennai City Centre", 3, 95,  4.1, "Smart budget hotel with excellent connectivity to the metro."),
    ],
    "Hyderabad": [
        ("The Park Hyderabad",       4, 180, 4.5, "Stylish design hotel near Banjara Hills with a vibrant nightlife scene."),
        ("Taj Falaknuma Palace",     5, 480, 5.0, "A 19th-century palace hotel offering a royal Nizam experience."),
        ("ITC Kohenur",              5, 350, 4.8, "Lakeside luxury resort with a stunning infinity pool in HITEC City."),
        ("Novotel Hyderabad Airport", 4, 175, 4.4, "Convenient hotel directly connected to Rajiv Gandhi International Airport."),
        ("ibis Hyderabad HITEC City", 3, 90, 4.0, "Budget-smart hotel in the tech hub with modern amenities."),
    ],
    "Kolkata": [
        ("The Oberoi Grand",         5, 280, 4.8, "The legendary grand hotel on Jawaharlal Nehru Road since 1841."),
        ("ITC Royal Bengal",         5, 310, 4.7, "The tallest hotel in South Asia with a stunning sky bar."),
        ("Taj Bengal",               5, 260, 4.7, "Luxury hotel with beautiful gardens in the Southern Avenue area."),
        ("The Lalit Great Eastern",  5, 230, 4.6, "Kolkata's oldest hotel, beautifully restored to its colonial glory."),
        ("ibis Kolkata Rajarhat",    3, 90,  4.0, "Smart modern hotel near the new Kolkata business district."),
    ],
}


def generate_hotels() -> list[dict]:
    hotels = []
    for city, entries in HOTELS_RAW.items():
        country = CITY_COUNTRY.get(city, "Unknown")
        for name, stars, price, rating, desc in entries:
            amenities = random.sample(HOTEL_AMENITIES_POOL, random.randint(4, 8))
            hotels.append({
                "name":            name,
                "city":            city,
                "country":         country,
                "stars":           stars,
                "price_night":     round(price * random.uniform(0.9, 1.1), 2),
                "rating":          rating,
                "amenities":       json.dumps(amenities),
                "description":     desc,
                "rooms_available": random.randint(5, 40),
            })
    return hotels


# ── Cars ────────────────────────────────────────────────────────

CAR_INVENTORY = [
    # (company, model, category, price_day, seats, transmission)
    ("SkyNest Rentals", "Toyota Camry",           "Sedan",   65,  5, "Automatic"),
    ("SkyNest Rentals", "Hyundai Tucson",          "SUV",     85,  5, "Automatic"),
    ("SkyNest Rentals", "Ford Mustang",            "Sports",  120, 4, "Automatic"),
    ("SkyNest Rentals", "BMW 5 Series",            "Luxury",  150, 5, "Automatic"),
    ("SkyNest Rentals", "Toyota Prius",            "Eco",     55,  5, "Automatic"),
    ("SkyNest Rentals", "Mercedes C-Class",        "Luxury",  140, 5, "Automatic"),
    ("SkyNest Rentals", "Ford Explorer",           "SUV",     95,  7, "Automatic"),
    ("SkyNest Rentals", "Range Rover Sport",       "Luxury",  195, 5, "Automatic"),
    ("SkyNest Rentals", "Kia Sportage",            "SUV",     75,  5, "Automatic"),
    ("SkyNest Rentals", "Tesla Model 3",           "Eco",     110, 5, "Automatic"),
    ("SkyNest Rentals", "Nissan Altima",           "Sedan",   60,  5, "Automatic"),
    ("SkyNest Rentals", "Chevrolet Tahoe",         "SUV",     105, 8, "Automatic"),
    ("SkyNest Rentals", "Porsche Cayenne",         "Luxury",  220, 5, "Automatic"),
    ("SkyNest Rentals", "Toyota RAV4 Hybrid",      "Eco",     80,  5, "Automatic"),
    ("SkyNest Rentals", "Honda CR-V",              "SUV",     78,  5, "Automatic"),
    ("SkyNest Rentals", "Volkswagen Golf",         "Compact", 50,  5, "Manual"),
    ("SkyNest Rentals", "Mini Cooper",             "Compact", 58,  4, "Manual"),
    ("SkyNest Rentals", "Audi A6",                 "Luxury",  165, 5, "Automatic"),
    ("SkyNest Rentals", "Jeep Wrangler",           "SUV",     115, 4, "Manual"),
    ("SkyNest Rentals", "Volvo XC90",              "SUV",     130, 7, "Automatic"),
]

def generate_cars() -> list[dict]:
    cars = []
    cities = list(CITY_COUNTRY.keys())
    for city in cities:
        # 4-6 cars per city
        chosen_cars = random.sample(CAR_INVENTORY, random.randint(4, 6))
        for company, model, category, price, seats, trans in chosen_cars:
            features = random.sample(CAR_FEATURES_POOL, random.randint(4, 7))
            cars.append({
                "company":         company,
                "city":            city,
                "model":           model,
                "category":        category,
                "price_day":       round(price * random.uniform(0.88, 1.12), 2),
                "seats":           seats,
                "transmission":    trans,
                "features":        json.dumps(features),
                "units_available": random.randint(2, 8),
            })
    return cars


# ─────────────────────────────────────────────────────────────────
# SEED + INIT
# ─────────────────────────────────────────────────────────────────

def seed(conn: sqlite3.Connection):
    random.seed(42)   # reproducible data

    # Flights
    flights = generate_flights()
    conn.executemany(
        """INSERT INTO flights
           (flight_no,origin,destination,departure,arrival,duration,duration_mins,
            price_economy,price_business,aircraft,amenities,seats_economy,seats_business)
           VALUES (:flight_no,:origin,:destination,:departure,:arrival,:duration,:duration_mins,
                   :price_economy,:price_business,:aircraft,:amenities,:seats_economy,:seats_business)""",
        flights,
    )

    # Hotels
    hotels = generate_hotels()
    conn.executemany(
        """INSERT INTO hotels (name,city,country,stars,price_night,rating,amenities,description,rooms_available)
           VALUES (:name,:city,:country,:stars,:price_night,:rating,:amenities,:description,:rooms_available)""",
        hotels,
    )

    # Cars
    cars = generate_cars()
    conn.executemany(
        """INSERT INTO cars (company,city,model,category,price_day,seats,transmission,features,units_available)
           VALUES (:company,:city,:model,:category,:price_day,:seats,:transmission,:features,:units_available)""",
        cars,
    )

    conn.commit()
    print(f"✅ Seeded {len(flights)} flights, {len(hotels)} hotels, {len(cars)} cars")


def init_db(reset: bool = False):
    if reset and DB_PATH.exists():
        DB_PATH.unlink()
    conn = get_connection()
    create_schema(conn)
    # Only seed if tables are empty
    if conn.execute("SELECT COUNT(*) FROM flights").fetchone()[0] == 0:
        seed(conn)
    else:
        print("ℹ️  Database already seeded — skipping seed step")
    conn.close()


if __name__ == "__main__":
    import sys
    reset = "--reset" in sys.argv
    init_db(reset=reset)
    conn = get_connection()
    print(f"Flights: {conn.execute('SELECT COUNT(*) FROM flights').fetchone()[0]}")
    print(f"Hotels:  {conn.execute('SELECT COUNT(*) FROM hotels').fetchone()[0]}")
    print(f"Cars:    {conn.execute('SELECT COUNT(*) FROM cars').fetchone()[0]}")
    conn.close()
