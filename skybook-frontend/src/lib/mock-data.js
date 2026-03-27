export const popularDestinations = [
  {
    id: "paris",
    city: "Paris",
    country: "France",
    startingPrice: 349,
    tagline: "Romantic boulevards and easy museum days",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.45)), linear-gradient(135deg, #f9c74f, #f9844a 55%, #577590)",
  },
  {
    id: "tokyo",
    city: "Tokyo",
    country: "Japan",
    startingPrice: 589,
    tagline: "Fast trains, bright nights, and food markets",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.45)), linear-gradient(135deg, #00c6ff, #0072ff 55%, #2d1e64)",
  },
  {
    id: "dubai",
    city: "Dubai",
    country: "UAE",
    startingPrice: 279,
    tagline: "Luxury stays with short-city-break convenience",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.45)), linear-gradient(135deg, #ffd166, #f8961e 60%, #577590)",
  },
  {
    id: "bali",
    city: "Bali",
    country: "Indonesia",
    startingPrice: 429,
    tagline: "Relaxed beach days, surf, and lush resorts",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.45)), linear-gradient(135deg, #43aa8b, #4d908e 50%, #277da1)",
  },
];

export const bundleDeals = [
  {
    id: "italy-train",
    slug: "city-lights-london",
    title: "7 Days in Italy",
    description: "Rome, Florence, and Venice with a train-first route.",
    price: 1299,
    badge: "Trending",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "London, United Kingdom (LHR)",
      departure: buildFutureDateValue(14),
      returnDate: buildFutureDateValue(20),
      passengers: "2 Adults",
    },
  },
  {
    id: "europe-long-weekend",
    slug: "weekend-dubai-escape",
    title: "European Long Weekend",
    description: "Flight + hotel bundles built for quick city breaks.",
    price: 699,
    badge: "Weekend pick",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Dubai, United Arab Emirates (DXB)",
      departure: buildFutureDateValue(10),
      returnDate: buildFutureDateValue(14),
      passengers: "2 Adults",
    },
  },
  {
    id: "beach-reset",
    slug: "bangkok-beach-reset",
    title: "Beach Reset",
    description: "Bali and Phuket packages with flexible return dates.",
    price: 1199,
    badge: "Popular",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Bangkok, Thailand (BKK)",
      departure: buildFutureDateValue(18),
      returnDate: buildFutureDateValue(24),
      passengers: "2 Adults",
    },
  },
  {
    id: "tokyo-skyline",
    slug: "tokyo-skyline-escape",
    title: "Tokyo Skyline Escape",
    description: "Flights, hotel, and city car setup for a modern Tokyo break.",
    price: 1499,
    badge: "Top rated",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Tokyo, Japan (HND)",
      departure: buildFutureDateValue(22),
      returnDate: buildFutureDateValue(28),
      passengers: "2 Adults",
    },
  },
  {
    id: "paris-romance",
    slug: "paris-romance-week",
    title: "Paris Romance Week",
    description: "A classic Paris bundle with flights, stay, and local car option.",
    price: 1399,
    badge: "Popular",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Paris, France (CDG)",
      departure: buildFutureDateValue(16),
      returnDate: buildFutureDateValue(22),
      passengers: "2 Adults",
    },
  },
  {
    id: "singapore-city",
    slug: "singapore-city-break",
    title: "Singapore City Break",
    description: "Short premium city bundle with flight, hotel, and transfer-ready car.",
    price: 999,
    badge: "Weekend pick",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Singapore, Singapore (SIN)",
      departure: buildFutureDateValue(12),
      returnDate: buildFutureDateValue(16),
      passengers: "2 Adults",
    },
  },
  {
    id: "london-classic",
    slug: "london-classic-getaway",
    title: "London Classic Getaway",
    description: "A ready-made London package with return flights, hotel, and car.",
    price: 1349,
    badge: "Trending",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "London, United Kingdom (LHR)",
      departure: buildFutureDateValue(26),
      returnDate: buildFutureDateValue(32),
      passengers: "2 Adults",
    },
  },
  {
    id: "dubai-luxury",
    slug: "dubai-luxury-stay",
    title: "Dubai Luxury Stay",
    description: "Fast escape bundle with hotel and premium local mobility included.",
    price: 1199,
    badge: "Luxury",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Dubai, United Arab Emirates (DXB)",
      departure: buildFutureDateValue(18),
      returnDate: buildFutureDateValue(22),
      passengers: "2 Adults",
    },
  },
  {
    id: "bangkok-food",
    slug: "bangkok-food-street-tour",
    title: "Bangkok Food Street Tour",
    description: "Bundle built for food trips with flights, stay, and city transport.",
    price: 1099,
    badge: "Hot now",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Bangkok, Thailand (BKK)",
      departure: buildFutureDateValue(30),
      returnDate: buildFutureDateValue(36),
      passengers: "2 Adults",
    },
  },
  {
    id: "tokyo-premium",
    slug: "tokyo-premium-culture",
    title: "Tokyo Premium Culture",
    description: "Premium Tokyo package with smooth arrivals and a city-ready itinerary.",
    price: 1699,
    badge: "Premium",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Tokyo, Japan (HND)",
      departure: buildFutureDateValue(35),
      returnDate: buildFutureDateValue(42),
      passengers: "2 Adults",
    },
  },
  {
    id: "singapore-family",
    slug: "singapore-family-fun",
    title: "Singapore Family Fun",
    description: "An easy family-ready bundle with flight, hotel, and practical car.",
    price: 1299,
    badge: "Family",
    bundleSearch: {
      tripType: "roundtrip",
      from: "Mumbai, India (BOM)",
      to: "Singapore, Singapore (SIN)",
      departure: buildFutureDateValue(28),
      returnDate: buildFutureDateValue(34),
      passengers: "2 Adults, 1 Child",
    },
  },
];

