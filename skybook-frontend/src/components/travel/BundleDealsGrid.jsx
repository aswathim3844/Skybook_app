"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingTripCard } from "@/components/travel/TravelUI";
import {
  fetchCars,
  fetchFlights,
  fetchHotels,
  fetchReferenceHotels,
} from "@/lib/api";

export default function BundleDealsGrid({ bundles, limit = null, className = "" }) {
  const [availableBundles, setAvailableBundles] = useState([]);
  const [loading, setLoading] = useState(true);

  const candidateBundles = useMemo(
    () => (limit ? bundles.slice(0, Math.max(limit * 2, limit)) : bundles),
    [bundles, limit]
  );

  useEffect(() => {
    let active = true;

    async function loadAvailability() {
      setLoading(true);

      const checks = await Promise.all(
        candidateBundles.map(async (bundle) => {
          const search = bundle.bundleSearch;

          if (!search) {
            return null;
          }

          const [
            outboundFlightsResult,
            returnFlightsResult,
            hotelsResult,
            fallbackHotelsResult,
            carsResult,
          ] = await Promise.allSettled([
            fetchFlights(search),
            fetchFlights({
              from: search.to,
              to: search.from,
              departure: search.returnDate,
              passengers: search.passengers,
            }),
            fetchHotels({ to: search.to, passengers: search.passengers }),
            fetchReferenceHotels({ to: search.to }),
            fetchCars({ to: search.to }),
          ]);

          const outboundFlights =
            outboundFlightsResult.status === "fulfilled" ? outboundFlightsResult.value : [];
          const returnFlights =
            returnFlightsResult.status === "fulfilled" ? returnFlightsResult.value : [];
          const hotels = hotelsResult.status === "fulfilled" ? hotelsResult.value : [];
          const fallbackHotels =
            fallbackHotelsResult.status === "fulfilled" ? fallbackHotelsResult.value : [];
          const cars = carsResult.status === "fulfilled" ? carsResult.value : [];

          const hasFlights = outboundFlights.length > 0 && returnFlights.length > 0;
          const hasHotel = hotels.length > 0 || fallbackHotels.length > 0;
          const hasCar = cars.length > 0;

          return hasFlights && hasHotel && hasCar ? bundle : null;
        })
      );

      if (!active) {
        return;
      }

      const filtered = checks.filter(Boolean);
      setAvailableBundles(limit ? filtered.slice(0, limit) : filtered);
      setLoading(false);
    }

    loadAvailability();
    return () => {
      active = false;
    };
  }, [candidateBundles, limit]);

  if (loading) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Loading...
      </div>
    );
  }

  if (availableBundles.length === 0) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        No bundle packages are available right now.
      </div>
    );
  }

  return (
    <div className={className || "grid gap-5 md:grid-cols-2 xl:grid-cols-3"}>
      {availableBundles.map((trip) => (
        <TrendingTripCard key={trip.id} trip={trip} />
      ))}
    </div>
  );
}
