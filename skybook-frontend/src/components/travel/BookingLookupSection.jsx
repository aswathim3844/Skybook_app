"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { retrieveBooking } from "@/lib/api";

export default function BookingLookupSection() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLookup(event) {
    event.preventDefault();

    const normalizedReference = String(reference || "").trim().toUpperCase();
    if (!normalizedReference) {
      setError("Enter your booking reference to continue.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await retrieveBooking(normalizedReference);
      router.push(`/trip-confirmed?reference=${encodeURIComponent(normalizedReference)}`);
    } catch (lookupError) {
      setError(lookupError?.message || "We could not find that booking right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
        Retrieve Booking
      </p>
      <h3 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">
        Already have a booking? Find it here
      </h3>
      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleLookup}>
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="SNA000123"
          className="min-h-14 flex-1 rounded-full border border-slate-200 bg-[#f7faff] px-6 text-base text-slate-900 outline-none transition focus:border-[#173a7a] focus:ring-4 focus:ring-[#173a7a]/10"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#173a7a] px-7 text-base font-semibold text-white transition hover:bg-[#102b5d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Finding..." : "Find Booking"}
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
