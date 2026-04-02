"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero, PageSection, ProductCard } from "@/components/travel/TravelUI";
import { buildBookingQuery, defaultBookingSearch, useBookingStore } from "@/lib/booking-store";
import { fetchAllCars } from "@/lib/api";
import { formatCurrency, getTripDuration } from "@/lib/mock-data";

export default function CarDealsPageClient({
  initialCarId = "",
  initialDeparture = "",
  initialReturn = "",
}) {
  const router = useRouter();
  const setSearch = useBookingStore((state) => state.setSearch);
  const selectCar = useBookingStore((state) => state.selectCar);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState(initialCarId || "");
  const [pickupDate, setPickupDate] = useState(initialDeparture || defaultBookingSearch.departure);
  const [dropoffDate, setDropoffDate] = useState(initialReturn || defaultBookingSearch.returnDate);
  const [filters, setFilters] = useState({
    city: "all",
    maxPrice: "",
    minSeats: "all",
    sortBy: "price-asc",
  });

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

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cars
            .map((car) => car.details?.replace(/^Pickup in\s+/i, "").trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [cars]
  );

  const filteredCars = useMemo(
    () =>
      cars
        .filter((car) => {
          const city = car.details?.replace(/^Pickup in\s+/i, "").trim() || "";
          if (filters.city !== "all" && city !== filters.city) {
            return false;
          }
          if (filters.maxPrice && Number(car.pricePerDay || 0) > Number(filters.maxPrice)) {
            return false;
          }
          if (filters.minSeats !== "all" && Number(car.seats || 0) < Number(filters.minSeats)) {
            return false;
          }
          if (car.availability === false) {
            return false;
          }
          return true;
        })
        .sort((left, right) => {
          if (filters.sortBy === "price-desc") {
            return Number(right.pricePerDay || 0) - Number(left.pricePerDay || 0);
          }
          if (filters.sortBy === "seats-desc") {
            return Number(right.seats || 0) - Number(left.seats || 0);
          }
          return Number(left.pricePerDay || 0) - Number(right.pricePerDay || 0);
        }),
    [cars, filters]
  );

  const selectedCar =
    filteredCars.find((car) => car.id === selectedCarId) ||
    cars.find((car) => car.id === initialCarId) ||
    filteredCars[0] ||
    null;

  useEffect(() => {
    if (dropoffDate && pickupDate && dropoffDate < pickupDate) {
      setDropoffDate(pickupDate);
    }
  }, [dropoffDate, pickupDate]);

  useEffect(() => {
    if (!selectedCar) {
      return;
    }

    const search = {
      ...defaultBookingSearch,
      tripType: "car-only",
      from: "",
      to: selectedCar.details?.replace(/^Pickup in\s+/i, "").trim() || "",
      departure: pickupDate,
      returnDate: dropoffDate,
      passengers: "2 Adults",
      multiCitySegments: [],
    };

    setSearch(search);
    selectCar(selectedCar);
  }, [dropoffDate, pickupDate, selectCar, selectedCar, setSearch]);

  const duration = Math.max(getTripDuration(pickupDate, dropoffDate), 1);
  const carTotal = Number(selectedCar?.pricePerDay || 0) * duration;
  const paymentHref = selectedCar
    ? `/payment?${buildBookingQuery({
        search: {
          ...defaultBookingSearch,
          tripType: "car-only",
          from: "",
          to: selectedCar.details?.replace(/^Pickup in\s+/i, "").trim() || "",
          departure: pickupDate,
          returnDate: dropoffDate,
          passengers: "2 Adults",
          multiCitySegments: [],
        },
        carId: selectedCar.id,
      })}`
    : "#";

  return (
    <main className="min-h-screen bg-[#f3f7ff] text-slate-900">
      <Navbar />

      <PageHero
        eyebrow="Car Deals"
        title="Book a rental car directly"
        description="Choose a city, filter available cars, review the rental summary, and continue straight to payment."
        topSlot={
          <Link
            href="/"
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur"
          >
            Back to Book Flights
          </Link>
        }
      />

      <section className="mx-auto grid max-w-[1600px] gap-6 px-6 py-16 sm:px-8 xl:grid-cols-[240px_minmax(0,1fr)_280px] xl:px-10">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="space-y-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-2">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xl font-semibold text-slate-900">City</p>
              <div className="mt-3">
                <select
                  value={filters.city}
                  onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                  className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                >
                  <option value="all">All cities</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xl font-semibold text-slate-900">Price And Seats</p>
              <div className="mt-3 grid gap-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Max daily price</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="No limit"
                    value={filters.maxPrice}
                    onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Minimum seats</span>
                  <select
                    value={filters.minSeats}
                    onChange={(event) => setFilters((current) => ({ ...current, minSeats: event.target.value }))}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  >
                    <option value="all">Any seats</option>
                    <option value="4">4+ seats</option>
                    <option value="5">5+ seats</option>
                    <option value="7">7+ seats</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Sort by</span>
                  <select
                    value={filters.sortBy}
                    onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value }))}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  >
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="seats-desc">Seats: Most first</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <PageSection eyebrow="Results" title="Available Cars" className="px-0 py-0">
            {loading ? <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">Loading...</div> : null}
            {!loading && filteredCars.length === 0 ? (
              <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                No cars matched your current filters.
              </div>
            ) : null}
            <div className="grid gap-5 md:grid-cols-2">
              {filteredCars.map((car) => (
                <ProductCard
                  key={car.id}
                  item={car}
                  buttonLabel={selectedCar?.id === car.id ? "Selected" : "Select car"}
                  onSelect={() => {
                    setSelectedCarId(car.id);
                    selectCar(car);
                  }}
                />
              ))}
            </div>
          </PageSection>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pl-2">
            <aside className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Rental Summary</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">
                {selectedCar ? selectedCar.name : "Select a car"}
              </h3>
              <div className="mt-5 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>City</span>
                  <span className="font-semibold text-slate-900">
                    {selectedCar?.details?.replace(/^Pickup in\s+/i, "").trim() || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Seats</span>
                  <span className="font-semibold text-slate-900">{selectedCar?.seats || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Daily rate</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(Number(selectedCar?.pricePerDay || 0))}
                  </span>
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Pickup date</span>
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(event) => setPickupDate(event.target.value)}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Dropoff date</span>
                  <input
                    type="date"
                    min={pickupDate}
                    value={dropoffDate}
                    onChange={(event) => setDropoffDate(event.target.value)}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  />
                </label>
                <div className="flex items-center justify-between">
                  <span>Rental total</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(carTotal)}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={!selectedCar}
                onClick={() => router.push(paymentHref)}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Continue to payment
              </button>
            </aside>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </main>
  );
}
