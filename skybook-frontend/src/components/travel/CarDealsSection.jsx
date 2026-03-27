"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/travel/TravelUI";
import { fetchAllCars } from "@/lib/api";

export default function CarDealsSection() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCars() {
      try {
        const data = await fetchAllCars();
        if (active) {
          setCars(data);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCars();
    return () => {
      active = false;
    };
  }, []);

  const previewCars = useMemo(
    () =>
      cars
        .filter((car) => Number(car.pricePerDay || 0) > 0 && car.availability !== false)
        .sort((left, right) => Number(left.pricePerDay || 0) - Number(right.pricePerDay || 0))
        .slice(0, 3),
    [cars]
  );

  return (
    <>
      {loading ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Loading...
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {previewCars.map((car) => (
            <ProductCard
              key={car.id}
              item={car}
              href={`/car-deals?car=${car.id}`}
              buttonLabel="View car"
            />
          ))}
        </div>
      )}
      <div className="mt-6">
        <Link
          href="/car-deals"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-orange-200 hover:text-orange-500"
        >
          Show more cars
        </Link>
      </div>
    </>
  );
}
