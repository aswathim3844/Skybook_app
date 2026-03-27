"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/travel/TravelUI";
import { fetchAllHotels } from "@/lib/api";

export default function HotelDealsSection() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadHotels() {
      try {
        const data = await fetchAllHotels();
        if (active) {
          setHotels(data);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadHotels();
    return () => {
      active = false;
    };
  }, []);

  const previewHotels = useMemo(
    () =>
      hotels
        .filter((hotel) => Number(hotel.pricePerDay || 0) > 0)
        .sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0))
        .slice(0, 3),
    [hotels]
  );

  return (
    <>
      {loading ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Loading...
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {previewHotels.map((hotel) => (
            <ProductCard
              key={hotel.id}
              item={hotel}
              href={`/hotel-deals?hotel=${hotel.id}`}
              buttonLabel="View stay"
            />
          ))}
        </div>
      )}
      <div className="mt-6">
        <Link
          href="/hotel-deals"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-orange-200 hover:text-orange-500"
        >
          Show more hotels
        </Link>
      </div>
    </>
  );
}
