const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const hotelGradients = [
  "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #90be6d, #43aa8b 55%, #577590)",
  "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #f9c74f, #f9844a 55%, #6d597a)",
  "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.3)), linear-gradient(135deg, #277da1, #4d908e 60%, #90be6d)",
];

const carGradients = [
  "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.28)), linear-gradient(135deg, #577590, #277da1 55%, #4d908e)",
  "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.28)), linear-gradient(135deg, #f9844a, #f8961e 55%, #f9c74f)",
  "linear-gradient(135deg, rgba(15,23,42,0.08), rgba(15,23,42,0.28)), linear-gradient(135deg, #5a189a, #4361ee 55%, #4cc9f0)",
];

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const error = new Error(payload?.message || `Request failed: ${response.status}`);
    error.payload = payload;
    throw error;
  }

  return response.json();
}

async function requestWithStatus(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    data: payload,
  };
}

function normalizeLocationInput(value) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\s*\([A-Za-z]{3}\)\s*$/, "")
    .split(",")[0]
    .trim();
}

function extractAirportCode(value) {
  if (!value) {
    return "";
  }

  const match = String(value).match(/\(([A-Za-z]{3})\)\s*$/);
  if (match) {
    return match[1].toUpperCase();
  }

  return normalizeLocationInput(value).toUpperCase();
}

function parseTimeToMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDurationToMinutes(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const compactMatch = text.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if (compactMatch && (compactMatch[1] || compactMatch[2])) {
    return Number(compactMatch[1] || 0) * 60 + Number(compactMatch[2] || 0);
  }

  const numericMatch = text.match(/(\d+)/);
  return numericMatch ? Number(numericMatch[1]) : null;
}

export function mapFlight(flight, index = 0) {
  const accents = [
    "from-sky-500 to-cyan-400",
    "from-indigo-500 to-blue-400",
    "from-orange-500 to-amber-300",
    "from-emerald-500 to-teal-400",
  ];

  return {
    id: String(flight.flight_id),
    airline: flight.airline || "SkyBook Air",
    code: flight.code || flight.flight_number || `FL ${flight.flight_id}`,
    departure: flight.departure_time_display || "--:--",
    arrival: flight.arrival_time_display || "--:--",
    duration: flight.duration_display || "TBD",
    stops: flight.stops || "Nonstop",
    price: Number(flight.price || flight.base_price || 0),
    logo: flight.logo || (flight.airline || "SK").slice(0, 2).toUpperCase(),
    accent: accents[index % accents.length],
    sourceLabel: flight.provider === "serpapi" ? "Live price" : "Database price",
    departureMinutes: parseTimeToMinutes(flight.departure_time_display),
    durationMinutes: Number(flight.duration_minutes || parseDurationToMinutes(flight.duration_display) || 0),
    stopCount:
      typeof flight.stop_count === "number"
        ? flight.stop_count
        : String(flight.stops || "").toLowerCase().includes("nonstop")
          ? 0
          : 1,
  };
}

export function mapHotel(hotel, index = 0) {
  const pricingPending = Boolean(hotel.pricing_pending || hotel.is_discovery_result);
  const nightlyPrice = pricingPending ? null : Number(hotel.price_per_night || 0);

  return {
    id: String(hotel.hotel_id),
    name: hotel.hotel_name || "Hotel",
    rating: hotel.rating || 0,
    pricePerDay: nightlyPrice,
    location: `${hotel.city || "City"}${hotel.country_name ? `, ${hotel.country_name}` : ""}`,
    details:
      hotel.description ||
        (pricingPending
          ? "Live discovery result. Select it to check room offers and final pricing."
          : "Available stay details and pricing"),
    image: hotel.image_url
      ? `linear-gradient(135deg, rgba(15,23,42,0.12), rgba(15,23,42,0.28)), url("${hotel.image_url}")`
      : hotelGradients[index % hotelGradients.length],
    pricingPending,
    priceLabel: hotel.price_display || null,
    providerMetadata: hotel.provider_metadata || null,
    isDiscoveryResult: Boolean(hotel.is_discovery_result),
    isFallbackPrice: Boolean(hotel.is_fallback_price),
    sourceLabel: hotel.is_fallback_price ? "Reference price" : pricingPending ? "Price pending" : "Live price",
  };
}

export function mapCar(car, index = 0) {
  const seats = Number(car.car_seats || 4);
  const availability = car.availability !== false;
  const carType = car.car_type || "Standard";

  return {
    id: String(car.car_id),
    name: `${car.company || "Rental"} ${car.car_model || "Car"}`.trim(),
    rating: 4.5,
    pricePerDay: Number(car.price_per_day || 0),
    type: `${carType} | ${seats} seats${availability ? "" : " | unavailable"}`,
    details: car.description || `Pickup in ${car.city || "selected city"}`,
    image: car.image_url
      ? `linear-gradient(135deg, rgba(15,23,42,0.12), rgba(15,23,42,0.28)), url("${car.image_url}")`
      : carGradients[index % carGradients.length],
    sourceLabel: "Available now",
    seats,
    availability,
    carType,
  };
}

