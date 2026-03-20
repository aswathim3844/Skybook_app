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

function normalizeLocationInput(value) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\s*\([A-Za-z]{3}\)\s*$/, "")
    .split(",")[0]
    .trim();
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
  };
}

export function mapHotel(hotel, index = 0) {
  return {
    id: String(hotel.hotel_id),
    name: hotel.hotel_name || "Hotel",
    rating: hotel.rating || 0,
    pricePerDay: Number(hotel.price_per_night || 0),
    location: `${hotel.city || "City"}${hotel.country_name ? `, ${hotel.country_name}` : ""}`,
    details: hotel.description || "Real hotel data from PostgreSQL",
    image: hotel.image_url
      ? `linear-gradient(135deg, rgba(15,23,42,0.12), rgba(15,23,42,0.28)), url("${hotel.image_url}")`
      : hotelGradients[index % hotelGradients.length],
  };
}

export function mapCar(car, index = 0) {
  return {
    id: String(car.car_id),
    name: `${car.company || "Rental"} ${car.car_model || "Car"}`.trim(),
    rating: 4.5,
    pricePerDay: Number(car.price_per_day || 0),
    type: `${car.car_type || "Standard"} | ${car.car_seats || 4} seats${car.availability === false ? " | unavailable" : ""}`,
    details: car.description || `Pickup in ${car.city || "selected city"}`,
    image: car.image_url
      ? `linear-gradient(135deg, rgba(15,23,42,0.12), rgba(15,23,42,0.28)), url("${car.image_url}")`
      : carGradients[index % carGradients.length],
  };
}

export function mapBooking(booking) {
  const outboundDate = booking.outbound_date || "";
  const returnDate = booking.return_date || "";

  return {
    id: booking.booking_id,
    destination:
      booking.hotel_details?.city ||
      booking.flight_details?.arrival_city ||
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
  const params = new URLSearchParams({
    from: normalizeLocationInput(search.from),
    to: normalizeLocationInput(search.to),
    departure: search.departure || "",
  });

  const data = await request(`/flights/?${params.toString()}`);
  return data.map(mapFlight);
}

export async function fetchHotels(search) {
  const params = new URLSearchParams({
    city: normalizeLocationInput(search.to),
  });

  const data = await request(`/hotels/?${params.toString()}`);
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

export async function sendAIChatMessage(payload) {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
