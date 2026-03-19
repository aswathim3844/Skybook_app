"use client";

import { useEffect, useState } from "react";
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
  fetchHotels,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatCurrency, getTripDuration } from "@/lib/mock-data";
import { useSavedStore } from "@/lib/saved-store";

export function FlightResultsScreen({ initialParams }) {
  const router = useRouter();
  const { search, selectedFlightId, selectFlight } = useBookingSnapshot(initialParams);
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    airline: "all",
    sortBy: "price-asc",
    departureWindow: "all",
    maxPrice: "",
  });
  const toggleSavedFlight = useSavedStore((state) => state.toggleSavedFlight);
  const isFlightSaved = useSavedStore((state) => state.isFlightSaved);
  const duration = getTripDuration(search.departure, search.returnDate);
  const tripType = search.tripType || "roundtrip";
  const multiCitySegments = search.multiCitySegments || [];
  const hasLongStopover = hasMultiCityStopover(multiCitySegments);

  useEffect(() => {
    let active = true;

    async function loadFlights() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchFlights(search);
        if (active) {
          setFlights(data);
        }
      } catch (err) {
        if (active) {
          setError("Could not load flights from the backend.");
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
  }, [search]);

  const airlineOptions = Array.from(new Set(flights.map((flight) => flight.airline))).filter(
    Boolean
  );

  const activeFlights = flights
    .filter((flight) => {
      if (filters.airline !== "all" && flight.airline !== filters.airline) {
        return false;
      }

      if (filters.maxPrice && flight.price > Number(filters.maxPrice)) {
        return false;
      }

      if (filters.departureWindow !== "all") {
        const hour = Number(flight.departure.split(":")[0] || 0);

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

  const defaultFlightId = activeFlights[0]?.id || null;

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="flights" /> : null}
      <PageHero
        eyebrow="Flight Results"
        title={
          tripType === "multicity"
            ? "Multi-city flight options"
            : `Flights from ${search.from} to ${search.to}`
        }
        description={
          tripType === "roundtrip"
            ? `Showing PostgreSQL-backed results for ${search.departure} to ${search.returnDate}. Passengers: ${search.passengers}.`
            : tripType === "oneway"
              ? `One-way results for ${search.departure}. Passengers: ${search.passengers}.`
              : `Review flight options for ${multiCitySegments.length} connected legs.`
        }
        actions={<SecondaryLink href="/search-flights">Edit search</SecondaryLink>}
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          {tripType === "roundtrip" ? (
            <>
              <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Trip length</p>
              <p className="mt-3 text-4xl font-semibold">{duration || 1} days</p>
              <p className="mt-3 text-sm leading-6 text-blue-100/85">
                Flights are now loaded from your Django API and PostgreSQL database.
              </p>
            </>
          ) : tripType === "oneway" ? (
            <>
              <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Trip type</p>
              <p className="mt-3 text-4xl font-semibold">One way</p>
              <p className="mt-3 text-sm leading-6 text-blue-100/85">
                Book a single flight first, then optionally add hotel or car help.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Flight legs</p>
              <p className="mt-3 text-4xl font-semibold">{multiCitySegments.length}</p>
              <p className="mt-3 text-sm leading-6 text-blue-100/85">
                We can suggest hotel or car help for long stopovers between flights.
              </p>
            </>
          )}
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-12">
        <div>
      <PageSection eyebrow="Results" title="Available flights" className="px-0 py-0">
        {loading ? <InfoPanel text="Loading flights from database..." /> : null}
        {error ? <ErrorPanel text={error} /> : null}
        {!loading && !error && flights.length > 0 ? (
          <FlightFilterBar
            filters={filters}
            setFilters={setFilters}
            airlineOptions={airlineOptions}
          />
        ) : null}
        {!loading && !error && activeFlights.length === 0 ? (
          <InfoPanel text="No flights matched your current filters. Try another airline, price, or departure window." />
        ) : null}
        <div className="space-y-4">
          {activeFlights.map((flight) => (
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
                    `/hotel-selection?${buildBookingQuery({
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

        <BudgetSidebar
          tripType={tripType}
          flight={activeFlights.find((flight) => flight.id === selectedFlightId) || activeFlights[0]}
          hotel={null}
          car={null}
          duration={duration}
        />
      </section>

      {tripType === "roundtrip" && duration > 1 ? (
        <TripRecommendationsSection
          search={search}
          selectedFlightId={selectedFlightId || defaultFlightId}
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

      {tripType === "multicity" ? (
        <PageSection
          eyebrow="Stopover Help"
          title={hasLongStopover ? "Long stopover detected" : "Connected itinerary support"}
          description={
            hasLongStopover
              ? "There is a long gap between flights. We can help with a hotel or local car during the stopover."
              : "If you want, you can still add hotel or car help for any city in the route."
          }
        >
          <MultiCityPrompt search={search} />
        </PageSection>
      ) : null}

      <SiteFooter />
    </>
  );
}

export function HotelSelectionScreen({ initialParams }) {
  const router = useRouter();
  const { search, selectedFlightId, selectedHotelId, selectHotel, selectedFlight } =
    useBookingSnapshot(initialParams);
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const toggleSavedHotel = useSavedStore((state) => state.toggleSavedHotel);
  const isHotelSaved = useSavedStore((state) => state.isHotelSaved);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const tripType = search.tripType || "roundtrip";

  useEffect(() => {
    let active = true;

    async function loadHotels() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchHotels(search);
        if (active) {
          setHotels(data);
        }
      } catch (err) {
        if (active) {
          setError("Could not load hotels from the backend.");
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
  }, [search]);

  const activeHotel = hotels.find((hotel) => hotel.id === selectedHotelId) || hotels[0];
  const safeFlight = selectedFlight;

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="hotel" /> : null}
      <PageHero
        eyebrow="Hotel Selection"
        title="Choose a hotel to complete the trip"
        description="This step keeps the user focused on one choice at a time while loading real hotel data from PostgreSQL."
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

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-12">
        <div>
          <PageSection title="Recommended Hotels" className="px-0 py-0">
            {loading ? <InfoPanel text="Loading hotels from database..." /> : null}
            {error ? <ErrorPanel text={error} /> : null}
            {!loading && !error && hotels.length === 0 ? (
              <InfoPanel text="No hotels matched this city in your database." />
            ) : null}
            <div className="grid gap-5 md:grid-cols-2">
              {hotels.map((hotel) => (
                <ProductCard
                  key={hotel.id}
                  item={hotel}
                  buttonLabel={selectedHotelId === hotel.id ? "Selected" : "Select hotel"}
                  isSaved={isHotelSaved(hotel.id)}
                  onToggleSave={() => toggleSavedHotel(hotel)}
                  onSelect={() => {
                    selectHotel(hotel);
                    router.push(
                      `/car-rental?${buildBookingQuery({
                        search,
                        flightId: selectedFlightId || safeFlight.id,
                        hotelId: hotel.id,
                      })}`
                    );
                  }}
                />
              ))}
            </div>
          </PageSection>
        </div>

        <SummaryPanel
          flight={safeFlight}
          hotel={activeHotel}
          total={safeFlight.price + (activeHotel?.pricePerDay || 0) * duration}
          ctaHref={`/car-rental?${buildBookingQuery({
            search,
            flightId: selectedFlightId || safeFlight.id,
            hotelId: selectedHotelId || activeHotel?.id,
          })}`}
          ctaLabel="Continue to cars"
          description="This summary now reflects the real hotel list returned by the backend."
        />
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
    selectedHotelId,
    selectedCarId,
    selectCar,
    selectedFlight,
    selectedHotel,
  } = useBookingSnapshot(initialParams);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const toggleSavedCar = useSavedStore((state) => state.toggleSavedCar);
  const isCarSaved = useSavedStore((state) => state.isCarSaved);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const tripType = search.tripType || "roundtrip";

  useEffect(() => {
    let active = true;

    async function loadCars() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchCars(search);
        if (active) {
          setCars(data);
        }
      } catch (err) {
        if (active) {
          setError("Could not load cars from the backend.");
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
  }, [search]);

  const activeCar = cars.find((car) => car.id === selectedCarId) || cars[0];
  const total =
    selectedFlight.price +
    (selectedHotel?.pricePerDay || 0) * duration +
    (activeCar?.pricePerDay || 0) * duration;

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="car" /> : null}
      <PageHero
        eyebrow="Car Rental"
        title="Add a rental car if the trip needs local mobility"
        description="Cars are now fetched from your Django API using the trip destination as the lookup."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Current package</p>
          <p className="mt-3 text-2xl font-semibold">{selectedHotel?.name || "Selected hotel"}</p>
          <p className="mt-2 text-sm text-blue-100/85">
            {duration} days | {selectedFlight.airline} flight already selected
          </p>
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-12">
        <div>
          <PageSection title="Available Rental Cars" className="px-0 py-0">
            {loading ? <InfoPanel text="Loading cars from database..." /> : null}
            {error ? <ErrorPanel text={error} /> : null}
            {!loading && !error && cars.length === 0 ? (
              <InfoPanel text="No cars matched this city in your database." />
            ) : null}
            <div className="grid gap-5 md:grid-cols-2">
              {cars.map((item) => (
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

        <SummaryPanel
          flight={selectedFlight}
          hotel={selectedHotel}
          car={activeCar}
          total={total}
          ctaHref={`/booking-summary?${buildBookingQuery({
            search,
            flightId: selectedFlightId || selectedFlight.id,
            hotelId: selectedHotelId || selectedHotel?.id,
            carId: selectedCarId || activeCar?.id,
          })}`}
          ctaLabel="Review booking"
        />
      </section>

      <SiteFooter />
    </>
  );
}

export function BookingSummaryScreen({ initialParams }) {
  const {
    search,
    selectedFlightId,
    selectedHotelId,
    selectedCarId,
    selectedFlight,
    selectedHotel,
    selectedCar,
  } = useBookingSnapshot(initialParams);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const hotelTotal = (selectedHotel?.pricePerDay || 0) * duration;
  const carTotal = (selectedCar?.pricePerDay || 0) * duration;
  const total = selectedFlight.price + hotelTotal + carTotal;
  const tripType = search.tripType || "roundtrip";

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="summary" /> : null}
      <PageHero
        eyebrow="Booking Summary"
        title="Review the final package before payment"
        description="This summary is now built from the selections loaded out of the shared booking state and database-backed lists."
      >
        <SummaryPanel
          flight={selectedFlight}
          hotel={selectedHotel}
          car={selectedCar}
          total={total}
          ctaHref={`/payment?${buildBookingQuery({
            search,
            flightId: selectedFlightId || selectedFlight.id,
            hotelId: selectedHotelId || selectedHotel?.id,
            carId: selectedCarId || selectedCar?.id,
          })}`}
          ctaLabel="Confirm Booking"
          title="Trip package summary"
          description={`Hotel and car totals are multiplied by ${duration} days.`}
        />
      </PageHero>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 sm:px-8 lg:grid-cols-3 lg:px-12">
        <SummaryCard
          label="Selected Flight"
          title={selectedFlight.airline}
          detail={`${selectedFlight.departure} to ${selectedFlight.arrival} | ${selectedFlight.duration}`}
        />
        <SummaryCard
          label="Selected Hotel"
          title={selectedHotel?.name || "No hotel"}
          detail={`${selectedHotel?.rating || 0} rating | ${duration} nights`}
        />
        <SummaryCard
          label="Selected Car"
          title={selectedCar?.name || "No car"}
          detail={selectedCar?.type || "No car selected"}
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
    selectedFlight,
    selectedHotel,
    selectedCar,
    resetBooking,
  } = useBookingSnapshot(initialParams);
  const duration = Math.max(getTripDuration(search.departure, search.returnDate), 1);
  const tripType = search.tripType || "roundtrip";
  const total =
    selectedFlight.price +
    (selectedHotel?.pricePerDay || 0) * duration +
    (selectedCar?.pricePerDay || 0) * duration;
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

    try {
      setSubmitting(true);
      setError("");
      await createBooking({
        customer: customer?.customer_id || null,
        flight: selectedFlight?.id,
        hotel: selectedHotel?.id,
        car: selectedCar?.id,
        outbound_date: search.departure,
        return_date: search.returnDate || search.departure,
        trip_days: duration,
        total_price: total,
        passengers: extractPassengerCount(search.passengers),
        seat_class: "Economy",
      });
      resetBooking();
      router.push("/my-bookings?confirmed=true");
    } catch (err) {
      setError("Could not create booking in the backend.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {tripType === "roundtrip" ? <BookingProgress currentStep="payment" /> : null}
      <PageHero
        eyebrow="Payment"
        title="Complete payment"
        description="This step now creates a real booking row in PostgreSQL through the Django API."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Amount due</p>
          <p className="mt-3 text-4xl font-semibold">{formatCurrency(total)}</p>
          <p className="mt-2 text-sm text-blue-100/85">
            Use this to verify end-to-end booking creation.
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
            />
            <Input
              label="Card number"
              placeholder="1234 5678 9012 3456"
              value={paymentForm.cardNumber}
              onChange={(event) => handleFieldChange("cardNumber", event.target.value)}
              error={fieldErrors.cardNumber}
            />
            <Input
              label="Expiry"
              placeholder="MM/YY"
              value={paymentForm.expiry}
              onChange={(event) => handleFieldChange("expiry", event.target.value)}
              error={fieldErrors.expiry}
            />
            <Input
              label="CVV"
              placeholder="123"
              value={paymentForm.cvv}
              onChange={(event) => handleFieldChange("cvv", event.target.value)}
              error={fieldErrors.cvv}
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
              />
            </div>
          </div>
          {error ? <ErrorPanel text={error} className="mt-4" /> : null}
          <button
            onClick={handlePayment}
            disabled={submitting}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating booking..." : "Pay now"}
          </button>
        </article>

        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Order summary</p>
          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <SummaryRow label={`${selectedFlight.airline} flight`} value={formatCurrency(selectedFlight.price)} />
            <SummaryRow
              label={`${selectedHotel?.name || "Hotel"} x ${duration} days`}
              value={formatCurrency((selectedHotel?.pricePerDay || 0) * duration)}
            />
            <SummaryRow
              label={`${selectedCar?.name || "Car"} x ${duration} days`}
              value={formatCurrency((selectedCar?.pricePerDay || 0) * duration)}
            />
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
}) {
  const router = useRouter();
  const [hotels, setHotels] = useState([]);
  const [cars, setCars] = useState([]);
  const toggleSavedHotel = useSavedStore((state) => state.toggleSavedHotel);
  const isHotelSaved = useSavedStore((state) => state.isHotelSaved);
  const toggleSavedCar = useSavedStore((state) => state.toggleSavedCar);
  const isCarSaved = useSavedStore((state) => state.isCarSaved);

  useEffect(() => {
    let active = true;

    async function loadRecommendations() {
      try {
        const [hotelData, carData] = await Promise.all([
          fetchHotels(search),
          fetchCars(search),
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
  }, [search]);

  return (
    <PageSection
      eyebrow="Complete Your Trip"
      title="Recommended hotels and rental cars"
      description="These recommendation cards are also reading from your PostgreSQL data."
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
                    `/hotel-selection?${buildBookingQuery({
                      search,
                      flightId: selectedFlightId,
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
                    `/car-rental?${buildBookingQuery({
                      search,
                      flightId: selectedFlightId,
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
  const selectedHotelId = useBookingStore((state) => state.selectedHotelId);
  const selectedCarId = useBookingStore((state) => state.selectedCarId);
  const selectedFlight = useBookingStore((state) => state.selectedFlight);
  const selectedHotel = useBookingStore((state) => state.selectedHotel);
  const selectedCar = useBookingStore((state) => state.selectedCar);
  const selectFlight = useBookingStore((state) => state.selectFlight);
  const selectHotel = useBookingStore((state) => state.selectHotel);
  const selectCar = useBookingStore((state) => state.selectCar);
  const resetBooking = useBookingStore((state) => state.resetBooking);

  const search = {
    ...defaultBookingSearch,
    ...searchState,
    ...(initialParams?.from ? { from: initialParams.from } : {}),
    ...(initialParams?.to ? { to: initialParams.to } : {}),
    ...(initialParams?.departure ? { departure: initialParams.departure } : {}),
    ...(initialParams?.return ? { returnDate: initialParams.return } : {}),
    ...(initialParams?.passengers ? { passengers: initialParams.passengers } : {}),
  };

  const fallbackFlight = {
    id: selectedFlightId || initialParams?.flight || "0",
    airline: "Selected flight",
    code: `FL ${selectedFlightId || initialParams?.flight || ""}`,
    departure: "--:--",
    arrival: "--:--",
    duration: "TBD",
    price: 0,
  };

  const fallbackHotel = {
    id: selectedHotelId || initialParams?.hotel || "0",
    name: "Selected hotel",
    rating: 0,
    pricePerDay: 0,
  };

  const fallbackCar = {
    id: selectedCarId || initialParams?.car || "0",
    name: "Selected car",
    type: "No car details yet",
    pricePerDay: 0,
  };

  return {
    search,
    selectedFlightId: initialParams?.flight || selectedFlightId || null,
    selectedHotelId: initialParams?.hotel || selectedHotelId || null,
    selectedCarId: initialParams?.car || selectedCarId || null,
    selectedFlight: selectedFlight || fallbackFlight,
    selectedHotel: selectedHotel || fallbackHotel,
    selectedCar: selectedCar || fallbackCar,
    selectFlight,
    selectHotel,
    selectCar,
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

function SummaryRow({ label, value, emphasized = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className={emphasized ? "font-semibold text-slate-900" : ""}>{label}</span>
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

function SummaryCard({ label, title, detail }) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">{label}</p>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

function InfoPanel({ text }) {
  return <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">{text}</div>;
}

function ErrorPanel({ text, className = "" }) {
  return <div className={`rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-700 ${className}`}>{text}</div>;
}

function BudgetSidebar({ tripType, flight, hotel, car, duration }) {
  const total =
    (flight?.price || 0) +
    (hotel?.pricePerDay || 0) * Math.max(duration || 1, 1) +
    (car?.pricePerDay || 0) * Math.max(duration || 1, 1);

  return (
    <aside className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
        Budget Snapshot
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-slate-900">
        {tripType === "roundtrip" ? "Current trip total" : "Current flight budget"}
      </h3>
      <div className="mt-6 space-y-4 text-sm text-slate-600">
        <SummaryRow label="Flight" value={formatCurrency(flight?.price || 0)} />
        <SummaryRow
          label="Hotel"
          value={formatCurrency((hotel?.pricePerDay || 0) * Math.max(duration || 1, 1))}
        />
        <SummaryRow
          label="Car"
          value={formatCurrency((car?.pricePerDay || 0) * Math.max(duration || 1, 1))}
        />
      </div>
      <div className="mt-6 rounded-[24px] bg-slate-50 p-4">
        <SummaryRow label="Estimated total" value={formatCurrency(total)} emphasized />
      </div>
    </aside>
  );
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
