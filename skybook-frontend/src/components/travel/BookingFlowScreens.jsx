"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import SiteFooter from "@/components/travel/SiteFooter";
import BookingProgress from "@/components/travel/BookingProgress";
import {
  FlightCard,
  PageHero,
  PageSection,
  ProductCard,
  SecondaryLink,
  SummaryPanel,
} from "@/components/travel/TravelUI";
import {
  buildBookingQuery,
  defaultBookingSearch,
  useBookingStore,
  useHydrateBookingFromParams,
} from "@/lib/booking-store";
import {
  createBooking,
  fetchCars,
  fetchFlights,
  fetchAllHotels,
  fetchHotels,
  fetchReferenceHotels,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatCurrency, getTripDuration } from "@/lib/mock-data";
import { useSavedStore } from "@/lib/saved-store";

function getFriendlyErrorMessage(err, fallback, context = "general") {
  const rawMessage = String(err?.message || "").trim();
  const lowered = rawMessage.toLowerCase();

  if (!rawMessage) {
    return fallback;
  }

  if (lowered.includes("request failed: 400")) {
    if (context === "flight-search") {
      return "No live flights were returned for this route and date. Try another future date or a different route.";
    }
    return "The search details were not accepted. Please check the selected route, dates, and filters.";
  }

  if (lowered.includes("request failed: 404")) {
    if (context === "hotel-offer") {
      return "This hotel cannot be priced directly right now. Try another hotel option.";
    }
    return "The requested option could not be found. Try choosing another result.";
  }

  if (lowered.includes("request failed: 422")) {
    if (context === "hotel-search") {
      return "The live hotel provider could not price this search format. Showing fallback options when available.";
    }
    return "The provider could not process that request. Try a different search or filter combination.";
  }

  if (lowered.includes("request failed: 500")) {
    return "The server ran into a problem while loading this step. Please try again.";
  }

  if (lowered.includes("timed out")) {
    return "The live provider took too long to respond. Please try again in a moment.";
  }

  if (lowered.includes("sold out")) {
    return "This option is sold out for the selected dates. Please choose another one.";
  }

  if (lowered.includes("cannot be priced directly")) {
    return "This result cannot be priced directly. Try another option or use the reference-priced result.";
  }

  return rawMessage || fallback;
}

