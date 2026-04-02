"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setAdminCookie, useAdminStore } from "@/lib/admin-store";
import { hasPermission } from "@/components/admin/formatters";

const navItems = [
  { href: "/dashboard", label: "Dashboard", permission: "dashboard.read" },
  { href: "/bookings", label: "Bookings", permission: "bookings.read" },
  { href: "/flights", label: "Flights", permission: "flights.read" },
  { href: "/hotels", label: "Hotels", permission: "hotels.read" },
  { href: "/cars", label: "Cars", permission: "cars.read" },
  { href: "/admin-users", label: "Admin Users", permission: "admin_users.read" },
];

export default function AdminLayoutShell({ title, description, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAdminStore((state) => state.admin);
  const permissions = useAdminStore((state) => state.permissions);
  const clearAdminAuth = useAdminStore((state) => state.clearAdminAuth);

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-12">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">SkyBook Control</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-slate-950/30 px-5 py-4 text-right text-sm">
              <p className="font-semibold text-white">{admin?.full_name || admin?.email || "Admin"}</p>
              <p className="mt-1 text-slate-400">{admin?.role_name || "Role pending"}</p>
              <button
                onClick={() => {
                  clearAdminAuth();
                  setAdminCookie(null);
                  router.replace("/login");
                }}
                className="mt-4 rounded-full bg-white px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-100"
              >
                Log out
              </button>
            </div>
          </div>

          <div className="grid gap-8 pt-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="rounded-[28px] border border-white/10 bg-slate-950/30 p-4">
              <div className="grid gap-2">
                {navItems.map((item) => {
                  if (item.permission && !hasPermission(permissions, item.permission)) {
                    return null;
                  }
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
                        active
                          ? "bg-cyan-300 text-slate-950"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </aside>

            <section>{children}</section>
          </div>
        </div>
      </section>
    </main>
  );
}
