"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero } from "@/components/travel/TravelUI";
import { fetchBookings } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatCurrency } from "@/lib/mock-data";

export default function MyBookingsClient({ confirmed = false }) {
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customer?.customer_id) {
      router.replace("/login");
      return undefined;
    }

    let active = true;

    async function loadBookings() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchBookings(customer.customer_id);
        if (active) {
          setBookings(data);
        }
      } catch (err) {
        if (active) {
          setError("Could not load bookings from the backend.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBookings();
    return () => {
      active = false;
    };
  }, [customer?.customer_id, router]);

  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        eyebrow="My Bookings"
        title="Manage current and upcoming trips"
        description="This page now reads bookings from your PostgreSQL-backed Django API."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Trips on account</p>
          <p className="mt-3 text-4xl font-semibold">{bookings.length}</p>
        </div>
      </PageHero>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        {confirmed ? (
          <div className="mb-6 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            Payment received. A real booking row was created in PostgreSQL.
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            Loading bookings from database...
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5">
          {bookings.map((booking) => (
            <article key={booking.id} className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-orange-500">
                    BK-{booking.id}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {booking.destination}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{booking.dates}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    {booking.status}
                  </span>
                  <span className="text-lg font-semibold text-slate-900">
                    {formatCurrency(booking.total)}
                  </span>
                  <Link
                    href="/search-flights"
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
                  >
                    Book another trip
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