export function FlightResultsScreen({ initialParams }) {
  const router = useRouter();
  const { search, selectedFlightId, selectedReturnFlightId, selectFlight } = useBookingSnapshot(initialParams);
  const stepLinks = buildStepLinks(search, {
    flightId: selectedFlightId || null,
    returnFlightId: selectedReturnFlightId || null,
  });
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedItineraryId, setSelectedItineraryId] = useState(null);
  const [filters, setFilters] = useState({
    airline: "all",
    sortBy: "price-asc",
    departureWindow: "all",
    maxPrice: "",
    stops: "all",
    maxDuration: "",
  });
  const toggleSavedFlight = useSavedStore((state) => state.toggleSavedFlight);
  const isFlightSaved = useSavedStore((state) => state.isFlightSaved);
  const duration = getTripDuration(search.departure, search.returnDate);
  const tripType = search.tripType || "roundtrip";
  const multiCitySegments = useMemo(() => search.multiCitySegments || [], [search.multiCitySegments]);
  const searchFrom = search.from;
  const searchTo = search.to;
  const searchDeparture = search.departure;

  useEffect(() => {
    let active = true;

    async function loadFlights() {
      try {
        setLoading(true);
        setError("");
        const data =
          tripType === "multicity"
            ? await fetchMultiCityItineraries(multiCitySegments)
            : await fetchFlights({
                from: searchFrom,
                to: searchTo,
                departure: searchDeparture,
              });
        if (active) {
          setFlights(data);
        }
      } catch (err) {
        if (active) {
          setError(
            getFriendlyErrorMessage(
              err,
              "We could not load live flights for this route.",
              "flight-search"
            )
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadFlights();
    return () => {
      active = false;
    };
  }, [multiCitySegments, searchDeparture, searchFrom, searchTo, tripType]);

  const airlineOptions = Array.from(
    new Set(
      flights.map((flight) =>
        tripType === "multicity"
          ? flight.primaryAirline || flight.airline
          : flight.airline
      )
    )
  ).filter(Boolean);

  const activeFlights = flights
    .filter((flight) => {
      const carrier = tripType === "multicity" ? flight.primaryAirline || flight.airline : flight.airline;
      if (filters.airline !== "all" && carrier !== filters.airline) {
        return false;
      }

      const price = tripType === "multicity" ? Number(flight.totalPrice || 0) : flight.price;
      if (filters.maxPrice && price > Number(filters.maxPrice)) {
        return false;
      }

      const stopCount = tripType === "multicity" ? Number(flight.totalStopCount || 0) : Number(flight.stopCount || 0);
      if (filters.stops === "nonstop" && stopCount > 0) {
        return false;
      }

      if (filters.stops === "stops" && stopCount === 0) {
        return false;
      }

      const durationMinutes =
        tripType === "multicity"
          ? Number(flight.totalDurationMinutes || 0)
          : Number(flight.durationMinutes || 0);
      if (filters.maxDuration && durationMinutes > Number(filters.maxDuration)) {
        return false;
      }

      if (filters.departureWindow !== "all") {
        const departureMinutes =
          tripType === "multicity"
            ? Number(flight.legs?.[0]?.departureMinutes || 0)
            : Number(flight.departureMinutes || 0);
        const hour = Math.floor(departureMinutes / 60);

        if (filters.departureWindow === "morning" && (hour < 5 || hour >= 12)) {
          return false;
        }
        if (filters.departureWindow === "afternoon" && (hour < 12 || hour >= 18)) {
          return false;
        }
        if (filters.departureWindow === "evening" && (hour < 18 || hour > 23)) {
          return false;
        }
      }

      return true;
    })
    .sort((left, right) => {
      const leftPrice = tripType === "multicity" ? Number(left.totalPrice || 0) : left.price;
      const rightPrice = tripType === "multicity" ? Number(right.totalPrice || 0) : right.price;
      const leftDeparture = tripType === "multicity" ? left.legs?.[0]?.departure || "" : left.departure;
      const rightDeparture = tripType === "multicity" ? right.legs?.[0]?.departure || "" : right.departure;
      if (filters.sortBy === "price-desc") {
        return rightPrice - leftPrice;
      }
      if (filters.sortBy === "departure-early") {
        return leftDeparture.localeCompare(rightDeparture);
      }
      if (filters.sortBy === "departure-late") {
        return rightDeparture.localeCompare(leftDeparture);
      }
      return leftPrice - rightPrice;
    });

  const defaultFlightId = activeFlights[0]?.id || null;

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="flights" stepLinks={stepLinks} /> : null}
      <PageHero
        eyebrow="Flight Results"
        title={
          tripType === "multicity"
            ? "Multi-city flight options"
            : `Flights from ${search.from} to ${search.to}`
        }
        description={
          tripType === "roundtrip"
            ? `Explore options for ${search.departure} to ${search.returnDate}. Travelers: ${search.passengers}.`
            : tripType === "oneway"
              ? `Explore one-way options for ${search.departure}. Travelers: ${search.passengers}.`
              : `Review flight options for ${multiCitySegments.length} connected legs.`
        }
        actions={<SecondaryLink href="/search-flights">Edit search</SecondaryLink>}
      />

      <section className="mx-auto grid max-w-[1600px] gap-6 px-6 py-16 sm:px-8 xl:grid-cols-[240px_minmax(0,1fr)_280px] xl:px-10">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-2">
            {!loading && !error && flights.length > 0 ? (
              <FlightResultsSidebar
                filters={filters}
                setFilters={setFilters}
                airlineOptions={airlineOptions}
                tripType={tripType}
                flights={activeFlights}
                search={search}
              />
            ) : null}
          </div>
        </aside>

        <div>
          <PageSection
            eyebrow="Results"
            title={tripType === "multicity" ? "Available itineraries" : "Available flights"}
            className="px-0 py-0"
          >
            {loading ? <InfoPanel text="Loading..." /> : null}
            {error ? <ErrorPanel text={error} /> : null}
            {!loading && !error && activeFlights.length === 0 ? (
              <InfoPanel text={tripType === "multicity" ? "No itinerary bundles matched your current filters. Try another airline, price, or departure window." : "No flights matched your current filters. Try another airline, price, or departure window."} />
            ) : null}
            <div className="space-y-4">
              {tripType === "multicity"
                ? activeFlights.map((itinerary, index) => (
                    <MultiCityItineraryCard
                      key={itinerary.id}
                      itinerary={itinerary}
                      index={index}
                      selected={selectedItineraryId === itinerary.id}
                      onSelect={() => {
                        setSelectedItineraryId(itinerary.id);
                        selectFlight(mapItineraryBudgetFlight(itinerary));
                        router.push(
                          `/payment?${buildBookingQuery({
                            search,
                            flightId: itinerary.id,
                          })}`
                        );
                      }}
                    />
                  ))
                : activeFlights.map((flight) => (
                    <FlightCard
                      key={flight.id}
                      flight={flight}
                      buttonLabel={selectedFlightId === flight.id ? "Selected" : "Select flight"}
                      isSaved={isFlightSaved(flight.id)}
                      onToggleSave={() => toggleSavedFlight(flight)}
                      onSelect={() => {
                        selectFlight(flight);
                        if (tripType === "roundtrip") {
                          router.push(
                            `/return-flight-selection?${buildBookingQuery({
                              search,
                              flightId: flight.id,
                            })}`
                          );
                          return;
                        }

                        router.push(
                          `/booking-summary?${buildBookingQuery({
                            search,
                            flightId: flight.id,
                          })}`
                        );
                      }}
                    />
                  ))}
            </div>
          </PageSection>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pl-2">
            <BudgetSidebar
              compact
              tripType={tripType}
              flight={
                tripType === "multicity"
                  ? mapItineraryBudgetFlight(activeFlights.find((itinerary) => itinerary.id === selectedItineraryId) || activeFlights[0])
                  : activeFlights.find((flight) => flight.id === selectedFlightId) || activeFlights[0]
              }
              hotel={null}
              car={null}
              duration={duration}
            />
          </div>
        </aside>
      </section>

      {tripType === "roundtrip" && duration > 1 ? (
        <TripRecommendationsSection
          search={search}
          selectedFlightId={selectedFlightId || defaultFlightId}
          selectedReturnFlightId={selectedReturnFlightId || null}
          selectedFlight={
            activeFlights.find((flight) => flight.id === (selectedFlightId || defaultFlightId)) ||
            activeFlights[0] ||
            null
          }
          selectFlight={selectFlight}
        />
      ) : null}

      {tripType === "oneway" && selectedFlightId ? (
        <PageSection
          eyebrow="Next Step"
          title="Would you like to add more to this one-way trip?"
          description="One-way bookings stay simple, but you can still add a hotel or rental car if helpful."
        >
          <OneWayUpsellPanel search={search} selectedFlightId={selectedFlightId} />
        </PageSection>
      ) : null}

      <SiteFooter />
    </>
  );
}

export function ReturnFlightSelectionScreen({ initialParams }) {
  const router = useRouter();
  const {
    search,
    selectedFlightId,
    selectedReturnFlightId,
    selectedFlight,
    selectedReturnFlight,
    selectReturnFlight,
  } = useBookingSnapshot(initialParams);
  const stepLinks = buildStepLinks(search, {
    flightId: selectedFlightId || selectedFlight?.id || null,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id || null,
  });
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    airline: "all",
    sortBy: "price-asc",
    departureWindow: "all",
    maxPrice: "",
    stops: "all",
    maxDuration: "",
  });

  useEffect(() => {
    let active = true;

    async function loadReturnFlights() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchFlights({
          from: search.to,
          to: search.from,
          departure: search.returnDate,
        });
        if (active) {
          setFlights(data);
        }
      } catch (err) {
        if (active) {
          setError(
            getFriendlyErrorMessage(
              err,
              "We could not load return flights for this route.",
              "flight-search"
            )
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadReturnFlights();
    return () => {
      active = false;
    };
  }, [search.from, search.returnDate, search.to]);

  const airlineOptions = Array.from(new Set(flights.map((flight) => flight.airline))).filter(Boolean);
  const activeFlights = flights
    .filter((flight) => {
      if (filters.airline !== "all" && flight.airline !== filters.airline) {
        return false;
      }
      if (filters.maxPrice && flight.price > Number(filters.maxPrice)) {
        return false;
      }
      if (filters.stops === "nonstop" && Number(flight.stopCount || 0) > 0) {
        return false;
      }
      if (filters.stops === "stops" && Number(flight.stopCount || 0) === 0) {
        return false;
      }
      if (filters.maxDuration && Number(flight.durationMinutes || 0) > Number(filters.maxDuration)) {
        return false;
      }
      if (filters.departureWindow !== "all") {
        const hour = Math.floor(Number(flight.departureMinutes || 0) / 60);
        if (filters.departureWindow === "morning" && (hour < 5 || hour >= 12)) {
          return false;
        }
        if (filters.departureWindow === "afternoon" && (hour < 12 || hour >= 18)) {
          return false;
        }
        if (filters.departureWindow === "evening" && (hour < 18 || hour > 23)) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => {
      if (filters.sortBy === "price-desc") {
        return right.price - left.price;
      }
      if (filters.sortBy === "departure-early") {
        return left.departure.localeCompare(right.departure);
      }
      if (filters.sortBy === "departure-late") {
        return right.departure.localeCompare(left.departure);
      }
      return left.price - right.price;
    });

  return (
    <>
      <BookingProgress currentStep="flights" stepLinks={stepLinks} />
      <PageHero
        eyebrow="Return Flight"
        title={`Return flights from ${search.to} to ${search.from}`}
        description={`Choose the return leg for ${search.returnDate}. This keeps the round-trip flow complete before hotel and car selection.`}
        actions={<SecondaryLink href={`/flight-results?${buildBookingQuery({ search, flightId: selectedFlightId || selectedFlight?.id })}`}>Back to outbound flights</SecondaryLink>}
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Outbound already selected</p>
          <p className="mt-3 text-2xl font-semibold">
            {selectedFlight?.airline || "Selected flight"} {selectedFlight?.code || ""}
          </p>
          <p className="mt-2 text-sm text-blue-100/85">
            Now pick the return leg so pricing and booking stay consistent.
          </p>
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-[1600px] gap-6 px-6 py-16 sm:px-8 xl:grid-cols-[240px_minmax(0,1fr)_280px] xl:px-10">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-2">
            {!loading && !error && flights.length > 0 ? (
              <FlightResultsSidebar
                filters={filters}
                setFilters={setFilters}
                airlineOptions={airlineOptions}
                tripType="roundtrip"
                flights={activeFlights}
                search={{
                  ...search,
                  from: search.to,
                  to: search.from,
                  departure: search.returnDate,
                }}
              />
            ) : null}
          </div>
        </aside>

        <div>
          <PageSection eyebrow="Results" title="Available return flights" className="px-0 py-0">
            {loading ? <InfoPanel text="Loading..." /> : null}
            {error ? <ErrorPanel text={error} /> : null}
            {!loading && !error && activeFlights.length === 0 ? (
              <InfoPanel text="No return flights matched your current filters. Try another airline, price, or departure window." />
            ) : null}
            <div className="space-y-4">
              {activeFlights.map((flight) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  buttonLabel={selectedReturnFlightId === flight.id ? "Selected" : "Select return"}
                  onSelect={() => {
                    selectReturnFlight(flight);
                    router.push(
                      `/hotel-selection?${buildBookingQuery({
                        search,
                        flightId: selectedFlightId || selectedFlight?.id,
                        returnFlightId: flight.id,
                      })}`
                    );
                  }}
                />
              ))}
            </div>
          </PageSection>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pl-2">
            <BudgetSidebar
              compact
              tripType="roundtrip"
              flight={selectedFlight}
              returnFlight={
                activeFlights.find((flight) => flight.id === selectedReturnFlightId) ||
                activeFlights[0] ||
                null
              }
              hotel={null}
              car={null}
              duration={Math.max(getTripDuration(search.departure, search.returnDate), 1)}
            />
          </div>
        </aside>
      </section>

      <SiteFooter />
    </>
  );
}

export function HotelSelectionScreen({ initialParams }) {
  const router = useRouter();
  const {
    search,
    selectedFlightId,
    selectedReturnFlightId,
    selectedHotelId,
    selectHotel,
    selectedFlight,
    selectedReturnFlight,
  } =
    useBookingSnapshot(initialParams);
  const stepLinks = buildStepLinks(search, {
    flightId: selectedFlightId || selectedFlight?.id || null,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id || null,
    hotelId: selectedHotelId || null,
  });
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    minRating: "any",
    maxPrice: "",
    sortBy: "recommended",
  });
  const toggleSavedHotel = useSavedStore((state) => state.toggleSavedHotel);
  const isHotelSaved = useSavedStore((state) => state.isHotelSaved);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const tripType = search.tripType || "roundtrip";
  const destinationCity = search.to;
  const summaryHref = `/booking-summary?${buildBookingQuery({
    search,
    flightId: selectedFlightId || selectedFlight?.id,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
    hotelId: selectedHotelId || null,
  })}`;
  const carRentalHref = `/car-rental?${buildBookingQuery({
    search,
    flightId: selectedFlightId || selectedFlight?.id,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
    hotelId: selectedHotelId || null,
  })}`;

  useEffect(() => {
    let active = true;

    async function loadHotels() {
      try {
        setLoading(true);
        setError("");
        let nextHotels = [];

        try {
          const liveHotels = await fetchHotels({
            to: destinationCity,
            passengers: search.passengers,
          });

          nextHotels = (liveHotels || []).map((hotel) => ({
            ...hotel,
            pricePerDay: Number(hotel.pricePerDay || 0) > 0 ? Number(hotel.pricePerDay) : getStaticHotelReferencePrice(hotel),
            pricingPending: false,
            priceLabel: "Reference price",
            details:
              hotel.details ||
              "Showing SkyBook hotel pricing for a stable booking experience.",
            isFallbackPrice: true,
            sourceLabel: "Reference price",
          }));
        } catch {
          nextHotels = [];
        }

        if (nextHotels.length === 0) {
          try {
            const fallbackHotels = await fetchReferenceHotels({ to: destinationCity });
            nextHotels = (fallbackHotels || []).map((hotel) => ({
              ...hotel,
              pricePerDay: getStaticHotelReferencePrice(hotel),
              pricingPending: false,
              priceLabel: "Reference price",
              details:
                hotel.details ||
                "Showing SkyBook reference hotel pricing for a stable booking experience.",
              isFallbackPrice: true,
              sourceLabel: "Reference price",
            }));
          } catch {
            nextHotels = [];
          }
        }

        if (nextHotels.length === 0) {
          const allHotels = await fetchAllHotels();
          const destinationToken = String(destinationCity || "")
            .split(",")[0]
            .trim()
            .toLowerCase();

          nextHotels = (allHotels || [])
            .filter((hotel) => {
              const location = String(hotel.location || "").toLowerCase();
              return !destinationToken || location.includes(destinationToken);
            })
            .map((hotel) => ({
              ...hotel,
              pricePerDay: Number(hotel.pricePerDay || 0) > 0 ? Number(hotel.pricePerDay) : getStaticHotelReferencePrice(hotel),
              pricingPending: false,
              priceLabel: "Reference price",
              details:
                hotel.details ||
                "Showing SkyBook static hotel pricing for a stable booking experience.",
              isFallbackPrice: true,
              sourceLabel: "Reference price",
            }));
        }

        if (active) {
          setHotels(nextHotels);
        }
      } catch (err) {
        if (active) {
          setError(
            getFriendlyErrorMessage(
              err,
              "We could not load hotels for this destination.",
              "hotel-search"
            )
          );
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
  }, [destinationCity, search.departure, search.passengers, search.returnDate]);

  const displayHotels = (() => {
    const directHotels = hotels.filter((hotel) => !hotel.isDiscoveryResult);
    return directHotels.length > 0 ? directHotels : hotels;
  })();
  const filteredHotels = useMemo(
    () =>
      displayHotels
        .filter((hotel) => {
          if (filters.minRating !== "any" && Number(hotel.rating || 0) < Number(filters.minRating)) {
            return false;
          }

          if (filters.maxPrice && Number(hotel.pricePerDay || 0) > Number(filters.maxPrice)) {
            return false;
          }

          return true;
        })
        .sort((left, right) => {
          if (filters.sortBy === "price-asc") {
            return Number(left.pricePerDay || Number.MAX_SAFE_INTEGER) - Number(right.pricePerDay || Number.MAX_SAFE_INTEGER);
          }
          if (filters.sortBy === "price-desc") {
            return Number(right.pricePerDay || 0) - Number(left.pricePerDay || 0);
          }
          if (filters.sortBy === "rating-desc") {
            return Number(right.rating || 0) - Number(left.rating || 0);
          }
          return 0;
        }),
    [displayHotels, filters]
  );
  const activeHotel = filteredHotels.find((hotel) => hotel.id === selectedHotelId) || filteredHotels[0] || null;
  const safeFlight = selectedFlight;

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="hotel" stepLinks={stepLinks} /> : null}
      <PageHero
        eyebrow="Hotel Selection"
        title="Choose a hotel to complete the trip"
        description="Compare stays for your destination and choose the one that suits your trip best."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Selected flight</p>
          <p className="mt-3 text-2xl font-semibold">
            {safeFlight.airline} {safeFlight.code}
          </p>
          <p className="mt-2 text-sm text-blue-100/85">
            {safeFlight.departure} to {safeFlight.arrival} | {duration} day stay
          </p>
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-[1600px] gap-6 px-6 py-16 sm:px-8 xl:grid-cols-[240px_minmax(0,1fr)_280px] xl:px-10">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-2">
            {!loading && !error && displayHotels.length > 0 ? (
              <HotelFilterBar filters={filters} setFilters={setFilters} />
            ) : null}
          </div>
        </aside>

        <div>
          <PageSection eyebrow="Results" title="Recommended Hotels" className="px-0 py-0">
            {loading ? <InfoPanel text="Loading..." /> : null}
            {error ? <ErrorPanel text={error} /> : null}
            {!loading && !error && displayHotels.length === 0 ? (
              <InfoPanel text="No hotels matched this city in your database." />
            ) : null}
            {!loading && !error && displayHotels.length > 0 && displayHotels.length !== hotels.length ? (
              <InfoPanel text="Showing hotel entries that are more likely to support live room pricing." />
            ) : null}
            {!loading && !error && filteredHotels.length === 0 && displayHotels.length > 0 ? (
              <InfoPanel text="No hotels matched your current filters. Try a lower rating, a higher max price, or a different price source." />
            ) : null}
            <div className="grid gap-5 md:grid-cols-2">
              {filteredHotels.map((hotel) => (
                <ProductCard
                  key={hotel.id}
                  item={hotel}
                  buttonLabel={
                    selectedHotelId === hotel.id
                        ? "Selected"
                        : "Select hotel"
                  }
                  isSaved={isHotelSaved(hotel.id)}
                  onToggleSave={() => toggleSavedHotel(hotel)}
                  onSelect={() => {
                    selectHotel(hotel);
                    router.push(
                      `/car-rental?${buildBookingQuery({
                        search,
                        flightId: selectedFlightId || safeFlight.id,
                        returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
                        hotelId: hotel.id,
                      })}`
                    );
                  }}
                />
              ))}
            </div>
          </PageSection>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pl-2">
            <BudgetSidebar
              compact
              tripType={tripType}
              flight={safeFlight}
              returnFlight={selectedReturnFlight}
              hotel={activeHotel}
              car={null}
              duration={duration}
            />
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => router.push(carRentalHref)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                Skip hotel and view cars
              </button>
              <button
                type="button"
                onClick={() => router.push(summaryHref)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                Continue without hotel and car
              </button>
            </div>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </>
  );
}

export function CarRentalScreen({ initialParams }) {
  const router = useRouter();
  const {
    search,
    selectedFlightId,
    selectedReturnFlightId,
    selectedHotelId,
    selectedCarId,
    selectCar,
    selectedFlight,
    selectedReturnFlight,
    selectedHotel,
  } = useBookingSnapshot(initialParams);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    carType: "all",
    seats: "all",
    availability: "available",
    maxPrice: "",
    sortBy: "price-asc",
  });
  const toggleSavedCar = useSavedStore((state) => state.toggleSavedCar);
  const isCarSaved = useSavedStore((state) => state.isCarSaved);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const tripType = search.tripType || "roundtrip";
  const rentalCity = search.to;
  const stepLinks = buildStepLinks(search, {
    flightId: selectedFlightId || selectedFlight?.id || null,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id || null,
    hotelId: selectedHotelId || selectedHotel?.id || null,
    carId: selectedCarId || null,
  });
  const summaryHref = `/booking-summary?${buildBookingQuery({
    search,
    flightId: selectedFlightId || selectedFlight?.id,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
    hotelId: selectedHotelId || selectedHotel?.id,
    carId: selectedCarId || null,
  })}`;

  useEffect(() => {
    let active = true;

    async function loadCars() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchCars({
          to: rentalCity,
        });
        if (active) {
          setCars(data);
        }
      } catch (err) {
        if (active) {
          setError(
            getFriendlyErrorMessage(
              err,
              "We could not load rental cars for this destination.",
              "car-search"
            )
          );
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
  }, [rentalCity]);

  const carTypeOptions = Array.from(new Set(cars.map((car) => car.carType).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
  const filteredCars = useMemo(
    () =>
      cars
        .filter((car) => {
          if (filters.carType !== "all" && car.carType !== filters.carType) {
            return false;
          }
          if (filters.seats !== "all" && Number(car.seats || 0) < Number(filters.seats)) {
            return false;
          }
          if (filters.availability === "available" && !car.availability) {
            return false;
          }
          if (filters.availability === "unavailable" && car.availability) {
            return false;
          }
          if (filters.maxPrice && Number(car.pricePerDay || 0) > Number(filters.maxPrice)) {
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
  const activeCar = filteredCars.find((car) => car.id === selectedCarId) || filteredCars[0] || null;
  const total =
    (selectedFlight?.price || 0) +
    (selectedReturnFlight?.price || 0) +
    (selectedHotel?.pricePerDay || 0) * duration +
    (activeCar?.pricePerDay || 0) * duration;

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="car" stepLinks={stepLinks} /> : null}
      <PageHero
        eyebrow="Car Rental"
        title="Add a rental car if the trip needs local mobility"
        description="Choose a rental car that fits your destination, travel dates, and group size."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Current package</p>
          <p className="mt-3 text-2xl font-semibold">{selectedHotel?.name || "Selected hotel"}</p>
          <p className="mt-2 text-sm text-blue-100/85">
            {duration} days | {selectedFlight.airline} flight already selected
          </p>
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-[1600px] gap-6 px-6 py-16 sm:px-8 xl:grid-cols-[240px_minmax(0,1fr)_280px] xl:px-10">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-2">
            {!loading && !error && cars.length > 0 ? (
              <CarFilterBar filters={filters} setFilters={setFilters} carTypeOptions={carTypeOptions} />
            ) : null}
          </div>
        </aside>

        <div>
          <PageSection eyebrow="Results" title="Available Rental Cars" className="px-0 py-0">
            {loading ? <InfoPanel text="Loading..." /> : null}
            {error ? <ErrorPanel text={error} /> : null}
            {!loading && !error && cars.length === 0 ? (
              <InfoPanel text="No cars matched this city in your database." />
            ) : null}
            {!loading && !error && filteredCars.length === 0 && cars.length > 0 ? (
              <InfoPanel text="No cars matched your current filters. Try another car type, seat count, or price range." />
            ) : null}
            <div className="grid gap-5 md:grid-cols-2">
              {filteredCars.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  buttonLabel={selectedCarId === item.id ? "Selected" : "Select car"}
                  isSaved={isCarSaved(item.id)}
                  onToggleSave={() => toggleSavedCar(item)}
                  onSelect={() => {
                    selectCar(item);
                    router.push(
                      `/booking-summary?${buildBookingQuery({
                        search,
                        flightId: selectedFlightId || selectedFlight.id,
                        returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
                        hotelId: selectedHotelId || selectedHotel?.id,
                        carId: item.id,
                      })}`
                    );
                  }}
                />
              ))}
            </div>
          </PageSection>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pl-2">
            <BudgetSidebar
              compact
              tripType={tripType}
              flight={selectedFlight}
              returnFlight={selectedReturnFlight}
              hotel={selectedHotel}
              car={activeCar}
              duration={duration}
            />
            <div className="mt-4">
              <button
                type="button"
                onClick={() => router.push(summaryHref)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                Continue without car
              </button>
            </div>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </>
  );
}

export function BookingSummaryScreen({ initialParams }) {
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);
  const {
    search,
    selectedFlightId,
    selectedReturnFlightId,
    selectedHotelId,
    selectedCarId,
    selectedFlight,
    selectedReturnFlight,
    selectedHotel,
    selectedCar,
    clearFlight,
    clearReturnFlight,
    clearHotel,
    clearCar,
  } = useBookingSnapshot(initialParams);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const hotelTotal = (selectedHotel?.pricePerDay || 0) * duration;
  const carTotal = (selectedCar?.pricePerDay || 0) * duration;
  const total = (selectedFlight?.price || 0) + (selectedReturnFlight?.price || 0) + hotelTotal + carTotal;
  const tripType = search.tripType || "roundtrip";
  const stepLinks = buildStepLinks(search, {
    flightId: selectedFlightId || selectedFlight?.id || null,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id || null,
    hotelId: selectedHotelId || selectedHotel?.id || null,
    carId: selectedCarId || selectedCar?.id || null,
  });
  const flightResultsHref = `/flight-results?${buildBookingQuery({ search })}`;
  const summaryHref = `/booking-summary?${buildBookingQuery({
    search,
    flightId: selectedFlightId || selectedFlight?.id,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
    hotelId: selectedHotelId || selectedHotel?.id,
    carId: selectedCarId || selectedCar?.id,
  })}`;
  const paymentHref = `/payment?${buildBookingQuery({
    search,
    flightId: selectedFlightId || selectedFlight?.id,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
    hotelId: selectedHotelId || selectedHotel?.id,
    carId: selectedCarId || selectedCar?.id,
  })}`;
  const authRedirectHref = `/login?redirect=${encodeURIComponent(summaryHref)}`;

  const handleRemoveFlight = () => {
    clearFlight();
    router.push(flightResultsHref);
  };

  const handleRemoveReturnFlight = () => {
    clearReturnFlight();
    router.push(flightResultsHref);
  };

  const handleRemoveHotel = () => {
    clearHotel();
  };

  const handleRemoveCar = () => {
    clearCar();
  };

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="summary" stepLinks={stepLinks} /> : null}
      <PageHero
        eyebrow="Booking Summary"
        title="Review the final package before payment"
        description="Take one final look at your trip details before you complete payment."
      >
        <SummaryPanel
          flight={selectedFlight}
          returnFlight={selectedReturnFlight}
          hotel={selectedHotel}
          car={selectedCar}
          search={search}
          duration={duration}
          total={total}
          ctaHref={customer ? paymentHref : authRedirectHref}
          ctaLabel={customer ? "Confirm Booking" : "Sign in or create account"}
          title="Trip package summary"
          description={`Hotel and car totals are multiplied by ${duration} days.`}
          onRemoveFlight={handleRemoveFlight}
          onRemoveReturnFlight={handleRemoveReturnFlight}
          onRemoveHotel={selectedHotelId ? handleRemoveHotel : null}
          onRemoveCar={selectedCarId ? handleRemoveCar : null}
        />
      </PageHero>

      <section
        className={`mx-auto grid max-w-7xl gap-6 px-6 py-16 sm:px-8 lg:px-12 ${
          tripType === "roundtrip" ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        <SummaryCard
          label="Outbound Flight"
          title={selectedFlight.airline}
          detail={`${selectedFlight.departure} to ${selectedFlight.arrival} | ${selectedFlight.duration}`}
          actionLabel="Remove"
          onAction={handleRemoveFlight}
        />
        {tripType === "roundtrip" ? (
          <SummaryCard
            label="Return Flight"
            title={selectedReturnFlight?.airline || "No return flight"}
            detail={
              selectedReturnFlight
                ? `${selectedReturnFlight.departure} to ${selectedReturnFlight.arrival} | ${selectedReturnFlight.duration}`
                : "Add a return flight before checkout"
            }
            actionLabel={selectedReturnFlight ? "Remove" : null}
            onAction={selectedReturnFlight ? handleRemoveReturnFlight : null}
          />
        ) : null}
        <SummaryCard
          label="Selected Hotel"
          title={selectedHotel?.name || "No hotel"}
          detail={`${selectedHotel?.rating || 0} rating | ${duration} nights`}
          actionLabel={selectedHotelId ? "Remove" : null}
          onAction={selectedHotelId ? handleRemoveHotel : null}
        />
        <SummaryCard
          label="Selected Car"
          title={selectedCar?.name || "No car"}
          detail={selectedCar?.type || "No car selected"}
          actionLabel={selectedCarId ? "Remove" : null}
          onAction={selectedCarId ? handleRemoveCar : null}
        />
      </section>

      <SiteFooter />
    </>
  );
}

export function PaymentScreen({ initialParams }) {
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);
  const {
    search,
    selectedFlightId,
    selectedReturnFlightId,
    selectedHotelId,
    selectedCarId,
    selectedFlight,
    selectedReturnFlight,
    selectedHotel,
    selectedCar,
    resetBooking,
  } = useBookingSnapshot(initialParams);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const tripType = search.tripType || "roundtrip";
  const total =
    tripType === "hotel-only"
      ? (selectedHotel?.pricePerDay || 0) * duration
      : tripType === "car-only"
        ? (selectedCar?.pricePerDay || 0) * duration
        : (selectedFlight?.price || 0) +
          (selectedReturnFlight?.price || 0) +
          (selectedHotel?.pricePerDay || 0) * duration +
          (selectedCar?.pricePerDay || 0) * duration;
  const stepLinks = buildStepLinks(search, {
    flightId: selectedFlightId || selectedFlight?.id || null,
    returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id || null,
    hotelId: selectedHotelId || selectedHotel?.id || null,
    carId: selectedCarId || selectedCar?.id || null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    cardHolder: "",
    cardNumber: "",
    expiry: "",
    cvv: "",
    billingAddress: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const hasBookingSelection = Boolean(
    ((tripType === "hotel-only" && selectedHotelId) ||
      (tripType === "car-only" && selectedCarId) ||
      (selectedFlightId &&
        (tripType === "multicity" || tripType === "oneway" || tripType === "roundtrip"))) &&
      (tripType !== "roundtrip" || selectedReturnFlightId)
  );

  function handleFieldChange(field, value) {
    setPaymentForm((current) => ({
      ...current,
      [field]: value,
    }));

    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validatePaymentForm() {
    const nextErrors = {};
    const normalizedCardNumber = paymentForm.cardNumber.replace(/\s+/g, "");

    if (!paymentForm.cardHolder.trim()) {
      nextErrors.cardHolder = "Enter the card holder name.";
    }
    if (!/^\d{16}$/.test(normalizedCardNumber)) {
      nextErrors.cardNumber = "Enter a 16-digit card number.";
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(paymentForm.expiry.trim())) {
      nextErrors.expiry = "Use MM/YY format.";
    }
    if (!/^\d{3,4}$/.test(paymentForm.cvv.trim())) {
      nextErrors.cvv = "Enter a 3 or 4 digit CVV.";
    }
    if (!paymentForm.billingAddress.trim()) {
      nextErrors.billingAddress = "Enter the billing address.";
    }

    return nextErrors;
  }

  async function handlePayment() {
    const nextErrors = validatePaymentForm();

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (!customer?.customer_id) {
      setError("Please sign in before completing payment so this booking is saved to your account.");
      router.push(
        `/login?redirect=${encodeURIComponent(
          `/booking-summary?${buildBookingQuery({
            search,
            flightId: selectedFlightId || selectedFlight?.id,
            returnFlightId: selectedReturnFlightId || selectedReturnFlight?.id,
            hotelId: selectedHotelId || selectedHotel?.id,
            carId: selectedCarId || selectedCar?.id,
          })}`,
        )}`,
      );
      return;
    }

    if (!hasBookingSelection) {
      setError(
        tripType === "multicity"
          ? "This payment page is missing the selected itinerary. Please go back to flight results and choose one again."
          : tripType === "hotel-only"
            ? "This payment page is missing the selected hotel. Please go back and choose a hotel again."
            : tripType === "car-only"
              ? "This payment page is missing the selected car. Please go back and choose a car again."
            : tripType === "roundtrip"
              ? "This payment page is missing the selected outbound or return flight. Please go back and choose the required flight details again."
              : "This payment page is missing the selected flight. Please go back and choose a flight again."
      );
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await createBooking({
        customer: customer?.customer_id || null,
        name: customer?.name || "",
        email: customer?.email || "",
        flight: tripType === "hotel-only" || tripType === "car-only" ? null : selectedFlightId,
        return_flight: tripType === "roundtrip" ? selectedReturnFlightId : null,
        hotel: tripType === "car-only" ? null : selectedHotelId,
        car: tripType === "hotel-only" ? null : selectedCarId,
        outbound_date: search.departure,
        return_date: search.returnDate || search.departure,
        trip_days: duration,
        total_price: total,
        passengers: extractPassengerCount(search.passengers),
        seat_class: "Economy",
        booking_metadata: {
          trip_type: tripType,
          selected_flight: tripType === "hotel-only" || tripType === "car-only" ? null : selectedFlight || null,
          selected_return_flight: tripType === "roundtrip" ? selectedReturnFlight || null : null,
          selected_hotel: tripType === "car-only" ? null : selectedHotel || null,
          selected_car: tripType === "hotel-only" ? null : selectedCar || null,
        },
      });
      resetBooking();
      router.push("/my-bookings?confirmed=true");
    } catch (err) {
      setError(
        getFriendlyErrorMessage(
          err,
          "We could not create the booking right now. Please try again.",
          "booking"
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="payment" stepLinks={stepLinks} /> : null}
      <PageHero
        eyebrow="Payment"
        title="Complete payment"
        description="Complete your payment to confirm the trip and lock in your selections."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Amount due</p>
          <p className="mt-3 text-4xl font-semibold">{formatCurrency(total)}</p>
          <p className="mt-2 text-sm text-blue-100/85">
            Review the amount due before you confirm your booking.
          </p>
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-12">
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Card details</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Input
              label="Card holder"
              placeholder="Traveler name"
              value={paymentForm.cardHolder}
              onChange={(event) => handleFieldChange("cardHolder", event.target.value)}
              error={fieldErrors.cardHolder}
              autoComplete="off"
              name="skybook_card_holder"
              data-form-type="other"
            />
            <Input
              label="Card number"
              placeholder="1234 5678 9012 3456"
              value={paymentForm.cardNumber}
              onChange={(event) => handleFieldChange("cardNumber", event.target.value)}
              error={fieldErrors.cardNumber}
              autoComplete="off"
              inputMode="numeric"
              name="skybook_card_number"
              data-form-type="other"
            />
            <Input
              label="Expiry"
              placeholder="MM/YY"
              value={paymentForm.expiry}
              onChange={(event) => handleFieldChange("expiry", event.target.value)}
              error={fieldErrors.expiry}
              autoComplete="off"
              inputMode="numeric"
              name="skybook_card_expiry"
              data-form-type="other"
            />
            <Input
              label="CVV"
              placeholder="123"
              value={paymentForm.cvv}
              onChange={(event) => handleFieldChange("cvv", event.target.value)}
              error={fieldErrors.cvv}
              autoComplete="off"
              inputMode="numeric"
              name="skybook_card_cvv"
              data-form-type="other"
            />
            <div className="md:col-span-2">
              <Input
                label="Billing address"
                placeholder="Street, city, ZIP"
                value={paymentForm.billingAddress}
                onChange={(event) =>
                  handleFieldChange("billingAddress", event.target.value)
                }
                error={fieldErrors.billingAddress}
                autoComplete="off"
                name="skybook_billing_address"
                data-form-type="other"
              />
            </div>
          </div>
          {error ? <ErrorPanel text={error} className="mt-4" /> : null}
          <button
            onClick={handlePayment}
            disabled={submitting || !hasBookingSelection}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating booking..." : "Pay now"}
          </button>
        </article>

        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Order summary</p>
          <div className="mt-6 space-y-4 text-sm text-slate-600">
            {tripType !== "hotel-only" && tripType !== "car-only" ? (
              <SummaryRow
                label={`${selectedFlight.airline} flight`}
                detail="One-time flight price"
                value={formatCurrency(selectedFlight?.price || 0)}
              />
            ) : null}
            {tripType === "roundtrip" ? (
              <SummaryRow
                label={
                  selectedReturnFlight
                    ? `${selectedReturnFlight.airline} return flight`
                    : "Return flight"
                }
                detail={
                  selectedReturnFlight
                    ? "One-time return flight price"
                    : "Required for round-trip bookings"
                }
                value={formatCurrency(selectedReturnFlight?.price || 0)}
              />
            ) : null}
            {tripType !== "car-only" ? (
              <SummaryRow
                label={`${selectedHotel?.name || "Hotel"} stay`}
                detail={`${formatCurrency(selectedHotel?.pricePerDay || 0)} per night x ${duration} ${duration === 1 ? "night" : "nights"}`}
                value={formatCurrency((selectedHotel?.pricePerDay || 0) * duration)}
              />
            ) : null}
            {tripType !== "hotel-only" ? (
              <SummaryRow
                label={`${selectedCar?.name || "Car"} rental`}
                detail={`${formatCurrency(selectedCar?.pricePerDay || 0)} per day x ${duration} ${duration === 1 ? "day" : "days"}`}
                value={formatCurrency((selectedCar?.pricePerDay || 0) * duration)}
              />
            ) : null}
          </div>
          <div className="mt-6 rounded-[24px] bg-slate-50 p-4">
            <SummaryRow label="Total" value={formatCurrency(total)} emphasized />
          </div>
        </article>
      </section>

      <SiteFooter />
    </>
  );
}

function TripRecommendationsSection({
  search,
  selectedFlightId,
  selectedFlight,
  selectFlight,
  selectedReturnFlightId = null,
}) {
  const router = useRouter();
  const [hotels, setHotels] = useState([]);
  const [cars, setCars] = useState([]);
  const toggleSavedHotel = useSavedStore((state) => state.toggleSavedHotel);
  const isHotelSaved = useSavedStore((state) => state.isHotelSaved);
  const toggleSavedCar = useSavedStore((state) => state.toggleSavedCar);
  const isCarSaved = useSavedStore((state) => state.isCarSaved);
  const recommendationCity = search.to;

  useEffect(() => {
    let active = true;

    async function loadRecommendations() {
      try {
        const [hotelData, carData] = await Promise.all([
          fetchHotels({
            to: recommendationCity,
          }),
          fetchCars({
            to: recommendationCity,
          }),
        ]);
        if (active) {
          setHotels(hotelData);
          setCars(carData);
        }
      } catch {
        if (active) {
          setHotels([]);
          setCars([]);
        }
      }
    }

    loadRecommendations();
    return () => {
      active = false;
    };
  }, [recommendationCity]);

  return (
    <PageSection
        eyebrow="Complete Your Trip"
        title="Recommended hotels and rental cars"
      description="Helpful extras to round out your trip before you finish booking."
      >
      <div className="grid gap-8 xl:grid-cols-2">
        <div>
          <h3 className="mb-4 text-2xl font-semibold text-slate-900">Recommended Hotels</h3>
          <div className="grid gap-5">
            {hotels.slice(0, 3).map((hotel) => (
              <ProductCard
                key={hotel.id}
                item={hotel}
                buttonLabel="Select hotel"
                isSaved={isHotelSaved(hotel.id)}
                onToggleSave={() => toggleSavedHotel(hotel)}
                onSelect={() => {
                  if (selectedFlight) {
                    selectFlight(selectedFlight);
                  }
                  router.push(
                    `/${selectedReturnFlightId ? "hotel-selection" : "return-flight-selection"}?${buildBookingQuery({
                      search,
                      flightId: selectedFlightId,
                      returnFlightId: selectedReturnFlightId,
                      hotelId: hotel.id,
                    })}`
                  );
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-2xl font-semibold text-slate-900">Recommended Rental Cars</h3>
          <div className="grid gap-5">
            {cars.slice(0, 3).map((car) => (
              <ProductCard
                key={car.id}
                item={car}
                buttonLabel="Select car"
                isSaved={isCarSaved(car.id)}
                onToggleSave={() => toggleSavedCar(car)}
                onSelect={() => {
                  if (selectedFlight) {
                    selectFlight(selectedFlight);
                  }
                  router.push(
                    `/${selectedReturnFlightId ? "car-rental" : "return-flight-selection"}?${buildBookingQuery({
                      search,
                      flightId: selectedFlightId,
                      returnFlightId: selectedReturnFlightId,
                      carId: car.id,
                    })}`
                  );
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </PageSection>
  );
}

function useBookingSnapshot(initialParams) {
  useHydrateBookingFromParams(initialParams);

  const searchState = useBookingStore((state) => state.search);
  const selectedFlightId = useBookingStore((state) => state.selectedFlightId);
  const selectedReturnFlightId = useBookingStore((state) => state.selectedReturnFlightId);
  const selectedHotelId = useBookingStore((state) => state.selectedHotelId);
  const selectedCarId = useBookingStore((state) => state.selectedCarId);
  const selectedFlight = useBookingStore((state) => state.selectedFlight);
  const selectedReturnFlight = useBookingStore((state) => state.selectedReturnFlight);
  const selectedHotel = useBookingStore((state) => state.selectedHotel);
  const selectedCar = useBookingStore((state) => state.selectedCar);
  const selectFlight = useBookingStore((state) => state.selectFlight);
  const selectReturnFlight = useBookingStore((state) => state.selectReturnFlight);
  const selectHotel = useBookingStore((state) => state.selectHotel);
  const selectCar = useBookingStore((state) => state.selectCar);
  const clearFlight = useBookingStore((state) => state.clearFlight);
  const clearReturnFlight = useBookingStore((state) => state.clearReturnFlight);
  const clearHotel = useBookingStore((state) => state.clearHotel);
  const clearCar = useBookingStore((state) => state.clearCar);
  const resetBooking = useBookingStore((state) => state.resetBooking);
  const resolvedFlightId = initialParams?.flight || selectedFlightId || selectedFlight?.id || null;
  const resolvedReturnFlightId =
    initialParams?.returnFlight || selectedReturnFlightId || selectedReturnFlight?.id || null;
  const resolvedHotelId = initialParams?.hotel || selectedHotelId || selectedHotel?.id || null;
  const resolvedCarId = initialParams?.car || selectedCarId || selectedCar?.id || null;

  const search = useMemo(
    () => ({
      ...defaultBookingSearch,
      ...searchState,
      ...(initialParams?.from ? { from: initialParams.from } : {}),
      ...(initialParams?.to ? { to: initialParams.to } : {}),
      ...(initialParams?.departure ? { departure: initialParams.departure } : {}),
      ...(initialParams?.return ? { returnDate: initialParams.return } : {}),
      ...(initialParams?.passengers ? { passengers: initialParams.passengers } : {}),
      ...(initialParams?.segments ? { multiCitySegments: parseInitialSegments(initialParams.segments) } : {}),
    }),
    [initialParams, searchState],
  );

  const fallbackFlight = {
    id: resolvedFlightId || "0",
    airline: "Selected flight",
    code: `FL ${resolvedFlightId || ""}`,
    departure: "--:--",
    arrival: "--:--",
    duration: "TBD",
    price: 0,
  };

  const fallbackHotel = {
    id: resolvedHotelId || "0",
    name: "Selected hotel",
    rating: 0,
    pricePerDay: 0,
  };

  const fallbackCar = {
    id: resolvedCarId || "0",
    name: "Selected car",
    type: "No car details yet",
    pricePerDay: 0,
  };

  return {
    search,
    selectedFlightId: resolvedFlightId,
    selectedReturnFlightId: resolvedReturnFlightId,
    selectedHotelId: resolvedHotelId,
    selectedCarId: resolvedCarId,
    selectedFlight: selectedFlight || fallbackFlight,
    selectedReturnFlight: selectedReturnFlight || null,
    selectedHotel: selectedHotel || fallbackHotel,
    selectedCar: selectedCar || fallbackCar,
    selectFlight,
    selectReturnFlight,
    selectHotel,
    selectCar,
    clearFlight,
    clearReturnFlight,
    clearHotel,
    clearCar,
    resetBooking,
  };
}

function Input({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <input
        {...props}
        className={`min-h-12 w-full rounded-[20px] border px-4 text-slate-900 outline-none transition ${
          error
            ? "border-red-300 bg-red-50/60 focus:border-red-400"
            : "border-slate-200 bg-slate-50 focus:border-[#173a7a]"
        }`}
      />
      {error ? <span className="mt-2 block text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

function SummaryRow({ label, value, detail, emphasized = false }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className={emphasized ? "font-semibold text-slate-900" : ""}>{label}</span>
        {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
      </div>
      <span
        className={
          emphasized
            ? "text-lg font-semibold text-slate-900"
            : "font-semibold text-slate-900"
        }
      >
        {value}
      </span>
    </div>
  );
}

function SummaryCard({ label, title, detail, actionLabel, onAction }) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">{label}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </article>
  );
}

function FlightFilterBar({ filters, setFilters, airlineOptions }) {
  return (
    <div className="mb-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Filters and sorting
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <FilterField label="Airline">
          <select
            value={filters.airline}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                airline: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          >
            <option value="all">All airlines</option>
            {airlineOptions.map((airline) => (
              <option key={airline} value={airline}>
                {airline}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Sort by">
          <select
            value={filters.sortBy}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sortBy: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          >
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="departure-early">Departure: Earliest</option>
            <option value="departure-late">Departure: Latest</option>
          </select>
        </FilterField>

        <FilterField label="Departure time">
          <select
            value={filters.departureWindow}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                departureWindow: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          >
            <option value="all">Any time</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </FilterField>

        <FilterField label="Max price">
          <input
            type="number"
            min="0"
            placeholder="No limit"
            value={filters.maxPrice}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxPrice: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          />
        </FilterField>

        <FilterField label="Stops">
          <select
            value={filters.stops}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                stops: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          >
            <option value="all">Any</option>
            <option value="nonstop">Nonstop only</option>
            <option value="stops">With stops</option>
          </select>
        </FilterField>

        <FilterField label="Max duration">
          <input
            type="number"
            min="0"
            placeholder="Minutes"
            value={filters.maxDuration}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxDuration: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          />
        </FilterField>
      </div>
    </div>
  );
}

function FlightResultsSidebar({ filters, setFilters, airlineOptions, tripType, flights, search }) {
  const stopSummary = summarizeStopOptions(flights, tripType);
  const departureLabels = getDepartureLabels(search, tripType);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Stops</p>
        <div className="mt-4 space-y-3">
          {stopSummary.map((option) => (
            <label key={option.value} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={
                  filters.stops === option.value ||
                  (filters.stops === "all" && option.value === "all")
                }
                onChange={() =>
                  setFilters((current) => ({
                    ...current,
                    stops: current.stops === option.value ? "all" : option.value,
                  }))
                }
                className="mt-1 h-5 w-5 rounded border-slate-300 text-[#173a7a] focus:ring-[#173a7a]"
              />
              <div>
                <p className="text-base font-medium text-slate-900">{option.label}</p>
                <p className="text-sm text-slate-500">{option.meta}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Airline</p>
        <div className="mt-3">
          <select
            value={filters.airline}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                airline: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          >
            <option value="all">All airlines</option>
            {airlineOptions.map((airline) => (
              <option key={airline} value={airline}>
                {airline}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Departure Times</p>
        <div className="mt-4 space-y-4">
          {departureLabels.map((label, index) => (
            <div key={label}>
              <p className="text-sm font-medium text-slate-900">
                {index + 1}. {label}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {filters.departureWindow === "all"
                  ? "00:00 - 23:59"
                  : filters.departureWindow === "morning"
                    ? "05:00 - 11:59"
                    : filters.departureWindow === "afternoon"
                      ? "12:00 - 17:59"
                      : "18:00 - 23:59"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["all", "morning", "afternoon", "evening"].map((window) => (
                  <button
                    key={window}
                    type="button"
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        departureWindow: window,
                      }))
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      filters.departureWindow === window
                        ? "border-[#173a7a] bg-slate-50 text-[#173a7a]"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {window === "all" ? "Any" : window}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Price And Duration</p>
        <div className="mt-3 grid gap-3">
          <FilterField label="Max price">
            <input
              type="number"
              min="0"
              placeholder="No limit"
              value={filters.maxPrice}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxPrice: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            />
          </FilterField>
          <FilterField label="Max duration">
            <input
              type="number"
              min="0"
              placeholder="Minutes"
              value={filters.maxDuration}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxDuration: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            />
          </FilterField>
        </div>
      </div>
    </div>
  );
}

function FlightResultsSummaryStrip({ flights, filters, setFilters, tripType }) {
  const resultCount = flights.length;
  const cheapest = flights.reduce((best, flight) => {
    const price = tripType === "multicity" ? Number(flight.totalPrice || 0) : Number(flight.price || 0);
    if (!best || price < best.price) {
      return { price, duration: tripType === "multicity" ? flight.totalDurationDisplay : flight.duration };
    }
    return best;
  }, null);
  const fastest = flights.reduce((best, flight) => {
    const minutes = tripType === "multicity" ? Number(flight.totalDurationMinutes || 0) : Number(flight.durationMinutes || 0);
    if (!best || minutes < best.minutes) {
      return {
        minutes,
        price: tripType === "multicity" ? Number(flight.totalPrice || 0) : Number(flight.price || 0),
      };
    }
    return best;
  }, null);
  const best = filters.sortBy === "price-desc" ? cheapest : flights[0]
    ? {
        price: tripType === "multicity" ? Number(flights[0].totalPrice || 0) : Number(flights[0].price || 0),
        duration: tripType === "multicity" ? flights[0].totalDurationDisplay : flights[0].duration,
      }
    : null;

  return (
    <div className="mb-5 space-y-4">
      <div className="text-sm font-medium text-slate-700">
        {resultCount} results sorted by{" "}
        <span className="font-semibold text-slate-900">
          {filters.sortBy === "price-desc"
            ? "Price"
            : filters.sortBy === "departure-early"
              ? "Earliest departure"
              : filters.sortBy === "departure-late"
                ? "Latest departure"
                : "Best"}
        </span>
      </div>
      <div className="grid overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm md:grid-cols-[1fr_1fr_1fr_220px]">
        <SummaryMetricCard title="Best" value={best?.price || 0} subtitle={`${best?.duration || "TBD"} average`} active />
        <SummaryMetricCard title="Cheapest" value={cheapest?.price || 0} subtitle={`${cheapest?.duration || "TBD"} average`} />
        <SummaryMetricCard title="Fastest" value={fastest?.price || 0} subtitle={`${formatMinutesAsDuration(fastest?.minutes || 0)} average`} />
        <div className="flex items-center justify-center border-t border-slate-200 px-5 py-5 md:border-l md:border-t-0">
          <FilterField label="Sort">
            <select
              value={filters.sortBy}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sortBy: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            >
              <option value="price-asc">Best</option>
              <option value="price-desc">Cheapest</option>
              <option value="departure-early">Fastest/Earliest</option>
              <option value="departure-late">Latest</option>
            </select>
          </FilterField>
        </div>
      </div>
    </div>
  );
}

function SummaryMetricCard({ title, value, subtitle, active = false }) {
  return (
    <div className={`border-t border-slate-200 px-5 py-4 md:border-r md:border-t-0 ${active ? "bg-[#173a7a] text-white" : "bg-white text-slate-900"}`}>
      <p className={`text-sm font-medium ${active ? "text-white/85" : "text-slate-600"}`}>{title}</p>
      <p className="mt-2 text-2xl font-semibold">{formatCurrency(value)}</p>
      <p className={`mt-1 text-sm ${active ? "text-white/85" : "text-slate-500"}`}>{subtitle}</p>
    </div>
  );
}

function HotelFilterBar({ filters, setFilters }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Minimum Rating</p>
        <div className="mt-3">
          <select
            value={filters.minRating}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                minRating: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          >
            <option value="any">Any rating</option>
            <option value="3">3+ stars</option>
            <option value="4">4+ stars</option>
            <option value="4.5">4.5+ stars</option>
          </select>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Price And Sorting</p>
        <div className="mt-3 grid gap-3">
          <FilterField label="Max nightly price">
            <input
              type="number"
              min="0"
              placeholder="No limit"
              value={filters.maxPrice}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxPrice: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            />
          </FilterField>

          <FilterField label="Sort by">
            <select
              value={filters.sortBy}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sortBy: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            >
              <option value="recommended">Recommended</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating-desc">Rating: High to Low</option>
            </select>
          </FilterField>
        </div>
      </div>
    </div>
  );
}

function CarFilterBar({ filters, setFilters, carTypeOptions }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Car Type</p>
        <div className="mt-3">
          <select
            value={filters.carType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                carType: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          >
            <option value="all">All types</option>
            {carTypeOptions.map((carType) => (
              <option key={carType} value={carType}>
                {carType}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Seats And Availability</p>
        <div className="mt-3 grid gap-3">
          <FilterField label="Minimum seats">
            <select
              value={filters.seats}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  seats: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            >
              <option value="all">Any</option>
              <option value="4">4+ seats</option>
              <option value="5">5+ seats</option>
              <option value="7">7+ seats</option>
            </select>
          </FilterField>

          <FilterField label="Availability">
            <select
              value={filters.availability}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  availability: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            >
              <option value="available">Available only</option>
              <option value="all">Show all</option>
              <option value="unavailable">Unavailable only</option>
            </select>
          </FilterField>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xl font-semibold text-slate-900">Price And Sorting</p>
        <div className="mt-3 grid gap-3">
          <FilterField label="Max daily price">
          <input
            type="number"
            min="0"
            placeholder="No limit"
            value={filters.maxPrice}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxPrice: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
          />
        </FilterField>

          <FilterField label="Sort by">
            <select
              value={filters.sortBy}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sortBy: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
            >
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="seats-desc">Seats: Most first</option>
            </select>
          </FilterField>
        </div>
      </div>
    </div>
  );
}

function FilterField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function parseInitialSegments(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : defaultBookingSearch.multiCitySegments;
  } catch {
    return defaultBookingSearch.multiCitySegments;
  }
}

function getStaticHotelReferencePrice(hotel, fallbackHotel = null) {
  const fallbackPrice = Number(fallbackHotel?.pricePerDay || 0);
  if (fallbackPrice > 0) {
    return fallbackPrice;
  }

  const base = 95;
  const rating = Number(hotel?.rating || 4);
  const premium = String(hotel?.name || "").toLowerCase().includes("resort") ? 35 : 0;
  return Math.max(89, Math.round(base + rating * 24 + premium));
}

function InfoPanel({ text }) {
  return <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">{text}</div>;
}

function ErrorPanel({ text, className = "" }) {
  return <div className={`rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-700 ${className}`}>{text}</div>;
}

function BudgetSidebar({ tripType, flight, returnFlight, hotel, car, duration, compact = false }) {
  const stayDays = Math.max(duration || 1, 1);
  const outboundFlightTotal = flight?.price || 0;
  const returnFlightTotal = returnFlight?.price || 0;
  const flightTotal = outboundFlightTotal + returnFlightTotal;
  const hotelUnitPrice = hotel?.pricePerDay || 0;
  const hotelTotal = hotelUnitPrice * stayDays;
  const carUnitPrice = car?.pricePerDay || 0;
  const carTotal = carUnitPrice * stayDays;
  const total = flightTotal + hotelTotal + carTotal;

  return (
    <aside className={`rounded-[32px] border border-slate-200 bg-white shadow-sm ${compact ? "p-5" : "p-6"}`}>
      <p className={`${compact ? "text-xs" : "text-sm"} font-semibold uppercase tracking-[0.22em] text-orange-500`}>
        Budget Snapshot
      </p>
      <h3 className={`mt-3 font-semibold text-slate-900 ${compact ? "text-xl" : "text-2xl"}`}>
        {tripType === "roundtrip"
          ? "Current trip total"
          : tripType === "hotel-only"
            ? "Current stay total"
            : tripType === "car-only"
              ? "Current rental total"
            : "Current flight total"}
      </h3>
      <div className={`text-sm text-slate-600 ${compact ? "mt-5 space-y-3" : "mt-6 space-y-4"}`}>
        <SummaryRow
          label={tripType === "roundtrip" ? "Outbound flight" : "Flight"}
          detail="One-time price"
          value={formatCurrency(outboundFlightTotal)}
        />
        {tripType === "roundtrip" ? (
          <SummaryRow label="Return flight" detail="One-time price" value={formatCurrency(returnFlightTotal)} />
        ) : null}
        {tripType !== "multicity" ? (
          <>
            <SummaryRow
              label="Hotel"
              detail={`${formatCurrency(hotelUnitPrice)} per night x ${stayDays} ${stayDays === 1 ? "night" : "nights"}`}
              value={formatCurrency(hotelTotal)}
            />
            <SummaryRow
              label="Car"
              detail={`${formatCurrency(carUnitPrice)} per day x ${stayDays} ${stayDays === 1 ? "day" : "days"}`}
              value={formatCurrency(carTotal)}
            />
          </>
        ) : null}
      </div>
      <div className={`rounded-[24px] bg-slate-50 ${compact ? "mt-5 p-3" : "mt-6 p-4"}`}>
        <SummaryRow label="Estimated total" value={formatCurrency(total)} emphasized />
      </div>
    </aside>
  );
}

function buildStepLinks(search, { flightId = null, returnFlightId = null, hotelId = null, carId = null } = {}) {
  const requiresReturnFlight = search.tripType === "roundtrip";
  const isMultiCity = search.tripType === "multicity";
  const isHotelOnly = search.tripType === "hotel-only";
  const isCarOnly = search.tripType === "car-only";
  const hasFlightSelection = Boolean(flightId);
  const hasRequiredFlightSelection = hasFlightSelection && (!requiresReturnFlight || returnFlightId);

  return {
    flights: `/flight-results?${buildBookingQuery({ search, flightId, returnFlightId })}`,
    hotel:
      isHotelOnly
        ? `/hotel-deals?${buildBookingQuery({ search, hotelId })}`
        : isCarOnly || isMultiCity || !hasRequiredFlightSelection
        ? ""
        : `/hotel-selection?${buildBookingQuery({ search, flightId, returnFlightId, hotelId })}`,
    car:
      isCarOnly
        ? `/car-deals?${buildBookingQuery({ search, carId })}`
        : isHotelOnly || isMultiCity || !hasRequiredFlightSelection
        ? ""
        : `/car-rental?${buildBookingQuery({ search, flightId, returnFlightId, hotelId, carId })}`,
    summary:
      isCarOnly || isHotelOnly || isMultiCity || !hasRequiredFlightSelection
        ? ""
        : `/booking-summary?${buildBookingQuery({ search, flightId, returnFlightId, hotelId, carId })}`,
    payment:
      isHotelOnly
        ? hotelId
          ? `/payment?${buildBookingQuery({ search, hotelId })}`
          : ""
        : isCarOnly
          ? carId
            ? `/payment?${buildBookingQuery({ search, carId })}`
            : ""
        : isMultiCity
        ? hasRequiredFlightSelection
          ? `/payment?${buildBookingQuery({ search, flightId, returnFlightId })}`
          : ""
        : hasRequiredFlightSelection
          ? `/payment?${buildBookingQuery({ search, flightId, returnFlightId, hotelId, carId })}`
          : "",
  };
}

function OneWayUpsellPanel({ search, selectedFlightId }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <UpsellCard
        title="Book a hotel"
        description="Add a stay near your destination after confirming the one-way flight."
        href={`/hotel-selection?${buildBookingQuery({ search, flightId: selectedFlightId })}`}
        label="View hotels"
      />
      <UpsellCard
        title="Book a car"
        description="Need airport pickup or local mobility? Add a rental car next."
        href={`/car-rental?${buildBookingQuery({ search, flightId: selectedFlightId })}`}
        label="View cars"
      />
    </div>
  );
}

function MultiCityPrompt({ search }) {
  const firstSegment = search.multiCitySegments?.[0];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <UpsellCard
        title="Add a hotel for the stopover"
        description="Useful when there is a long gap between flights and you want rest near the city."
        href={`/hotel-selection?${buildBookingQuery({
          search: {
            ...search,
            to: firstSegment?.to || search.to,
          },
        })}`}
        label="Explore hotels"
      />
      <UpsellCard
        title="Add a local car"
        description="Good for airport transfer or short travel during the stopover city."
        href={`/car-rental?${buildBookingQuery({
          search: {
            ...search,
            to: firstSegment?.to || search.to,
          },
        })}`}
        label="Explore cars"
      />
    </div>
  );
}

function UpsellCard({ title, description, href, label }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      <SecondaryLink href={href}>{label}</SecondaryLink>
    </article>
  );
}

function hasMultiCityStopover(segments) {
  if (!Array.isArray(segments) || segments.length < 2) {
    return false;
  }

  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = new Date(segments[index].departure);
    const next = new Date(segments[index + 1].departure);

    if (Number.isNaN(current.getTime()) || Number.isNaN(next.getTime())) {
      continue;
    }

    const gapHours = (next.getTime() - current.getTime()) / (1000 * 60 * 60);
    if (gapHours > 12) {
      return true;
    }
  }

  return false;
}

function extractPassengerCount(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 1;
}

async function fetchMultiCityItineraries(segments) {
  const normalizedSegments = Array.isArray(segments) ? segments.filter((segment) => segment?.from && segment?.to && segment?.departure) : [];
  if (normalizedSegments.length === 0) {
    return [];
  }

  const legResults = await Promise.all(
    normalizedSegments.map(async (segment, segmentIndex) => {
      const flights = await fetchFlights({
        from: segment.from,
        to: segment.to,
        departure: segment.departure,
      });

      return flights.slice(0, 3).map((flight) => ({
        ...flight,
        segmentIndex,
        segmentLabel: `Flight ${segmentIndex + 1}`,
        fromLabel: segment.from,
        toLabel: segment.to,
        departureDate: segment.departure,
      }));
    })
  );

  if (legResults.some((leg) => leg.length === 0)) {
    return [];
  }

  const itineraries = [];
  const limit = 9;

  function walk(currentLegIndex, selectedLegs) {
    if (itineraries.length >= limit) {
      return;
    }

    if (currentLegIndex >= legResults.length) {
      const totalPrice = selectedLegs.reduce((sum, leg) => sum + Number(leg.price || 0), 0);
      const totalDurationMinutes = selectedLegs.reduce((sum, leg) => sum + Number(leg.durationMinutes || 0), 0);
      const carriers = Array.from(new Set(selectedLegs.map((leg) => leg.airline).filter(Boolean)));

      itineraries.push({
        id: selectedLegs.map((leg) => leg.id).join("__"),
        legs: selectedLegs,
        totalPrice,
        totalDurationMinutes,
        totalDurationDisplay: formatMinutesAsDuration(totalDurationMinutes),
        totalStopCount: selectedLegs.reduce((sum, leg) => sum + Number(leg.stopCount || 0), 0),
        primaryAirline: carriers[0] || "SkyBook Air",
        airlineSummary: carriers.length === 1 ? carriers[0] : `${carriers[0]} +${carriers.length - 1}`,
      });
      return;
    }

    for (const option of legResults[currentLegIndex]) {
      walk(currentLegIndex + 1, [...selectedLegs, option]);
      if (itineraries.length >= limit) {
        break;
      }
    }
  }

  walk(0, []);

  const cheapestPrice = itineraries.reduce((min, itinerary) => Math.min(min, itinerary.totalPrice), Number.POSITIVE_INFINITY);
  const fastestMinutes = itineraries.reduce(
    (min, itinerary) => Math.min(min, itinerary.totalDurationMinutes),
    Number.POSITIVE_INFINITY
  );

  return itineraries
    .sort((left, right) => left.totalPrice - right.totalPrice)
    .map((itinerary, index) => ({
      ...itinerary,
      badge:
        itinerary.totalPrice === cheapestPrice
          ? "Best value"
          : itinerary.totalDurationMinutes === fastestMinutes
            ? "Fastest"
            : index === 0
              ? "Recommended"
              : null,
    }));
}

function formatMinutesAsDuration(value) {
  const minutes = Number(value || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) {
    return `${remainder}m`;
  }
  if (!remainder) {
    return `${hours}h`;
  }
  return `${hours}h ${remainder}m`;
}

function mapItineraryBudgetFlight(itinerary) {
  if (!itinerary) {
    return null;
  }

  return {
    airline: itinerary.airlineSummary || itinerary.primaryAirline || "Itinerary",
    code: `${itinerary.legs?.length || 0} legs`,
    departure: itinerary.legs?.[0]?.departure || "--:--",
    arrival: itinerary.legs?.[itinerary.legs.length - 1]?.arrival || "--:--",
    duration: itinerary.totalDurationDisplay || "TBD",
    price: itinerary.totalPrice || 0,
  };
}

function summarizeStopOptions(flights, tripType) {
  const prices = { all: [], nonstop: [], stops: [] };

  flights.forEach((flight) => {
    const price = tripType === "multicity" ? Number(flight.totalPrice || 0) : Number(flight.price || 0);
    const stopCount = tripType === "multicity" ? Number(flight.totalStopCount || 0) : Number(flight.stopCount || 0);
    prices.all.push(price);
    if (stopCount === 0) {
      prices.nonstop.push(price);
    } else {
      prices.stops.push(price);
    }
  });

  return [
    {
      value: "all",
      label: "Any",
      meta: prices.all.length ? `from ${formatCurrency(Math.min(...prices.all))}` : "No results",
    },
    {
      value: "nonstop",
      label: "Direct",
      meta: prices.nonstop.length ? `from ${formatCurrency(Math.min(...prices.nonstop))}` : "No direct routes",
    },
    {
      value: "stops",
      label: tripType === "multicity" ? "With connections" : "1+ stop",
      meta: prices.stops.length ? `from ${formatCurrency(Math.min(...prices.stops))}` : "No connected routes",
    },
  ];
}

function getDepartureLabels(search, tripType) {
  if (tripType === "multicity" && Array.isArray(search.multiCitySegments) && search.multiCitySegments.length > 0) {
    return search.multiCitySegments.map(
      (segment) => `${segment.from || "Departure"} - ${segment.to || "Arrival"}`
    );
  }

  return [`${search.from || "Departure"} - ${search.to || "Arrival"}`];
}

function MultiCityItineraryCard({ itinerary, index, selected, onSelect }) {
  return (
    <article
      className={`overflow-hidden rounded-[30px] border bg-white shadow-sm transition ${
        selected ? "border-[#173a7a] ring-2 ring-[#173a7a]/10" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#173a7a] text-sm font-semibold text-white">
            {(itinerary.primaryAirline || "SK").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">{itinerary.airlineSummary}</p>
            <p className="text-sm text-slate-500">
              {itinerary.legs.length} flights · {itinerary.totalDurationDisplay} total travel time
            </p>
          </div>
        </div>
        {itinerary.badge ? (
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
              itinerary.badge === "Best value"
                ? "bg-emerald-50 text-emerald-700"
                : itinerary.badge === "Fastest"
                  ? "bg-sky-50 text-sky-700"
                  : "bg-orange-50 text-orange-700"
            }`}
          >
            {itinerary.badge}
          </span>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Option {index + 1}
          </span>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="divide-y divide-slate-200">
          {itinerary.legs.map((leg, legIndex) => (
            <div
              key={`${leg.id || "leg"}-${legIndex}-${leg.segmentLabel || ""}-${leg.departure || ""}`}
              className="grid gap-4 px-5 py-5 md:grid-cols-[120px_1fr_120px] md:items-center"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {leg.segmentLabel}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{leg.airline}</p>
                <p className="text-xs text-slate-500">{leg.code}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <div className="min-w-0">
                  <p className="text-2xl font-semibold leading-none text-slate-900">{leg.departure}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{leg.fromLabel}</p>
                </div>
                <div className="flex flex-col items-center text-slate-400">
                  <p className="text-xs font-medium text-slate-500">{leg.duration}</p>
                  <div className="mt-2 h-px w-20 bg-slate-300 md:w-24" />
                  <p className="mt-2 text-xs font-medium text-sky-700">{leg.stops}</p>
                </div>
                <div className="min-w-0 text-left md:text-right">
                  <p className="text-2xl font-semibold leading-none text-slate-900">{leg.arrival}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{leg.toLabel}</p>
                </div>
              </div>

              <div className="text-left md:text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Leg price
                </p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(leg.price || 0)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col justify-between border-t border-slate-200 bg-slate-50 px-5 py-5 lg:border-l lg:border-t-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Complete itinerary
            </p>
            <p className="mt-3 text-sm text-slate-600">
              {itinerary.totalStopCount === 0 ? "All direct flights" : `${itinerary.totalStopCount} total stop${itinerary.totalStopCount === 1 ? "" : "s"}`}
            </p>
            <p className="mt-5 text-sm text-slate-500">Combined price from</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(itinerary.totalPrice)}
            </p>
          </div>

          <button
            onClick={onSelect}
            className={`mt-6 inline-flex min-h-12 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
              selected
                ? "bg-[#173a7a] text-white"
                : "bg-orange-500 text-white hover:bg-orange-600"
            }`}
          >
            {selected ? "Selected itinerary" : "Select itinerary"}
          </button>
        </div>
      </div>
    </article>
  );
}
