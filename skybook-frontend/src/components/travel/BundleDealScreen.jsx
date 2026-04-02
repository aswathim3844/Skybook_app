"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import BookingProgress from "@/components/travel/BookingProgress";
import PassengerSelector from "@/components/travel/PassengerSelector";
import { PageHero, PageSection, SummaryPanel } from "@/components/travel/TravelUI";
import { buildBookingQuery, useBookingStore } from "@/lib/booking-store";
import {
  fetchCars,
  fetchFlights,
  fetchHotels,
  fetchReferenceHotels,
} from "@/lib/api";
import { bundleDeals, getTripDuration } from "@/lib/mock-data";

export function BundleDealScreen({ slug, initialParams }) {
  const router = useRouter();
  const setSearch = useBookingStore((state) => state.setSearch);
  const selectFlight = useBookingStore((state) => state.selectFlight);
  const selectReturnFlight = useBookingStore((state) => state.selectReturnFlight);
  const selectHotel = useBookingStore((state) => state.selectHotel);
  const selectCar = useBookingStore((state) => state.selectCar);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [departureDate, setDepartureDate] = useState(initialParams?.departure || "");
  const [returnDate, setReturnDate] = useState(initialParams?.return || "");
  const [passengers, setPassengers] = useState(initialParams?.passengers || "");
  const [readyToLoad, setReadyToLoad] = useState(
    Boolean(initialParams?.departure || initialParams?.return || initialParams?.passengers),
  );

  const preset = useMemo(
    () => bundleDeals.find((trip) => (trip.slug || trip.id) === slug) || null,
    [slug]
  );

  useEffect(() => {
    if (!preset?.bundleSearch) {
      return;
    }

    const fallbackDeparture = initialParams?.departure || preset.bundleSearch.departure || "";
    const fallbackReturn = initialParams?.return || preset.bundleSearch.returnDate || "";
    const fallbackPassengers = initialParams?.passengers || preset.bundleSearch.passengers || "2 Adults";

    setDepartureDate((current) => current || fallbackDeparture);
    setReturnDate((current) => current || fallbackReturn);
    setPassengers((current) => current || fallbackPassengers);
  }, [initialParams?.departure, initialParams?.passengers, initialParams?.return, preset]);

  useEffect(() => {
    let active = true;

    async function loadBundle() {
      if (!readyToLoad) {
        setLoading(false);
        return;
      }

      if (!preset?.bundleSearch) {
        setError("This package is not available right now.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const fallbackDeparture = preset.bundleSearch?.departure || "";
        const fallbackReturn = preset.bundleSearch?.returnDate || "";
        const fallbackPassengers = preset.bundleSearch?.passengers || "2 Adults";
        const resolvedDeparture = departureDate || initialParams?.departure || fallbackDeparture;
        const resolvedReturn = returnDate || initialParams?.return || fallbackReturn;
        const resolvedPassengers = passengers || initialParams?.passengers || fallbackPassengers;
        const search = {
          ...preset.bundleSearch,
          ...(resolvedDeparture ? { departure: resolvedDeparture } : {}),
          ...(resolvedReturn ? { returnDate: resolvedReturn } : {}),
          ...(resolvedPassengers ? { passengers: resolvedPassengers } : {}),
        };
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
  }, [
    departureDate,
    initialParams?.departure,
    initialParams?.passengers,
    initialParams?.return,
    passengers,
    preset,
    readyToLoad,
    returnDate,
    selectCar,
    selectFlight,
    selectHotel,
    selectReturnFlight,
    setSearch,
  ]);

  function handleLoadPackage() {
    if (!departureDate || !returnDate) {
      setError("Choose departure and return dates before loading this package.");
      return;
    }
    if (returnDate < departureDate) {
      setError("Return date must be after departure date.");
      return;
    }
    setError("");
    setReadyToLoad(true);
  }

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
            {!readyToLoad
              ? "Choose your trip details first, then load this package."
              : loading
                ? "Preparing your package..."
                : "Flight, hotel, and car are preselected for checkout."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/80">
                Departure date
              </span>
              <input
                type="date"
                value={departureDate}
                onChange={(event) => setDepartureDate(event.target.value)}
                className="min-h-11 w-full rounded-[18px] border border-white/15 bg-white/10 px-4 text-white outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/80">
                Return date
              </span>
              <input
                type="date"
                min={departureDate}
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
                className="min-h-11 w-full rounded-[18px] border border-white/15 bg-white/10 px-4 text-white outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/80">
                Passengers
              </span>
              <div
                className="rounded-[18px] border border-white/15 bg-white/10 p-4"
              >
                <PassengerSelector
                  value={passengers}
                  onChange={setPassengers}
                  dark
                />
              </div>
            </label>
          </div>
          <button
            type="button"
            onClick={handleLoadPackage}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#173a7a] transition hover:bg-slate-100"
          >
            Load package
          </button>
        </div>
      </PageHero>

      <PageSection eyebrow="Package" title="Ready-to-book bundle">
        {!readyToLoad ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Choose your dates and passengers above, then load the package.
          </div>
        ) : null}
        {loading && readyToLoad ? <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">Loading...</div> : null}
        {error ? <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">{error}</div> : null}
        {!loading && readyToLoad && !error && bundle ? (
          <SummaryPanel
            flight={bundle.flight}
            returnFlight={bundle.returnFlight}
            hotel={bundle.hotel}
            car={bundle.car}
            search={bundle.search}
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

      {!loading && readyToLoad && !error && bundle ? (
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