export const trendingTrips = bundleDeals.slice(0, 3);

export const whyAiFeatures = [
  {
    title: "One prompt, full plan",
    description:
      "Describe budget, duration, and trip style once and get a structured travel plan back.",
  },
  {
    title: "Lower booking friction",
    description:
      "The AI surfaces flights, stays, cars, and itinerary ideas together so users compare less.",
  },
  {
    title: "Easy to refine",
    description:
      "Modify the plan without restarting the trip search from scratch.",
  },
];

export const testimonials = [
  {
    id: "ria",
    name: "Ria Menon",
    role: "Frequent traveler",
    quote:
      "The layout feels familiar like a major travel site, but the AI planner makes the planning step much faster.",
  },
  {
    id: "aditya",
    name: "Aditya Sharma",
    role: "Startup founder",
    quote:
      "I could compare flights quickly and the hotel suggestions felt like they belonged in the same booking flow.",
  },
  {
    id: "maria",
    name: "Maria Alvarez",
    role: "Remote worker",
    quote:
      "The cards are clear, large, and mobile friendly. I always knew what the next step was.",
  },
];

export const flightResults = [
  {
    id: "flt-skyjet-101",
    airline: "SkyJet",
    code: "SJ 101",
    departure: "06:20",
    arrival: "09:40",
    duration: "3h 20m",
    stops: "Nonstop",
    price: 219,
    logo: "SJ",
    accent: "from-sky-500 to-cyan-400",
  },
  {
    id: "flt-cloudair-204",
    airline: "CloudAir",
    code: "CA 204",
    departure: "09:10",
    arrival: "12:55",
    duration: "3h 45m",
    stops: "1 stop",
    price: 189,
    logo: "CA",
    accent: "from-indigo-500 to-blue-400",
  },
  {
    id: "flt-orbit-318",
    airline: "Orbit Lines",
    code: "OL 318",
    departure: "13:30",
    arrival: "16:30",
    duration: "3h 00m",
    stops: "Nonstop",
    price: 256,
    logo: "OL",
    accent: "from-orange-500 to-amber-300",
  },
  {
    id: "flt-nova-552",
    airline: "Nova Air",
    code: "NA 552",
    departure: "18:40",
    arrival: "22:25",
    duration: "3h 45m",
    stops: "1 stop",
    price: 205,
    logo: "NA",
    accent: "from-emerald-500 to-teal-400",
  },
];

export const hotels = [
  {
    id: "htl-riverfront",
    name: "Riverfront Grand",
    rating: 4.8,
    pricePerDay: 129,
    location: "Central district, 8 min from downtown",
    details: "Breakfast included and flexible cancellation",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #90be6d, #43aa8b 55%, #577590)",
  },
  {
    id: "htl-atelier",
    name: "Atelier Stay",
    rating: 4.6,
    pricePerDay: 112,
    location: "Creative quarter near metro line",
    details: "Boutique rooms with rooftop lounge",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #f9c74f, #f9844a 55%, #6d597a)",
  },
  {
    id: "htl-harbor",
    name: "Harbor Suites",
    rating: 4.7,
    pricePerDay: 145,
    location: "Waterfront view with airport transfer",
    details: "Large rooms built for families and long stays",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #277da1, #4d908e 60%, #90be6d)",
  },
];

export const cars = [
  {
    id: "car-city-compact",
    name: "City Compact",
    rating: 4.5,
    pricePerDay: 42,
    type: "Automatic, 4 seats",
    details: "Best for fast city travel and small parking spots",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.28)), linear-gradient(135deg, #577590, #277da1 55%, #4d908e)",
  },
  {
    id: "car-family-suv",
    name: "Family SUV",
    rating: 4.8,
    pricePerDay: 68,
    type: "Automatic, 6 seats",
    details: "Extra luggage room for airport and hotel transfers",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.28)), linear-gradient(135deg, #f9844a, #f8961e 55%, #f9c74f)",
  },
  {
    id: "car-premium",
    name: "Premium Sedan",
    rating: 4.7,
    pricePerDay: 74,
    type: "Automatic, 4 seats",
    details: "Ideal for business trips and quieter highway driving",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.28)), linear-gradient(135deg, #5a189a, #4361ee 55%, #4cc9f0)",
  },
];

