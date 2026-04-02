"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero } from "@/components/travel/TravelUI";
import { cancelBooking, fetchBookings } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatCurrency } from "@/lib/mock-data";

export default function MyBookingsClient({ confirmed = false }) {
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingReference, setCancellingReference] = useState("");

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
        description="View your confirmed trips, check upcoming travel plans, and keep everything in one place."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Trips on account</p>
          <p className="mt-3 text-4xl font-semibold">{bookings.length}</p>
        </div>
      </PageHero>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        {confirmed ? (
          <div className="mb-6 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            Booking confirmed. Your trip details are ready below.
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
                    {booking.booking_reference || `SNA${String(booking.id).padStart(6, "0")}`}
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
                  {canCancelBooking(booking) ? (
                    <button
                      type="button"
                      onClick={() => handleCancelBooking(booking)}
                      disabled={cancellingReference === booking.booking_reference}
                      className="inline-flex min-h-12 items-center justify-center rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cancellingReference === booking.booking_reference ? "Cancelling..." : "Cancel trip"}
                    </button>
                  ) : null}
                  <Link
                    href="/search-flights"
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
                  >
                    Book another trip
                  </Link>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <BookingFact
                  label="Flight"
                  value={getBookedFlightLabel(booking)}
                />
                <BookingFact
                  label="Hotel"
                  value={getBookedHotelLabel(booking)}
                />
                <BookingFact
                  label="Car"
                  value={getBookedCarLabel(booking)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );

  async function handleCancelBooking(booking) {
    if (!customer?.customer_id || !booking?.booking_reference) {
      return;
    }

    const confirmed = window.confirm(
      `Cancel trip ${booking.booking_reference} to ${booking.destination}?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setCancellingReference(booking.booking_reference);
      setError("");
      const updatedBooking = await cancelBooking(booking.booking_reference, customer.customer_id);
      setBookings((current) =>
        current.map((item) => (item.id === updatedBooking.id ? updatedBooking : item)),
      );
    } catch (err) {
      setError(err?.message || "Could not cancel this booking right now.");
    } finally {
      setCancellingReference("");
    }
  }
}

function BookingFact({ label, value }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function getBookedFlightLabel(booking) {
  return (
    booking.flight_details?.flight_number ||
    booking.booking_metadata?.selected_flight?.flight_number ||
    booking.booking_metadata?.selected_flight?.code ||
    "Not attached"
  );
}

function getBookedHotelLabel(booking) {
  return (
    booking.hotel_details?.hotel_name ||
    booking.booking_metadata?.selected_hotel?.hotel_name ||
    "Not attached"
  );
}

function getBookedCarLabel(booking) {
  if (booking.car_details?.company || booking.car_details?.car_model) {
    return `${booking.car_details?.company || ""} ${booking.car_details?.car_model || ""}`.trim();
  }

  const snapshot = booking.booking_metadata?.selected_car;
  if (snapshot?.company || snapshot?.car_model) {
    return `${snapshot.company || ""} ${snapshot.car_model || ""}`.trim();
  }

  return "Not attached";
}

function canCancelBooking(booking) {
  const status = String(booking?.status || "").toLowerCase();
  if (status === "cancelled" || status === "refunded") {
    return false;
  }

  const returnDate = booking?.return_date ? new Date(booking.return_date) : null;
  if (!returnDate || Number.isNaN(returnDate.getTime())) {
    return true;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return returnDate >= today;
}
