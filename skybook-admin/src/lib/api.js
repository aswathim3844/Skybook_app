const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed: ${response.status}`);
    error.payload = payload;
    throw error;
  }

  return payload;
}

function bearer(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export function loginAdmin(payload) {
  return request("/admin/auth/login/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminSession(token) {
  return request("/admin/auth/session/", {
    headers: bearer(token),
  });
}

export function fetchAdminDashboard(token) {
  return request("/admin/dashboard/", {
    headers: bearer(token),
  });
}

export function fetchAdminBookings(token) {
  return request("/admin/bookings/", {
    headers: bearer(token),
  });
}

export function updateBookingStatus(token, bookingId, payload) {
  return request(`/admin/bookings/${bookingId}/status/`, {
    method: "PATCH",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function fetchAdminFlights(token) {
  return request("/admin/flights/", {
    headers: bearer(token),
  });
}

export function createFlight(token, payload) {
  return request("/admin/flights/", {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function updateFlight(token, flightId, payload) {
  return request(`/admin/flights/${flightId}/`, {
    method: "PUT",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function deleteFlight(token, flightId) {
  return request(`/admin/flights/${flightId}/`, {
    method: "DELETE",
    headers: bearer(token),
  });
}

export function fetchAdminHotels(token) {
  return request("/admin/hotels/", {
    headers: bearer(token),
  });
}

export function createHotel(token, payload) {
  return request("/admin/hotels/", {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function updateHotel(token, hotelId, payload) {
  return request(`/admin/hotels/${hotelId}/`, {
    method: "PUT",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function deleteHotel(token, hotelId) {
  return request(`/admin/hotels/${hotelId}/`, {
    method: "DELETE",
    headers: bearer(token),
  });
}

export function fetchAdminCars(token) {
  return request("/admin/cars/", {
    headers: bearer(token),
  });
}

export function createCar(token, payload) {
  return request("/admin/cars/", {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function updateCar(token, carId, payload) {
  return request(`/admin/cars/${carId}/`, {
    method: "PUT",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function deleteCar(token, carId) {
  return request(`/admin/cars/${carId}/`, {
    method: "DELETE",
    headers: bearer(token),
  });
}

export function fetchAdminRoles(token) {
  return request("/admin/roles/", {
    headers: bearer(token),
  });
}

export function fetchAdminUsers(token) {
  return request("/admin/users/", {
    headers: bearer(token),
  });
}

export function createAdminUser(token, payload) {
  return request("/admin/users/", {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}

export function updateAdminUser(token, adminUserId, payload) {
  return request(`/admin/users/${adminUserId}/`, {
    method: "PATCH",
    headers: bearer(token),
    body: JSON.stringify(payload),
  });
}
