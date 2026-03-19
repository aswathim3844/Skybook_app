import Link from "next/link";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero } from "@/components/travel/TravelUI";
import { adminMetrics } from "@/lib/mock-data";

const adminLinks = [
  { label: "Admin Login", href: "/admin/login" },
  { label: "Manage Flights", href: "/admin/flights" },
  { label: "Manage Hotels", href: "/admin/hotels" },
  { label: "Manage Cars", href: "/admin/cars" },
  { label: "View Bookings", href: "/admin/bookings" },
  { label: "Analytics", href: "/admin/analytics" },
];

export default function AdminPage({
  eyebrow,
  title,
  description,
  children,
}) {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        eyebrow={eyebrow}
        title={title}
        description={description}
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Platform metrics</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {adminMetrics.map((metric) => (
              <div key={metric.label} className="rounded-[22px] border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-blue-100/70">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:px-8 lg:grid-cols-[0.28fr_0.72fr] lg:px-12">
        <aside className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Admin Nav</p>
          <div className="mt-5 grid gap-2">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[20px] border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </aside>

        <div>{children}</div>
      </section>

      <SiteFooter />
    </main>
  );
}

export function AdminTable({ title, columns, rows }) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400">
              {columns.map((column) => (
                <th key={column} className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-100 text-slate-700 last:border-b-0">
                {Object.values(row).map((value, valueIndex) => (
                  <td key={valueIndex} className="py-4 pr-6">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