export function mapBooking(booking) {
  const outboundDate = booking.outbound_date || "";
  const returnDate = booking.return_date || "";

  return {
    id: booking.booking_id,
    booking_reference: booking.booking_reference || `SNA${String(booking.booking_id || "").padStart(6, "0")}`,
    booking_status: booking.booking_status || "Confirmed",
    total_price: booking.total_price || 0,
    created_at: booking.created_at || null,
    outbound_date: booking.outbound_date || "",
    return_date: booking.return_date || "",
    flight_details: booking.flight_details || null,
    return_flight_details: booking.return_flight_details || null,
    hotel_details: booking.hotel_details || null,
    car_details: booking.car_details || null,
    booking_metadata: booking.booking_metadata || {},
    destination:
      booking.hotel_details?.city ||
      booking.booking_metadata?.selected_hotel?.city ||
      booking.flight_details?.arrival_city ||
      booking.booking_metadata?.selected_flight?.arrival_city ||
      "Planned trip",
    dates:
      outboundDate && returnDate
        ? `${outboundDate} to ${returnDate}`
        : outboundDate || returnDate || "Saved booking",
    status: booking.booking_status || "Confirmed",
    total: Number(booking.total_price || 0),
    flight: booking.flight_details ? mapFlight(booking.flight_details) : null,
    returnFlight: booking.return_flight_details ? mapFlight(booking.return_flight_details) : null,
    hotel: booking.hotel_details ? mapHotel(booking.hotel_details) : null,
    car: booking.car_details ? mapCar(booking.car_details) : null,
  };
}

export async function fetchFlights(search) {
  const data = await request("/flights/search", {
    method: "POST",
    body: JSON.stringify({
      origin: extractAirportCode(search.from),
      destination: extractAirportCode(search.to),
      departure_date: search.departure || "",
      return_date: search.returnDate || "",
      seat_class: search.seatClass || "Economy",
      min_seats: 1,
    }),
  });
  return data.map(mapFlight);
}

export async function fetchHotels(search) {
  const data = await request("/hotels/search", {
    method: "POST",
    body: JSON.stringify({
      city: normalizeLocationInput(search.to),
      hotel_rating: search.hotelRating || "Any",
      adults_number: extractPassengerCount(search.passengers),
    }),
  });
  return data.map(mapHotel);
}

export async function fetchHotelOffer(payload) {
  return request("/hotels/offers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchReferenceHotels(search) {
  const params = new URLSearchParams({
    city: normalizeLocationInput(search.to),
  });

  const data = await request(`/hotels/?${params.toString()}`);
  return data.map(mapHotel);
}

export async function fetchAllHotels() {
  const data = await request("/hotels/");
  return data.map(mapHotel);
}

export async function fetchCars(search) {
  const params = new URLSearchParams({
    city: normalizeLocationInput(search.to),
  });

  const data = await request(`/cars/?${params.toString()}`);
  return data.map(mapCar);
}

export async function fetchAllCars() {
  const data = await request("/cars/");
  return data.map(mapCar);
}

export async function fetchBookings(customerId) {
  const suffix = customerId ? `?customer_id=${customerId}` : "";
  const data = await request(`/bookings/${suffix}`);
  return data.map(mapBooking);
}

export async function cancelBooking(reference, customerId) {
  const data = await request(`/bookings/${encodeURIComponent(reference)}/`, {
    method: "PATCH",
    body: JSON.stringify({
      action: "cancel",
      customer_id: customerId,
    }),
  });

  return mapBooking(data);
}

export async function createBooking(payload) {
  const data = await request("/bookings/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapBooking(data);
}

export async function fetchCountries() {
  return request("/countries/");
}

export async function fetchFlightLocations() {
  return request("/flight-locations/");
}

export async function fetchFlightRoutes() {
  return request("/flight-routes/");
}

export async function sendAIChatMessage(payload) {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createPlannerSession(payload) {
  return request("/planner/sessions/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchPlannerSessions(customerId) {
  const suffix = customerId ? `?customer_id=${customerId}` : "";
  return request(`/planner/sessions/${suffix}`);
}

export async function fetchPlannerSession(sessionId) {
  return request(`/planner/sessions/${sessionId}/`);
}

export async function sendPlannerSessionMessage(sessionId, payload) {
  return request(`/planner/sessions/${sessionId}/messages/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generatePlannerSessionPlan(sessionId, payload) {
  return request(`/planner/sessions/${sessionId}/plan/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function enrichPlannerDraft(sessionId, draftId) {
  return request(`/planner/sessions/${sessionId}/drafts/${draftId}/enrich/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function revalidatePlannerDraft(sessionId, draftId) {
  return request(`/planner/sessions/${sessionId}/drafts/${draftId}/revalidate/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function updatePlannerDraft(sessionId, draftId, payload) {
  return request(`/planner/sessions/${sessionId}/drafts/${draftId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchProviderStatus() {
  return request("/planner/provider-status/");
}

export async function fetchHealthStatus() {
  const response = await requestWithStatus("/health/");
  return { ...response.data, _http_status: response.status, _ok: response.ok };
}

export async function fetchReadinessStatus() {
  const response = await requestWithStatus("/ready/");
  return { ...response.data, _http_status: response.status, _ok: response.ok };
}

export async function searchPlannerFlights(payload) {
  return request("/flights/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function searchPlannerHotels(payload) {
  return request("/hotels/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function searchPlannerCars(payload) {
  return request("/cars/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function retrieveBooking(reference) {
  return request(`/bookings/${encodeURIComponent(reference)}/`);
}

export async function registerCustomer(payload) {
  return request("/auth/register/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginCustomer(payload) {
  return request("/auth/login/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAccount(customerId) {
  return request(`/auth/account/${customerId}/`);
}

export async function updateAccount(customerId, payload) {
  return request(`/auth/account/${customerId}/`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchCustomerBookings(customerId) {
  const data = await request(`/bookings/?customer_id=${customerId}`);
  return data.map(mapBooking);
}

function extractPassengerCount(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 1;
}