export const aiRecommendations = [
  {
    id: "plan-flight",
    title: "Flight Recommendation",
    name: "Nova Air afternoon saver",
    price: 205,
    details: "Leaves at 13:30, lands at 16:30, good fit for a 5-day city trip.",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #4361ee, #4cc9f0)",
  },
  {
    id: "plan-hotel",
    title: "Hotel Recommendation",
    name: "Atelier Stay",
    price: 112,
    details: "Well-rated boutique hotel close to food streets and metro access.",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #f9844a, #f9c74f)",
  },
  {
    id: "plan-car",
    title: "Rental Car Recommendation",
    name: "City Compact",
    price: 42,
    details: "Low daily cost and easy to park for short city hops.",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #277da1, #43aa8b)",
  },
  {
    id: "plan-itinerary",
    title: "Trip Itinerary",
    name: "5-day Paris essentials",
    price: 0,
    details: "Museum day, Seine cruise, food street walk, day trip, and shopping block.",
    image:
      "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #7209b7, #4361ee)",
  },
];

export const plannerMessages = [
  {
    role: "user",
    content: "Plan a trip to Paris for 5 days under $500",
  },
  {
    role: "assistant",
    content:
      "I built a balanced plan with a lower-cost afternoon flight, a central boutique hotel, a compact rental car, and a simple 5-day itinerary.",
  },
];

export const itinerary = [
  {
    day: "Day 1",
    title: "Arrival and neighborhood walk",
    detail: "Check in, evening café stop, and a short river walk.",
  },
  {
    day: "Day 2",
    title: "Museum and historic core",
    detail: "Morning museum visit followed by central landmarks.",
  },
  {
    day: "Day 3",
    title: "Food and shopping",
    detail: "Local bakery crawl and a slower afternoon in shopping streets.",
  },
  {
    day: "Day 4",
    title: "Day trip",
    detail: "Use the rental car for a nearby town and scenic route.",
  },
  {
    day: "Day 5",
    title: "Flexible departure day",
    detail: "Quick brunch and airport transfer with time buffer.",
  },
];

export const travelGuide = [
  {
    id: "places",
    icon: "MapPinned",
    title: "Places to visit",
    description: "Eiffel Tower, Louvre, Montmartre, and Seine river walk.",
  },
  {
    id: "transport",
    icon: "TrainFront",
    title: "Local transportation tips",
    description: "Metro passes are usually better value than single-trip tickets.",
  },
  {
    id: "weather",
    icon: "CloudSun",
    title: "Weather information",
    description: "Expect mild days with a light jacket needed in the evening.",
  },
  {
    id: "food",
    icon: "UtensilsCrossed",
    title: "Recommended restaurants",
    description: "Choose casual bistros near major sights to reduce travel time.",
  },
];

export const myBookings = [
  {
    id: "bk-1001",
    destination: "Paris, France",
    dates: "Apr 18 - Apr 23",
    status: "Confirmed",
    total: 807,
  },
  {
    id: "bk-1002",
    destination: "Dubai, UAE",
    dates: "May 08 - May 12",
    status: "Pending payment",
    total: 564,
  },
];

export const adminMetrics = [
  { label: "Monthly bookings", value: "12,480" },
  { label: "Conversion rate", value: "6.8%" },
  { label: "Avg. order value", value: "$742" },
  { label: "AI plan usage", value: "39%" },
];

export const adminFlights = [
  { route: "BOM to DXB", airline: "SkyJet", seats: 32, fare: "$219" },
  { route: "DEL to CDG", airline: "Nova Air", seats: 14, fare: "$405" },
  { route: "BLR to SIN", airline: "CloudAir", seats: 22, fare: "$261" },
];

export const adminHotels = [
  { name: "Riverfront Grand", city: "Paris", rooms: 18, rate: "$129" },
  { name: "Atelier Stay", city: "Paris", rooms: 9, rate: "$112" },
  { name: "Harbor Suites", city: "Dubai", rooms: 15, rate: "$145" },
];

export const adminCars = [
  { name: "City Compact", location: "Paris Downtown", inventory: 12, rate: "$42" },
  { name: "Family SUV", location: "Paris Airport", inventory: 7, rate: "$68" },
  { name: "Premium Sedan", location: "Dubai Marina", inventory: 5, rate: "$74" },
];

export const adminBookings = [
  { id: "BK-4011", customer: "Ria Menon", trip: "Paris", status: "Confirmed" },
  { id: "BK-4012", customer: "Aarav Singh", trip: "Dubai", status: "Pending" },
  { id: "BK-4013", customer: "Maria Alvarez", trip: "Tokyo", status: "Refund review" },
];

export function getTripDuration(departureDate, returnDate) {
  if (!departureDate || !returnDate) {
    return 0;
  }

  const start = new Date(departureDate);
  const end = new Date(returnDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diff = end.getTime() - start.getTime();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getById(collection, id) {
  if (!id) {
    return collection[0];
  }

  return collection.find((item) => item.id === id) || collection[0];
}

function buildFutureDateValue(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
