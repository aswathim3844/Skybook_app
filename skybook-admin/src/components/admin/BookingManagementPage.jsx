"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import ClientGuard from "@/components/admin/ClientGuard";
import { formatMoney, hasPermission } from "@/components/admin/formatters";
import { fetchAdminBookings, updateBookingStatus } from "@/lib/api";
import { useAdminStore } from "@/lib/admin-store";

export default function BookingManagementPage() {
  const token = useAdminStore((state) => state.token);
  const permissions = useAdminStore((state) => state.permissions);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("most_recent");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const payload = await fetchAdminBookings(token);
      setBookings(payload);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  async function mutateStatus(bookingId, action) {
    try {
      await updateBookingStatus(token, bookingId, { action });
      await refresh();
    } catch (requestError) {
      setError(requestError.message || "Unable to update booking.");
    }
  }

  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextBookings = bookings.filter((booking) => {
      const matchesStatus =
        statusFilter === "all"
          ? true
          : (booking.booking_status || "").toLowerCase() === statusFilter.toLowerCase();

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        booking.booking_reference,
        booking.booking_id,
        booking.customer_name,
        booking.customer_email,
        booking.flight_details?.flight_number,
        booking.return_flight_details?.flight_number,
        booking.hotel_details?.hotel_name,
        booking.car_details?.company,
        booking.car_details?.car_model,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    nextBookings.sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

      if (sortOrder === "oldest") {
        return leftTime - rightTime;
      }

      if (sortOrder === "highest_total") {
        return Number(right.total_price || 0) - Number(left.total_price || 0);
      }

      if (sortOrder === "lowest_total") {
        return Number(left.total_price || 0) - Number(right.total_price || 0);
      }

      return rightTime - leftTime;
    });

    return nextBookings;
  }, [bookings, query, sortOrder, statusFilter]);

  const statusOptions = useMemo(() => {
    const uniqueStatuses = Array.from(new Set(bookings.map((booking) => booking.booking_status).filter(Boolean)));
    return ["all", ...uniqueStatuses];
  }, [bookings]);

  return (
    <ClientGuard>
      <AdminLayoutShell
        title="Bookings operations"
        description="Support and finance controls for cancel and refund actions, protected by role permissions and audit logging."
      >
        {error ? <p className="mb-5 rounded-[20px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
        <section className="mb-5 grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/30 p-5 lg:grid-cols-[minmax(0,1.3fr)_220px_220px]">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Search bookings</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Reference, customer, flight, hotel..."
              className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sort by</span>
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
            >
              <option value="most_recent">Most recent</option>
              <option value="oldest">Oldest</option>
              <option value="highest_total">Highest total</option>
              <option value="lowest_total">Lowest total</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : status}
                </option>
              ))}
            </select>
          </label>
        </section>
        <article className="rounded-[24px] border border-white/10 bg-slate-950/30 p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-300">
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Reference</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Booking ID</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Customer</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Dates</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Inventory</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Status</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Passengers</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Seat</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Total</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Created</th>
                  <th className="pb-3 font-semibold uppercase tracking-[0.18em]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((booking) => (
                  <tr key={booking.booking_id} className="border-b border-white/10 last:border-b-0">
                    <td className="py-4 pr-6 text-slate-100">{booking.booking_reference}</td>
                    <td className="py-4 pr-6 text-slate-100">
                      {booking.booking_id}
                    </td>
                    <td className="py-4 pr-6 text-slate-100">
                      <div className="space-y-1">
                        <p>{booking.customer_name || booking.customer_email || "Guest"}</p>
                        <p className="text-xs text-slate-400">{booking.customer_email || "No email"}</p>
                        <p className="text-xs text-slate-500">Customer ID: {booking.customer || "N/A"}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-6 text-slate-100">
                      <div className="space-y-1">
                        <p>Outbound: {booking.outbound_date || "N/A"}</p>
                        <p className="text-xs text-slate-400">Return: {booking.return_date || "N/A"}</p>
                        <p className="text-xs text-slate-500">{booking.is_bundle ? "Bundle" : "Single service"}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-6 text-slate-100">
                      <div className="space-y-1">
                        <p className="text-xs text-slate-300">
                          Flight: {booking.flight_details?.flight_number || booking.booking_metadata?.selected_flight?.flight_number || "None"}
                        </p>
                        <p className="text-xs text-slate-300">
                          Return: {booking.return_flight_details?.flight_number || booking.booking_metadata?.selected_return_flight?.flight_number || "None"}
                        </p>
                        <p className="text-xs text-slate-300">
                          Hotel: {booking.hotel_details?.hotel_name || booking.booking_metadata?.selected_hotel?.hotel_name || "None"}
                        </p>
                        <p className="text-xs text-slate-300">
                          Car: {formatCarLabel(booking)}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 pr-6 text-slate-100">{booking.booking_status}</td>
                    <td className="py-4 pr-6 text-slate-100">{booking.passengers || 1}</td>
                    <td className="py-4 pr-6 text-slate-100">{booking.seat_class || "Economy"}</td>
                    <td className="py-4 pr-6 text-slate-100">{formatMoney(booking.total_price)}</td>
                    <td className="py-4 pr-6 text-slate-100">{formatDateTime(booking.created_at)}</td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        {hasPermission(permissions, "bookings.cancel") ? (
                          <button
                            onClick={() => mutateStatus(booking.booking_id, "cancel")}
                            className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20"
                          >
                            Cancel
                          </button>
                        ) : null}
                        {hasPermission(permissions, "bookings.refund") ? (
                          <button
                            onClick={() => mutateStatus(booking.booking_id, "refund")}
                            className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                          >
                            Refund
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !filteredBookings.length ? (
            <p className="mt-4 text-sm text-slate-400">No bookings matched the current filters.</p>
          ) : null}
          {loading ? <p className="mt-4 text-sm text-slate-400">Loading bookings...</p> : null}
        </article>
      </AdminLayoutShell>
    </ClientGuard>
  );
}

function formatCarLabel(booking) {
  if (booking.car_details?.company || booking.car_details?.car_model) {
    return `${booking.car_details?.company || ""} ${booking.car_details?.car_model || ""}`.trim();
  }

  const selectedCar = booking.booking_metadata?.selected_car;
  if (!selectedCar) {
    return "None";
  }

  return `${selectedCar.company || ""} ${selectedCar.car_model || ""}`.trim() || "None";
}

function formatDateTime(value) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
