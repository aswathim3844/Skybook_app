"use client";

import Link from "next/link";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { FlightCard, PageHero, PageSection, ProductCard } from "@/components/travel/TravelUI";
import { useSavedStore } from "@/lib/saved-store";

export default function SavedTripsClient() {
  const savedFlights = useSavedStore((state) => state.savedFlights);
  const savedHotels = useSavedStore((state) => state.savedHotels);
  const savedCars = useSavedStore((state) => state.savedCars);
  const removeSavedFlight = useSavedStore((state) => state.removeSavedFlight);
  const removeSavedHotel = useSavedStore((state) => state.removeSavedHotel);
  const removeSavedCar = useSavedStore((state) => state.removeSavedCar);

  const totalSaved = savedFlights.length + savedHotels.length + savedCars.length;

  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        eyebrow="Saved"
        title="Saved trips and favorites"
        description="This page keeps flights, hotels, and cars that the user wants to revisit later. Saved items persist in the browser."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Saved items</p>
          <p className="mt-3 text-4xl font-semibold">{totalSaved}</p>
          <p className="mt-2 text-sm text-blue-100/85">
            Flights: {savedFlights.length} | Hotels: {savedHotels.length} | Cars: {savedCars.length}
          </p>
        </div>
      </PageHero>

      {totalSaved === 0 ? (
        <PageSection title="Nothing saved yet" description="Use the Save button on flight, hotel, and car cards to build a shortlist here.">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm leading-6 text-slate-600">
              This is useful when you want to compare options later without selecting them immediately.
            </p>
            <Link
              href="/search-flights"
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Start searching
            </Link>
          </div>
        </PageSection>
      ) : null}

      {savedFlights.length > 0 ? (
        <PageSection eyebrow="Flights" title="Saved flights">
          <div className="space-y-4">
            {savedFlights.map((flight) => (
              <FlightCard
                key={flight.id}
                flight={flight}
                href="/search-flights"
                buttonLabel="Search again"
                isSaved
                onToggleSave={() => removeSavedFlight(flight.id)}
              />
            ))}
          </div>
        </PageSection>
      ) : null}

      {savedHotels.length > 0 ? (
        <PageSection eyebrow="Hotels" title="Saved hotels">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {savedHotels.map((hotel) => (
              <ProductCard
                key={hotel.id}
                item={hotel}
                href="/search-flights"
                buttonLabel="Search hotels"
                isSaved
                onToggleSave={() => removeSavedHotel(hotel.id)}
              />
            ))}
          </div>
        </PageSection>
      ) : null}

      {savedCars.length > 0 ? (
        <PageSection eyebrow="Cars" title="Saved rental cars">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {savedCars.map((car) => (
              <ProductCard
                key={car.id}
                item={car}
                href="/search-flights"
                buttonLabel="Search cars"
                isSaved
                onToggleSave={() => removeSavedCar(car.id)}
              />
            ))}
          </div>
        </PageSection>
      ) : null}

      <SiteFooter />
    </main>
  );
}
