"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import BookingProgress from "@/components/travel/BookingProgress";
import { PageHero, PageSection, SummaryPanel } from "@/components/travel/TravelUI";
import { buildBookingQuery, useBookingStore } from "@/lib/booking-store";
import {
  fetchCars,
  fetchFlights,
  fetchHotels,
  fetchReferenceHotels,
} from "@/lib/api";
import { bundleDeals, getTripDuration } from "@/lib/mock-data";

export function BundleDealScreen({ slug }) {
  const router = useRouter();
  const setSearch = useBookingStore((state) => state.setSearch);
  const selectFlight = useBookingStore((state) => state.selectFlight);
  const selectReturnFlight = useBookingStore((state) => state.selectReturnFlight);
  const selectHotel = useBookingStore((state) => state.selectHotel);
  const selectCar = useBookingStore((state) => state.selectCar);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const preset = useMemo(
    () => bundleDeals.find((trip) => (trip.slug || trip.id) === slug) || null,
    [slug]
  );

  useEffect(() => {
    let active = true;

    async function loadBundle() {
      if (!preset?.bundleSearch) {
        setError("This package is not available right now.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const search = preset.bundleSearch;
        const [
          outboundFlightsResult,
          returnFlightsResult,
          hotelResultsResult,
          fallbackHotelsResult,
          carResultsResult,
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
        const hotelResults =
          hotelResultsResult.status === "fulfilled" ? hotelResultsResult.value : [];
        const fallbackHotels =
          fallbackHotelsResult.status === "fulfilled" ? fallbackHotelsResult.value : [];
        const carResults =
          carResultsResult.status === "fulfilled" ? carResultsResult.value : [];

        const selectedFlight = outboundFlights[0] || null;
        const selectedReturnFlight = returnFlights[0] || null;
        const selectedHotel =
          hotelResults.find((hotel) => Number(hotel.pricePerDay || 0) > 0) ||
          fallbackHotels.find((hotel) => Number(hotel.pricePerDay || 0) > 0) ||
          hotelResults[0] ||
          fallbackHotels[0] ||
          null;
        const selectedCar = carResults.find((car) => car.availability !== false) || carResults[0] || null;

        if (!selectedFlight || !selectedReturnFlight) {
          throw new Error("This package could not load flights right now. Please try another bundle or search flights manually.");
        }

        if (!selectedHotel) {
          throw new Error("This package could not load hotel options right now. Please try another bundle.");
        }

        if (!selectedCar) {
          throw new Error("This package could not load car options right now. Please try another bundle.");
        }

        if (!active) {
          return;
        }

        setSearch(search);
        selectFlight(selectedFlight);
        selectReturnFlight(selectedReturnFlight);
        selectHotel(selectedHotel);
        selectCar(selectedCar);

        setBundle({
          search,
          flight: selectedFlight,
          returnFlight: selectedReturnFlight,
          hotel: selectedHotel,
          car: selectedCar,
        });
      } catch (err) {
        if (active) {
          setError(String(err?.message || "We could not load this package right now."));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBundle();
    return () => {
      active = false;
    };
  }, [preset, selectCar, selectFlight, selectHotel, selectReturnFlight, setSearch]);

  const duration = bundle ? Math.max(getTripDuration(bundle.search.departure, bundle.search.returnDate), 1) : 1;
  const total = bundle
    ? (bundle.flight?.price || 0) +
      (bundle.returnFlight?.price || 0) +
      (bundle.hotel?.pricePerDay || 0) * duration +
      (bundle.car?.pricePerDay || 0) * duration
    : 0;

  return (
    <>
      <BookingProgress
        currentStep="summary"
        stepLinks={{
          flights: "",
          hotel: "",
          car: "",
          summary: "",
          payment: "",
        }}
      />
      <PageHero
        eyebrow="Bundle Package"
        title={preset?.title || "Travel bundle"}
        description={preset?.description || "A ready-made flight, hotel, and car package."}
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Bundle price</p>
          <p className="mt-3 text-4xl font-semibold">{loading ? "Loading..." : `$${Math.round(total)}`}</p>
          <p className="mt-2 text-sm text-blue-100/85">
            {loading ? "Preparing your package..." : "Flight, hotel, and car are preselected for checkout."}
          </p>
        </div>
      </PageHero>

      <PageSection eyebrow="Package" title="Ready-to-book bundle">
        {loading ? <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">Loading...</div> : null}
        {error ? <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">{error}</div> : null}
        {!loading && !error && bundle ? (
          <SummaryPanel
            flight={bundle.flight}
            returnFlight={bundle.returnFlight}
            hotel={bundle.hotel}
            car={bundle.car}
            duration={duration}
            total={total}
            ctaHref={`/payment?${buildBookingQuery({
              search: bundle.search,
              flightId: bundle.flight.id,
              returnFlightId: bundle.returnFlight.id,
              hotelId: bundle.hotel.id,
              carId: bundle.car.id,
            })}`}
            ctaLabel="Confirm and Continue to Payment"
            title="Bundle summary"
            description="This package is prefilled so the traveler can review and go directly to payment."
          />
        ) : null}
      </PageSection>

      {!loading && !error && bundle ? (
        <PageSection eyebrow="Actions" title="Continue with this bundle">
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/payment?${buildBookingQuery({
                    search: bundle.search,
                    flightId: bundle.flight.id,
                    returnFlightId: bundle.returnFlight.id,
                    hotelId: bundle.hotel.id,
                    carId: bundle.car.id,
                  })}`
                )
              }
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Go to payment
            </button>
          </div>
        </PageSection>
      ) : null}

      <SiteFooter />
    </>
  );
}
