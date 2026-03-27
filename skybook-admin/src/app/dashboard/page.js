"use client";

import { useEffect, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import ClientGuard from "@/components/admin/ClientGuard";
import { MetricGrid } from "@/components/admin/MetricGrid";
import { formatMoney } from "@/components/admin/formatters";
import { fetchAdminDashboard } from "@/lib/api";
import { useAdminStore } from "@/lib/admin-store";

export default function DashboardPage() {
  const token = useAdminStore((state) => state.token);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchAdminDashboard(token)
      .then(setData)
      .catch((requestError) => {
        setError(requestError.message || "Unable to load dashboard.");
      });
  }, [token]);

  const metrics = [
    { label: "Total bookings", value: data?.metrics?.total_bookings ?? "--" },
    { label: "Revenue", value: data?.metrics?.total_revenue ? formatMoney(data.metrics.total_revenue) : "--" },
    { label: "Active users", value: data?.metrics?.active_users ?? "--" },
    { label: "Active listings", value: data?.metrics?.active_listings ?? "--" },
    { label: "Bundle bookings", value: data?.metrics?.bundle_bookings ?? "--" },
    { label: "Upcoming bookings", value: data?.metrics?.upcoming_bookings ?? "--" },
  ];

  return (
    <ClientGuard>
      <AdminLayoutShell
        title="Operations dashboard"
        description="Live platform metrics from the shared Django backend, plus role-aware access across write actions."
      >
        {error ? <p className="mb-5 rounded-[20px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
        <MetricGrid metrics={metrics} />
        <article className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/30 p-6">
          <h2 className="text-xl font-semibold">Booking status breakdown</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {Object.entries(data?.booking_status_breakdown || {}).map(([status, count]) => (
              <div key={status} className="rounded-[18px] border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-slate-300">{status}</p>
                <p className="mt-2 text-2xl font-semibold">{count}</p>
              </div>
            ))}
          </div>
        </article>
      </AdminLayoutShell>
    </ClientGuard>
  );
}
