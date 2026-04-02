"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero, PageSection, ProductCard } from "@/components/travel/TravelUI";
import { buildBookingQuery, defaultBookingSearch, useBookingStore } from "@/lib/booking-store";
import { fetchAllHotels } from "@/lib/api";
import { formatCurrency, getTripDuration } from "@/lib/mock-data";

export default function HotelDealsPageClient({
  initialHotelId = "",
  initialDeparture = "",
  initialReturn = "",
}) {
  const router = useRouter();
  const setSearch = useBookingStore((state) => state.setSearch);
  const selectHotel = useBookingStore((state) => state.selectHotel);
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHotelId, setSelectedHotelId] = useState(initialHotelId || "");
  const [checkInDate, setCheckInDate] = useState(initialDeparture || defaultBookingSearch.departure);
  const [checkOutDate, setCheckOutDate] = useState(initialReturn || defaultBookingSearch.returnDate);
  const [filters, setFilters] = useState({
    city: "all",
    maxPrice: "",
    minRating: "any",
    sortBy: "rating-desc",
  });

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

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          hotels
            .map((hotel) => hotel.location?.split(",")[0]?.trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [hotels]
  );

  const filteredHotels = useMemo(
    () =>
      hotels
        .filter((hotel) => {
          const city = hotel.location?.split(",")[0]?.trim() || "";
          if (filters.city !== "all" && city !== filters.city) {
            return false;
          }
          if (filters.maxPrice && Number(hotel.pricePerDay || 0) > Number(filters.maxPrice)) {
            return false;
          }
          if (filters.minRating !== "any" && Number(hotel.rating || 0) < Number(filters.minRating)) {
            return false;
          }
          return true;
        })
        .sort((left, right) => {
          if (filters.sortBy === "price-asc") {
            return Number(left.pricePerDay || 0) - Number(right.pricePerDay || 0);
          }
          if (filters.sortBy === "price-desc") {
            return Number(right.pricePerDay || 0) - Number(left.pricePerDay || 0);
          }
          return Number(right.rating || 0) - Number(left.rating || 0);
        }),
    [filters, hotels]
  );

  const selectedHotel =
    filteredHotels.find((hotel) => hotel.id === selectedHotelId) ||
    hotels.find((hotel) => hotel.id === initialHotelId) ||
    filteredHotels[0] ||
    null;

  useEffect(() => {
    if (checkOutDate && checkInDate && checkOutDate < checkInDate) {
      setCheckOutDate(checkInDate);
    }
  }, [checkInDate, checkOutDate]);

  useEffect(() => {
    if (!selectedHotel) {
      return;
    }

    const search = {
      ...defaultBookingSearch,
      tripType: "hotel-only",
      from: "",
      to: selectedHotel.location || "",
      departure: checkInDate,
      returnDate: checkOutDate,
      passengers: "2 Adults",
      multiCitySegments: [],
    };

    setSearch(search);
    selectHotel(selectedHotel);
  }, [checkInDate, checkOutDate, selectHotel, selectedHotel, setSearch]);

  const duration = Math.max(getTripDuration(checkInDate, checkOutDate), 1);
  const hotelTotal = Number(selectedHotel?.pricePerDay || 0) * duration;
  const paymentHref = selectedHotel
    ? `/payment?${buildBookingQuery({
        search: {
          ...defaultBookingSearch,
          tripType: "hotel-only",
          from: "",
          to: selectedHotel.location || "",
          departure: checkInDate,
          returnDate: checkOutDate,
          passengers: "2 Adults",
          multiCitySegments: [],
        },
        hotelId: selectedHotel.id,
      })}`
    : "#";

  return (
    <main className="min-h-screen bg-[#f3f7ff] text-slate-900">
      <Navbar />

      <PageHero
        eyebrow="Hotel Deals"
        title="Book a hotel stay directly"
        description="Choose a city, filter the available hotels, review the stay summary, and continue straight to payment."
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
              <p className="text-xl font-semibold text-slate-900">Price And Rating</p>
              <div className="mt-3 grid gap-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Max nightly price</span>
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
                  <span className="mb-2 block text-sm font-medium text-slate-600">Minimum rating</span>
                  <select
                    value={filters.minRating}
                    onChange={(event) => setFilters((current) => ({ ...current, minRating: event.target.value }))}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  >
                    <option value="any">Any rating</option>
                    <option value="3">3+ stars</option>
                    <option value="4">4+ stars</option>
                    <option value="4.5">4.5+ stars</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Sort by</span>
                  <select
                    value={filters.sortBy}
                    onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value }))}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  >
                    <option value="rating-desc">Rating: High to Low</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <PageSection eyebrow="Results" title="Available Hotels" className="px-0 py-0">
            {loading ? <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">Loading...</div> : null}
            {!loading && filteredHotels.length === 0 ? (
              <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                No hotels matched your current filters.
              </div>
            ) : null}
            <div className="grid gap-5 md:grid-cols-2">
              {filteredHotels.map((hotel) => (
                <ProductCard
                  key={hotel.id}
                  item={hotel}
                  buttonLabel={selectedHotel?.id === hotel.id ? "Selected" : "Select hotel"}
                  onSelect={() => {
                    setSelectedHotelId(hotel.id);
                    selectHotel(hotel);
                  }}
                />
              ))}
            </div>
          </PageSection>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pl-2">
            <aside className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Stay Summary</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">
                {selectedHotel ? selectedHotel.name : "Select a hotel"}
              </h3>
              <div className="mt-5 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>City</span>
                  <span className="font-semibold text-slate-900">
                    {selectedHotel?.location?.split(",")[0] || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Rating</span>
                  <span className="font-semibold text-slate-900">{selectedHotel?.rating || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Nightly rate</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(Number(selectedHotel?.pricePerDay || 0))}
                  </span>
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Check-in</span>
                  <input
                    type="date"
                    value={checkInDate}
                    onChange={(event) => setCheckInDate(event.target.value)}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Check-out</span>
                  <input
                    type="date"
                    min={checkInDate}
                    value={checkOutDate}
                    onChange={(event) => setCheckOutDate(event.target.value)}
                    className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
                  />
                </label>
                <div className="flex items-center justify-between">
                  <span>Stay total</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(hotelTotal)}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={!selectedHotel}
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
