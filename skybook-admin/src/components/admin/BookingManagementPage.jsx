"use client";

import { useEffect, useState } from "react";
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

  return (
    <ClientGuard>
      <AdminLayoutShell
        title="Bookings operations"
        description="Support and finance controls for cancel and refund actions, protected by role permissions and audit logging."
      >
        {error ? <p className="mb-5 rounded-[20px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
        <article className="rounded-[24px] border border-white/10 bg-slate-950/30 p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-300">
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Reference</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Customer</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Trip</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Status</th>
                  <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Total</th>
                  <th className="pb-3 font-semibold uppercase tracking-[0.18em]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.booking_id} className="border-b border-white/10 last:border-b-0">
                    <td className="py-4 pr-6 text-slate-100">{booking.booking_reference}</td>
                    <td className="py-4 pr-6 text-slate-100">{booking.customer_name || booking.customer_email || "Guest"}</td>
                    <td className="py-4 pr-6 text-slate-100">
                      {booking.hotel_details?.city || booking.flight_details?.arrival_city || "Planned trip"}
                    </td>
                    <td className="py-4 pr-6 text-slate-100">{booking.booking_status}</td>
                    <td className="py-4 pr-6 text-slate-100">{formatMoney(booking.total_price)}</td>
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
          {loading ? <p className="mt-4 text-sm text-slate-400">Loading bookings...</p> : null}
        </article>
      </AdminLayoutShell>
    </ClientGuard>
  );
}
