"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CarFront,
  ChevronDown,
  CheckCircle2,
  Hotel,
  LoaderCircle,
  MessageCircle,
  PlaneTakeoff,
  SendHorizontal,
  Star,
  WandSparkles,
} from "lucide-react";
import {
  createBooking,
  createPlannerSession,
  fetchAllCars,
  fetchFlightLocations,
  fetchFlightRoutes,
  fetchHotelOffer,
  fetchPlannerSessions,
  fetchPlannerSession,
  fetchProviderStatus,
  enrichPlannerDraft,
  generatePlannerSessionPlan,
  revalidatePlannerDraft,
  retrieveBooking,
  sendPlannerSessionMessage,
  updatePlannerDraft,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatCurrency } from "@/lib/mock-data";

const TRIP_TYPES = [
  "Beach & Relaxation",
  "Adventure & Activities",
  "Family Trip",
  "Business Travel",
  "Luxury",
  "Cultural Exploration",
  "Honeymoon",
];

const QUICK_CHIPS = [
  "Do I need a visa for Dubai?",
  "Best time to visit London?",
  "What currency for Tokyo?",
  "What to pack for a beach trip?",
  "SkyBook baggage allowance?",
  "How do I cancel my booking?",
];

const HOTEL_STYLES = ["Any", "Budget", "Standard", "Luxury", "Family Friendly", "Business"];
const HOTEL_AMENITIES = ["Breakfast", "Pool", "WiFi", "Airport Transfer"];
const AIRLINE_OPTIONS = ["Any", "Emirates", "Qatar Airways", "IndiGo", "Air India", "Lufthansa"];
const HOTEL_RATINGS = ["Any", "3+", "4+", "4.5+"];

const inputClassName =
  "min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-[#173a7a] focus:ring-4 focus:ring-[#173a7a]/10";

export default function AIPlannerExperience() {
  const customer = useAuthStore((state) => state.customer);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Tell me where you want to go, what matters most, or ask about visa, weather, baggage, and cancellations. I will help shape the trip before you search.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [showQuickChips, setShowQuickChips] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [activeTab, setActiveTab] = useState("flights");
  const [confirmation, setConfirmation] = useState(null);
  const [lookupReference, setLookupReference] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [plannerSessionId, setPlannerSessionId] = useState(null);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [revalidationState, setRevalidationState] = useState(null);
  const [confirmingBooking, setConfirmingBooking] = useState(false);
  const [providerStatus, setProviderStatus] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [locationOptions, setLocationOptions] = useState([]);
  const [routeOptions, setRouteOptions] = useState([]);
  const [carTypeOptions, setCarTypeOptions] = useState(["Any"]);
  const [selectedOutboundFlightId, setSelectedOutboundFlightId] = useState(null);
  const [selectedReturnFlightId, setSelectedReturnFlightId] = useState(null);
  const [selectedHotelId, setSelectedHotelId] = useState(null);
  const [selectedCarId, setSelectedCarId] = useState(null);
  const [results, setResults] = useState({
    outbound: [],
    returnFlights: [],
    hotels: [],
    cars: [],
  });
  const [plannerInsights, setPlannerInsights] = useState({
    itinerary: [],
    visaInfo: "",
    baggageInfo: "",
    destinationBrief: "",
    qualityScore: null,
    pricing: null,
  });
  const [form, setForm] = useState({
    name: customer?.name || "Traveler",
    email: customer?.email || "traveler@example.com",
    origin: "",
    destination: "",
    departureDate: "",
    returnDate: "",
    passengers: 1,
    seatClass: "Economy",
    airline: "Any",
    budget: 3000,
    tripType: "Cultural Exploration",
    hotelStyle: "Any",
    hotelAmenities: ["Breakfast"],
    hotelRating: "Any",
    carType: "Any",
    carSeats: 4,
  });
  const plannerLocationOptions = useMemo(
    () =>
      locationOptions.map((location) => {
        const parts = [
          location.city,
          location.country,
          location.city_code ? `(${location.city_code})` : "",
        ].filter(Boolean);
        const label = location.label || parts.join(", ").replace(", (", " (");

        return {
          value: label,
          label,
        };
      }),
    [locationOptions],
  );
  const locationTokensFor = useMemo(
    () => (location) =>
      [
        location?.label,
        location?.city,
        location?.city_code,
        `${location?.city || ""}, ${location?.country || ""}`.replace(/,\s*$/, ""),
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    [],
  );
  const plannerRouteMap = useMemo(() => {
    const map = new Map();

    routeOptions.forEach((origin) => {
      locationTokensFor(origin).forEach((token) => {
        map.set(token, origin.destinations || []);
      });
    });

    return map;
  }, [locationTokensFor, routeOptions]);
  const destinationLocationOptions = useMemo(() => {
    const origin = String(form.origin || "").trim().toLowerCase();
    const routeDestinations = getPlannerDestinationOptionsForValue(
      form.origin,
      plannerRouteMap,
      locationOptions,
      locationTokensFor,
    );
    const baseOptions = routeDestinations.length > 0 ? routeDestinations : locationOptions;

    if (!origin) {
      return baseOptions;
    }

    return baseOptions.filter((location) => !locationTokensFor(location).includes(origin));
  }, [form.origin, locationOptions, locationTokensFor, plannerRouteMap]);
  const plannerDestinationOptions = useMemo(
    () =>
      destinationLocationOptions.map((location) => ({
        value: formatLocationLabel(location),
        label: formatLocationLabel(location),
      })),
    [destinationLocationOptions],
  );

  useEffect(() => {
    const today = new Date();
    const departure = new Date(today);
    departure.setDate(today.getDate() + 14);
    const returning = new Date(departure);
    returning.setDate(departure.getDate() + 5);

    setForm((current) => ({
      ...current,
      name: customer?.name || current.name,
      email: customer?.email || current.email,
      departureDate: current.departureDate || toDateInputValue(departure),
      returnDate: current.returnDate || toDateInputValue(returning),
    }));
  }, [customer?.email, customer?.name]);

  useEffect(() => {
    let active = true;

    async function loadCarTypes() {
      try {
        const cars = await fetchAllCars();
        if (!active) {
          return;
        }

        const nextTypes = Array.from(
          new Set(
            cars
              .map((car) => String(car.type || "").split("|")[0].trim())
              .filter(Boolean)
          )
        ).sort((left, right) => left.localeCompare(right));

        setCarTypeOptions(["Any", ...nextTypes]);
      } catch {
        if (active) {
          setCarTypeOptions(["Any"]);
        }
      }
    }

    loadCarTypes();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function enrichPlannerHotels() {
      if (!results.hotels.length || !form.departureDate || !form.returnDate) {
        return;
      }

      const needsPricing = results.hotels.some(
        (hotel) =>
          !hotel.offer_enriched &&
          (Boolean(hotel.pricing_pending || hotel.is_discovery_result) || getHotelNightlyRate(hotel) <= 0),
      );

      if (!needsPricing) {
        return;
      }

      const candidates = results.hotels.slice(0, 3);
      const pricedHotels = await Promise.all(
        candidates.map(async (hotel) => {
          try {
            const offer = await fetchHotelOffer({
              hotel,
              city: form.destination,
              checkin_date: form.departureDate,
              checkout_date: form.returnDate,
              adults_number: Number(form.passengers || 1),
            });

            return {
              ...hotel,
              ...offer,
              offer_enriched: true,
              price_per_night:
                offer.price_per_night ||
                offer.price_confirmed ||
                hotel.price_per_night ||
                hotel.price ||
                "0",
              pricing_pending: Boolean(offer.pricing_pending),
              is_discovery_result: false,
              offer_lookup_required: false,
              price_display: offer.price_display || hotel.price_display || null,
              description: offer.offer_message || hotel.description,
            };
          } catch {
            return { ...hotel, offer_enriched: true };
          }
        }),
      );

      if (!active) {
        return;
      }

      setResults((current) => ({
        ...current,
        hotels: [...pricedHotels, ...current.hotels.slice(candidates.length)],
      }));
    }

    void enrichPlannerHotels();

    return () => {
      active = false;
    };
  }, [results.hotels, form.departureDate, form.returnDate, form.destination, form.passengers]);

  useEffect(() => {
    let active = true;

    async function loadSessionHistory() {
      try {
        const sessions = await fetchPlannerSessions(customer?.customer_id || null);
        if (active) {
          setSessionHistory(Array.isArray(sessions) ? sessions : []);
        }
      } catch {
        if (active) {
          setSessionHistory([]);
        }
      }
    }

    loadSessionHistory();

    return () => {
      active = false;
    };
  }, [customer?.customer_id, confirmation?.id]);

  useEffect(() => {
    let active = true;

    async function loadLocations() {
      try {
        const [locations, routes] = await Promise.all([
          fetchFlightLocations(),
          fetchFlightRoutes().catch(() => []),
        ]);
        if (!active) {
          return;
        }

        const nextLocations = Array.isArray(locations) ? locations : [];
        const nextRoutes = Array.isArray(routes) ? routes : [];
        setLocationOptions(nextLocations);
        setRouteOptions(nextRoutes);

        if (nextLocations.length > 0) {
          const firstOrigin =
            nextLocations.find((location) => location.city === "Mumbai") ||
            nextLocations[0];
          const originRouteDestinations = getPlannerDestinationOptionsForValue(
            formatLocationLabel(firstOrigin),
            buildPlannerRouteMap(nextRoutes, locationTokensFor),
            nextLocations,
            locationTokensFor,
          );
          const destinationPool = originRouteDestinations.length > 0 ? originRouteDestinations : nextLocations;
          const firstDestination =
            destinationPool.find((location) => location.city === "London") ||
            destinationPool.find(
              (location) =>
                formatLocationLabel(location).toLowerCase() !== formatLocationLabel(firstOrigin).toLowerCase(),
            ) ||
            destinationPool[0];

          setForm((current) => ({
            ...current,
            origin: current.origin || formatLocationLabel(firstOrigin),
            destination: current.destination || formatLocationLabel(firstDestination),
          }));
        }
      } catch {
        if (active) {
          setLocationOptions([]);
        }
      }
    }

    loadLocations();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      form.departureDate &&
      form.returnDate &&
      form.returnDate < form.departureDate
    ) {
      setForm((current) => ({
        ...current,
        returnDate: current.departureDate,
      }));
    }
  }, [form.departureDate, form.returnDate]);

  useEffect(() => {
    if (!form.origin) {
      return;
    }

    if (
      form.destination &&
      plannerDestinationOptions.length > 0 &&
      !plannerDestinationOptions.some(
        (location) => location.value.toLowerCase() === String(form.destination).trim().toLowerCase(),
      )
    ) {
      setForm((current) => ({
        ...current,
        destination: plannerDestinationOptions[0]?.value || "",
      }));
    }
  }, [form.destination, form.origin, plannerDestinationOptions]);

  useEffect(() => {
    let active = true;

    async function loadProviderStatus() {
      try {
        const status = await fetchProviderStatus();
        if (active) {
          setProviderStatus(status);
        }
      } catch {
        // Keep provider panel hidden when status endpoint is unavailable.
      }
    }

    loadProviderStatus();

    return () => {
      active = false;
    };
  }, []);

  const nights = useMemo(
    () => getNightCount(form.departureDate, form.returnDate),
    [form.departureDate, form.returnDate],
  );
  const selectedFlight =
    results.outbound.find((flight) => flight.flight_id === selectedOutboundFlightId) ||
    results.outbound[0] ||
    null;
  const selectedReturnFlight =
    results.returnFlights.find((flight) => flight.flight_id === selectedReturnFlightId) ||
    results.returnFlights[0] ||
    null;
  const selectedHotel =
    results.hotels.find((hotel) => hotel.hotel_id === selectedHotelId) ||
    results.hotels[0] ||
    null;
  const selectedCar =
    results.cars.find((car) => car.car_id === selectedCarId) ||
    results.cars[0] ||
    null;
  const pricing = useMemo(
    () => buildPricing(selectedFlight, selectedHotel, selectedCar, form, nights),
    [selectedFlight, selectedHotel, selectedCar, form, nights],
  );
  const hasAnyResults =
    results.outbound.length ||
    results.returnFlights.length ||
    results.hotels.length ||
    results.cars.length;

  async function ensurePlannerSession() {
    if (plannerSessionId) {
      return plannerSessionId;
    }

    const session = await createPlannerSession({
      customer_id: customer?.customer_id || null,
      title: `${form.destination || "Trip"} planner`,
      origin: form.origin,
      destination: form.destination,
      departure_date: form.departureDate,
      return_date: form.returnDate,
      passengers: form.passengers,
      budget: form.budget,
      trip_preferences: {
        tripType: form.tripType,
        seat_class: form.seatClass,
        airline: form.airline,
        hotel_style: form.hotelStyle,
        hotel_amenities: form.hotelAmenities,
        hotel_rating: form.hotelRating,
        car_type: form.carType,
        car_seats: form.carSeats,
      },
    });

    setPlannerSessionId(session.session_id);
    setSessionHistory((current) => [session, ...current.filter((item) => item.session_id !== session.session_id)]);

    if (Array.isArray(session.messages) && session.messages.length > 0) {
      setMessages(
        session.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      );
    }

    return session.session_id;
  }

  async function handleSend(messageOverride) {
    const content = (messageOverride ?? chatInput).trim();
    if (!content || chatLoading) return;

    const nextMessages = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setChatInput("");
    setShowQuickChips(false);
    setChatLoading(true);

    try {
      const sessionId = await ensurePlannerSession();
      const response = await sendPlannerSessionMessage(sessionId, {
        message: content,
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: response.reply },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            errorToMessage(error) ||
            "AI Planner could not answer that right now. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSearch(formOverride) {
    const activeForm = formOverride || form;
    setSearching(true);
    setSearchError("");
    setConfirmation(null);
    setRevalidationState(null);
    setActiveTab("flights");

    try {
      const sessionId = await ensurePlannerSession();
      const draft = await generatePlannerSessionPlan(sessionId, {
        origin: activeForm.origin,
        destination: activeForm.destination,
        departure_date: activeForm.departureDate,
        return_date: activeForm.returnDate,
        passengers: activeForm.passengers,
        budget: activeForm.budget,
        include_insights: false,
        preferences: {
          trip_type: activeForm.tripType,
          seat_class: activeForm.seatClass,
          airline: activeForm.airline,
          hotel_style: activeForm.hotelStyle,
          hotel_amenities: activeForm.hotelAmenities,
          hotel_rating: activeForm.hotelRating,
          car_type: activeForm.carType,
          car_seats: activeForm.carSeats,
        },
      });

      const session = await fetchPlannerSession(sessionId);
      if (Array.isArray(session.messages) && session.messages.length > 0) {
        setMessages(
          session.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        );
      }

      const outbound = Array.isArray(draft.flight_options) ? draft.flight_options : [];
      const returnFlights = Array.isArray(draft.return_flight_options)
        ? draft.return_flight_options
        : draft.selected_return_flight
          ? [draft.selected_return_flight]
          : [];
      const hotels = Array.isArray(draft.hotel_options) ? draft.hotel_options : [];
      const cars = Array.isArray(draft.car_options) ? draft.car_options : [];
      const metadata = draft.ai_metadata || {};

      setCurrentDraftId(draft.draft_id);
      setResults({ outbound, returnFlights, hotels, cars });
      setPlannerInsights({
        itinerary: Array.isArray(metadata.itinerary) ? metadata.itinerary : [],
        visaInfo: metadata.visa_info || "",
        baggageInfo: metadata.baggage_info || "",
        destinationBrief: metadata.destination_brief || "",
        qualityScore: metadata.quality_score || null,
        pricing: metadata.pricing || null,
      });
      setSelectedOutboundFlightId(draft.selected_flight?.flight_id || outbound[0]?.flight_id || null);
      setSelectedReturnFlightId(
        draft.selected_return_flight?.flight_id || returnFlights[0]?.flight_id || null,
      );
      setSelectedHotelId(draft.selected_hotel?.hotel_id || hotels[0]?.hotel_id || null);
      setSelectedCarId(draft.selected_car?.car_id || cars[0]?.car_id || null);

      if (!outbound.length && !returnFlights.length && !hotels.length && !cars.length) {
        setSearchError(
          "No results found yet. Try different dates, a different destination, or a higher budget.",
        );
      }

      void loadPlannerInsights(sessionId, draft.draft_id);
    } catch (error) {
      setSearchError(errorToMessage(error) || "AI Planner could not complete the search right now.");
    } finally {
      setSearching(false);
    }
  }

  async function handleConfirm() {
    if (!selectedFlight || !selectedHotel || !selectedCar || !plannerSessionId || !currentDraftId) return;

    setConfirmingBooking(true);
    setSearchError("");

    try {
      await updatePlannerDraft(plannerSessionId, currentDraftId, {
        selected_flight: selectedFlight,
        selected_return_flight: selectedReturnFlight,
        selected_hotel: selectedHotel,
        selected_car: selectedCar,
        budget: form.budget,
        summary: `Selected package for ${form.destination} from ${form.origin} for ${form.passengers} traveler(s).`,
      });

      const revalidatedDraft = await revalidatePlannerDraft(plannerSessionId, currentDraftId);
      setRevalidationState(revalidatedDraft.ai_metadata?.revalidation || null);

      if (revalidatedDraft.status !== "validated") {
        setSearchError(
          "This draft needs review before booking. Please refresh the package or adjust your selected options.",
        );
        return;
      }

      const response = await createBooking({
        name: form.name,
        email: form.email,
        flight: numericOrNull(selectedFlight.flight_id),
        return_flight: numericOrNull(selectedReturnFlight?.flight_id),
        hotel: numericOrNull(selectedHotel.hotel_id),
        car: numericOrNull(selectedCar.car_id),
        booking_metadata: {
          selected_flight: selectedFlight || null,
          selected_return_flight: selectedReturnFlight || null,
          selected_hotel: selectedHotel || null,
          selected_car: selectedCar || null,
          planner_session_id: plannerSessionId,
          planner_draft_id: currentDraftId,
        },
        check_in: form.departureDate,
        check_out: form.returnDate,
        nights,
        passengers: form.passengers,
        seat_class: form.seatClass,
        total_price: pricing.grandTotal,
      });

      setConfirmation(response);
      setLookupReference(response.booking_reference || "");
      setLookupResult(response);
      setLookupError("");
      persistPlannerLoyalty(response, pricing.grandTotal);
    } catch (error) {
      setSearchError(errorToMessage(error) || "We could not revalidate the current package. Please run the planner again and retry booking.");
    } finally {
      setConfirmingBooking(false);
    }
  }

  async function handleLookup() {
    if (!lookupReference.trim()) return;

    setLookupLoading(true);
    setLookupError("");

    try {
      const result = await retrieveBooking(lookupReference.trim().toUpperCase());
      setLookupResult(result);
      setLookupError("");
    } catch {
      setLookupResult(null);
      setLookupError("Booking not found. Use a reference like SNA000123.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function loadPlannerInsights(sessionId, draftId) {
    setInsightsLoading(true);

    try {
      const draft = await enrichPlannerDraft(sessionId, draftId);
      const metadata = draft.ai_metadata || {};

      setPlannerInsights({
        itinerary: Array.isArray(metadata.itinerary) ? metadata.itinerary : [],
        visaInfo: metadata.visa_info || "",
        baggageInfo: metadata.baggage_info || "",
        destinationBrief: metadata.destination_brief || "",
        qualityScore: metadata.quality_score || null,
        pricing: metadata.pricing || null,
      });
    } catch {
      // Keep the fast draft visible; insights can fail independently.
    } finally {
      setInsightsLoading(false);
    }
  }

  async function handleLoadSession(sessionId) {
    try {
      const session = await fetchPlannerSession(sessionId);
      setPlannerSessionId(session.session_id);
      setMessages(
        Array.isArray(session.messages) && session.messages.length > 0
          ? session.messages.map((message) => ({
              role: message.role,
              content: message.content,
            }))
          : [
              {
                role: "assistant",
                content:
                  "Tell me where you want to go, what matters most, or ask about visa, weather, baggage, and cancellations. I will help shape the trip before you search.",
              },
            ],
      );

      const latestDraft = Array.isArray(session.drafts) && session.drafts.length > 0 ? session.drafts[0] : null;
      setCurrentDraftId(latestDraft?.draft_id || null);
      setForm((current) => ({
        ...current,
        origin: session.origin || current.origin,
        destination: session.destination || current.destination,
        departureDate: session.departure_date || current.departureDate,
        returnDate: session.return_date || current.returnDate,
        passengers: session.passengers || current.passengers,
        budget: Number(session.budget || current.budget),
      }));

      if (latestDraft) {
        const outbound = Array.isArray(latestDraft.flight_options) ? latestDraft.flight_options : [];
        const returnFlights = Array.isArray(latestDraft.return_flight_options)
          ? latestDraft.return_flight_options
          : latestDraft.selected_return_flight
            ? [latestDraft.selected_return_flight]
            : [];
        const hotels = Array.isArray(latestDraft.hotel_options) ? latestDraft.hotel_options : [];
        const cars = Array.isArray(latestDraft.car_options) ? latestDraft.car_options : [];
        const metadata = latestDraft.ai_metadata || {};

        setResults({ outbound, returnFlights, hotels, cars });
        setPlannerInsights({
          itinerary: Array.isArray(metadata.itinerary) ? metadata.itinerary : [],
          visaInfo: metadata.visa_info || "",
          baggageInfo: metadata.baggage_info || "",
          destinationBrief: metadata.destination_brief || "",
          qualityScore: metadata.quality_score || null,
          pricing: metadata.pricing || null,
        });
        setSelectedOutboundFlightId(latestDraft.selected_flight?.flight_id || outbound[0]?.flight_id || null);
        setSelectedReturnFlightId(
          latestDraft.selected_return_flight?.flight_id || returnFlights[0]?.flight_id || null,
        );
        setSelectedHotelId(latestDraft.selected_hotel?.hotel_id || hotels[0]?.hotel_id || null);
        setSelectedCarId(latestDraft.selected_car?.car_id || cars[0]?.car_id || null);
      }
    } catch {
      setSearchError("We could not load that planner session right now.");
    }
  }

  return (
    <div className={`mx-auto max-w-[1680px] space-y-12 pb-28 ${chatOpen ? "2xl:pr-[26rem]" : ""}`}>
      <section>
        <section className="w-full rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.1)] sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_180px] xl:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                Plan Your Trip with AI
              </p>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-slate-900">
                Build the trip here
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                Our AI searches flights, hotels and cars together, then surfaces
                the strongest bundle for your route, budget, and trip style.
              </p>
            </div>
            {providerStatus ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-right xl:mt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Runtime Mode
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  Flights: {providerStatus.flight_provider}
                </p>
                <p className="text-sm text-slate-600">
                  Hotels: {providerStatus.hotel_provider}
                </p>
                <p className="text-sm text-slate-600">
                  Cars: {providerStatus.car_provider}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  RAG: {providerStatus.rag_configured ? "configured" : "fallback"}
                </p>
              </div>
            ) : null}

          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <FormField label="Flying From">
              <select
                value={form.origin}
                onChange={(event) =>
                  setForm((current) => ({ ...current, origin: event.target.value }))
                }
                className={inputClassName}
              >
                {plannerLocationOptions.length === 0 ? (
                  <option value="">Loading locations...</option>
                ) : null}
                {plannerLocationOptions.map((location) => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Flying To">
              <select
                value={form.destination}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    destination: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                {plannerDestinationOptions.length === 0 ? (
                  <option value="">Loading locations...</option>
                ) : null}
                {plannerDestinationOptions.map((location) => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Departure Date">
              <input
                type="date"
                min={toDateInputValue(new Date())}
                value={form.departureDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    departureDate: event.target.value,
                  }))
                }
                className={inputClassName}
              />
            </FormField>

            <FormField label="Return Date">
              <input
                type="date"
                min={form.departureDate || toDateInputValue(new Date())}
                value={form.returnDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    returnDate: event.target.value,
                  }))
                }
                className={inputClassName}
              />
            </FormField>

            <FormField label="Passengers">
              <input
                type="number"
                min="1"
                max="9"
                value={form.passengers}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    passengers: clampPassengers(event.target.value),
                  }))
                }
                className={inputClassName}
              />
            </FormField>

            <FormField label="Seat Class">
              <div className="grid grid-cols-2 gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-2">
                {["Economy", "Business"].map((seatClass) => (
                  <button
                    key={seatClass}
                    onClick={() => setForm((current) => ({ ...current, seatClass }))}
                    className={`min-h-11 rounded-[18px] px-4 text-sm font-semibold transition ${
                      form.seatClass === seatClass
                        ? "bg-orange-500 text-white shadow-[0_12px_24px_rgba(249,115,22,0.22)]"
                        : "bg-white text-slate-700"
                    }`}
                  >
                    {seatClass}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Airline Preference">
              <select
                value={form.airline}
                onChange={(event) =>
                  setForm((current) => ({ ...current, airline: event.target.value }))
                }
                className={inputClassName}
              >
                {AIRLINE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="mt-6">
            <FormField label="Total Budget">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <input
                  type="range"
                  min="500"
                  max="10000"
                  step="100"
                  value={form.budget}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      budget: Number(event.target.value),
                    }))
                  }
                  className="w-full accent-orange-500"
                />
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                  <span>{formatCurrency(500)}</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(form.budget)}
                  </span>
                  <span>{formatCurrency(10000)}</span>
                </div>
                <p className="mt-4 text-sm font-medium text-slate-700">
                  {describeBudget(form.budget)}
                </p>
              </div>
            </FormField>
          </div>

          <div className="mt-6">
            <FormField label="Trip Type">
              <select
                value={form.tripType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tripType: event.target.value }))
                }
                className={inputClassName}
              >
                {TRIP_TYPES.map((tripType) => (
                  <option key={tripType} value={tripType}>
                    {tripType}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <FormField label="Hotel Style">
              <select
                value={form.hotelStyle}
                onChange={(event) =>
                  setForm((current) => ({ ...current, hotelStyle: event.target.value }))
                }
                className={inputClassName}
              >
                {HOTEL_STYLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Hotel Amenity">
              <div className="grid grid-cols-2 gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                {HOTEL_AMENITIES.map((option) => {
                  const selected = form.hotelAmenities.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          hotelAmenities: current.hotelAmenities.includes(option)
                            ? current.hotelAmenities.filter((item) => item !== option)
                            : [...current.hotelAmenities, option],
                        }))
                      }
                      className={`min-h-11 rounded-[18px] px-4 text-sm font-semibold transition ${
                        selected
                          ? "bg-orange-500 text-white shadow-[0_12px_24px_rgba(249,115,22,0.22)]"
                          : "bg-white text-slate-700"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </FormField>

            <FormField label="Hotel Rating">
              <select
                value={form.hotelRating}
                onChange={(event) =>
                  setForm((current) => ({ ...current, hotelRating: event.target.value }))
                }
                className={inputClassName}
              >
                {HOTEL_RATINGS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Car Type">
              <select
                value={form.carType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, carType: event.target.value }))
                }
                className={inputClassName}
              >
                {carTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Car Seats">
              <input
                type="number"
                min="2"
                max="9"
                value={form.carSeats}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    carSeats: Math.max(2, Math.min(9, Number(event.target.value) || 2)),
                  }))
                }
                className={inputClassName}
              />
            </FormField>

          </div>

          <div className="mt-10 rounded-[28px] border border-[#173a7a]/10 bg-[linear-gradient(135deg,rgba(23,58,122,0.05),rgba(249,115,22,0.08))] p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#173a7a]">
                  Search with AI Agents
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Searches flights, hotels, and cars simultaneously, then
                  recommends the best package based on your flight, hotel, and car preferences.
                </p>
              </div>
              <button
                onClick={handleSearch}
                disabled={searching}
                className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-full bg-orange-500 px-7 py-4 text-base font-semibold text-white shadow-[0_18px_36px_rgba(249,115,22,0.28)] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto lg:min-w-[260px]"
              >
                {searching ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <WandSparkles className="h-5 w-5" />
                )}
                Search with AI Agents
              </button>
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.58fr)_360px]">
        <section className="order-2 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm xl:order-2 xl:sticky xl:top-6 xl:self-start">
          {sessionHistory.length > 0 ? (
            <div className="mb-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Recent Planner Sessions
              </p>
              <div className="mt-4 space-y-3">
                {sessionHistory.slice(0, 3).map((session) => (
                  <button
                    key={session.session_id}
                    type="button"
                    onClick={() => handleLoadSession(session.session_id)}
                    className={`flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left text-sm transition ${
                      plannerSessionId === session.session_id
                        ? "border-orange-300 bg-white"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span>
                      <span className="block font-semibold text-slate-900">
                        {session.title || `${session.destination || "Trip"} planner`}
                      </span>
                      <span className="block text-slate-500">
                        {session.origin || "Origin"} -&gt; {session.destination || "Destination"}
                      </span>
                    </span>
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                      {session.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
            Booking Summary
          </p>
          <h2 className="mt-3 text-[2rem] font-semibold leading-tight text-slate-900">
            Book Your AI-Recommended Package
          </h2>
          <div className="mt-6 space-y-4">
            <SummaryRow
              icon={PlaneTakeoff}
              text={
                selectedFlight
                  ? `Flight: ${selectedFlight.flight_number} · ${form.origin} -> ${form.destination} · ${formatCurrency(
                      getSeatPrice(selectedFlight, form.seatClass),
                    )}`
                  : "Flight: Search to see recommended outbound flights"
              }
            />
            <SummaryRow
              icon={Hotel}
              text={
                selectedHotel
                  ? `Hotel: ${selectedHotel.hotel_name} · ${
                      Math.round(Number(selectedHotel.rating || 0)) || 4
                    } stars · ${formatCurrency(
                      getHotelNightlyRate(selectedHotel),
                    )}/night`
                  : `Hotel: ${form.hotelStyle} stay with ${form.hotelAmenities.join(", ").toLowerCase()} preferences`
              }
            />
            <SummaryRow
              icon={CarFront}
              text={
                selectedCar
                  ? `Car: ${selectedCar.company} ${selectedCar.car_model} · ${formatCurrency(
                      Number(selectedCar.price_per_day || 0),
                    )}/day`
                  : `Car: ${form.carType} rental with at least ${form.carSeats} seats`
              }
            />
          </div>

          <div className="mt-7 rounded-[24px] bg-slate-50 p-5">
            <p className="text-sm text-slate-500">Grand Total</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {formatCurrency(pricing.grandTotal)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Includes 12% bundle discount + taxes
            </p>
          </div>

          <button
            onClick={handleConfirm}
            disabled={!selectedFlight || !selectedHotel || !selectedCar || !currentDraftId || confirmingBooking}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmingBooking ? "Revalidating Package..." : "Confirm & Book"}
          </button>

          {revalidationState ? (
            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Latest Revalidation</p>
              <p className="mt-2">
                Flight: {formatRevalidationStatus(revalidationState.flight)}
              </p>
              <p className="mt-1">
                Hotel: {formatRevalidationStatus(revalidationState.hotel)}
              </p>
              <p className="mt-1">
                Car: {formatRevalidationStatus(revalidationState.car)}
              </p>
            </div>
          ) : null}

          {confirmation ? (
            <div className="mt-6 rounded-[28px] border border-emerald-200 bg-emerald-50 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-emerald-900">
                    Booking Confirmed!
                  </h3>
                  <p className="mt-3 font-mono text-xl font-semibold text-emerald-800">
                    {confirmation.booking_reference}
                  </p>
                  <p className="mt-2 text-sm text-emerald-700">
                    Saved to the database. You can verify it below with the same reference.
                  </p>
                  <p className="mt-2 text-sm font-medium text-emerald-700">
                    +{Math.round(pricing.grandTotal).toLocaleString()} miles added
                    to your account
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] border border-emerald-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Status
                      </p>
                      <p className="mt-2 text-sm font-semibold text-emerald-900">
                        {confirmation.booking_status || "Confirmed"}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-emerald-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Total Saved
                      </p>
                      <p className="mt-2 text-sm font-semibold text-emerald-900">
                        {formatCurrency(Number(confirmation.total_price || pricing.grandTotal || 0))}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-emerald-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Flight
                      </p>
                      <p className="mt-2 text-sm font-semibold text-emerald-900">
                        {getBookedFlightLabel(confirmation)}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-emerald-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Created
                      </p>
                      <p className="mt-2 text-sm font-semibold text-emerald-900">
                        {confirmation.created_at
                          ? new Date(confirmation.created_at).toLocaleString()
                          : "Saved just now"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="order-1 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm xl:order-1 xl:p-8">
          <div className="mb-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px] xl:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                AI Results
              </p>
              <h2 className="mt-2 max-w-2xl text-4xl font-semibold leading-tight text-slate-900">
                Recommended package results
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                The planner runs first. Results, pricing, and booking appear
                here after the AI search completes.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Current Trip
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {form.origin} -&gt; {form.destination}
              </p>
              <p className="text-sm text-slate-500">
                {nights} nights · {form.tripType}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {["flights", "hotels", "cars", "pricing", "insights"].map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === key
                    ? "bg-orange-500 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>

          {searching ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-48 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100"
                />
              ))}
            </div>
          ) : null}

          {!searching && searchError ? (
            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              {searchError}
            </div>
          ) : null}

          {!searching && !searchError && !hasAnyResults ? (
            <EmptyState text="Run the AI planner to see flights, hotels, cars, and full pricing here." />
          ) : null}

          {!searching && !searchError && activeTab === "flights" ? (
            <div className="mt-6 space-y-8">
              <FlightSection
                title="Outbound"
                flights={results.outbound}
                budget={form.budget}
                seatClass={form.seatClass}
                routeLabel={`${form.origin} -> ${form.destination}`}
                selectedFlightId={selectedFlight?.flight_id}
                onSelectFlight={setSelectedOutboundFlightId}
              />
              <FlightSection
                title="Return"
                flights={results.returnFlights}
                budget={form.budget}
                seatClass={form.seatClass}
                routeLabel={`${form.destination} -> ${form.origin}`}
                selectedFlightId={selectedReturnFlight?.flight_id}
                onSelectFlight={setSelectedReturnFlightId}
              />
            </div>
          ) : null}

          {!searching && !searchError && activeTab === "hotels" ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
              {results.hotels.slice(0, 3).map((hotel, index) => (
                <HotelResultCard
                  key={hotel.hotel_id}
                  hotel={hotel}
                  nights={nights}
                  recommended={index === 0}
                  selected={selectedHotel?.hotel_id === hotel.hotel_id}
                  onSelect={() => setSelectedHotelId(hotel.hotel_id)}
                />
              ))}
              {results.hotels.length === 0 ? (
                <EmptyState text="No hotels matched yet. Try a different destination or date range." />
              ) : null}
            </div>
          ) : null}

          {!searching && !searchError && activeTab === "cars" ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
              {results.cars.slice(0, 3).map((car, index) => (
                <CarResultCard
                  key={car.car_id}
                  car={car}
                  nights={nights}
                  recommended={index === 0}
                  selected={selectedCar?.car_id === car.car_id}
                  onSelect={() => setSelectedCarId(car.car_id)}
                />
              ))}
              {results.cars.length === 0 ? (
                <EmptyState text="No cars matched yet. Try another destination or wider search window." />
              ) : null}
            </div>
          ) : null}

          {!searching && !searchError && activeTab === "pricing" ? (
            <PricingCard pricing={pricing} />
          ) : null}

          {!searching && !searchError && activeTab === "insights" ? (
              <PlannerInsightsCard insights={plannerInsights} loading={insightsLoading} />
          ) : null}
        </section>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
          Retrieve Booking
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">
          Already have a booking? Find it here
        </h2>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={lookupReference}
            onChange={(event) => setLookupReference(event.target.value)}
            placeholder="SNA000123"
            className="min-h-12 flex-1 rounded-full border border-slate-200 bg-slate-50 px-5 text-sm text-slate-900 outline-none transition focus:border-[#173a7a] focus:ring-4 focus:ring-[#173a7a]/10"
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#173a7a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#102b5d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {lookupLoading ? "Finding..." : "Find Booking"}
          </button>
        </div>

        {lookupError ? (
          <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {lookupError}
          </div>
        ) : null}

        {lookupResult ? (
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              Booking Found
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">
              {lookupResult.booking_reference}
            </h3>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <LookupItem
                label="Status"
                value={lookupResult.booking_status || "Confirmed"}
              />
              <LookupItem
                label="Dates"
                value={
                  [lookupResult.outbound_date, lookupResult.return_date]
                    .filter(Boolean)
                    .join(" to ") || "Saved booking"
                }
              />
              <LookupItem
                label="Created"
                value={
                  lookupResult.created_at
                    ? new Date(lookupResult.created_at).toLocaleString()
                    : "Saved"
                }
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <LookupItem
                label="Flight"
                value={getBookedFlightLabel(lookupResult)}
              />
              <LookupItem
                label="Hotel"
                value={getBookedHotelLabel(lookupResult)}
              />
              <LookupItem
                label="Car"
                value={getBookedCarLabel(lookupResult)}
              />
              <LookupItem
                label="Total"
                value={formatCurrency(Number(lookupResult.total_price || 0))}
              />
            </div>
          </div>
        ) : null}
      </section>

      {!chatOpen ? (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#173a7a] text-white shadow-[0_18px_40px_rgba(23,58,122,0.35)] transition hover:bg-[#102b5d]"
          aria-label="Open AI Copilot"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      ) : null}

      {chatOpen ? (
        <>
          <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] xl:hidden">
            <aside className="absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,#16356f_0%,#1f4f9d_100%)] text-white">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#173a7a]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-300">
                      SkyBook AI Copilot
                    </p>
                    <p className="text-sm text-blue-50/80">Travel help on demand</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white"
                  aria-label="Close AI Copilot"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>

              <div className="h-[calc(100%-76px)] p-4">
                <ChatPanel
                  chatInput={chatInput}
                  chatLoading={chatLoading}
                  messages={messages}
                  onInputChange={setChatInput}
                  onSend={handleSend}
                  showQuickChips={showQuickChips}
                  fullHeight
                />
              </div>
            </aside>
          </div>

          <aside className="fixed bottom-6 right-6 z-40 hidden h-[min(720px,calc(100vh-8rem))] w-[380px] overflow-hidden rounded-[32px] border border-[#173a7a]/15 bg-[linear-gradient(180deg,#16356f_0%,#1f4f9d_100%)] text-white shadow-[0_30px_90px_rgba(23,58,122,0.35)] xl:flex xl:flex-col">
            <div className="flex items-center justify-end border-b border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white"
                aria-label="Close AI Copilot"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <ChatPanel
              chatInput={chatInput}
              chatLoading={chatLoading}
              messages={messages}
              onInputChange={setChatInput}
              onSend={handleSend}
              showQuickChips={showQuickChips}
              fullHeight
            />
          </aside>
        </>
      ) : null}
    </div>
  );
}

function errorToMessage(error) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  return (
    error?.payload?.detail ||
    error?.payload?.message ||
    error?.message ||
    ""
  );
}

function getBookedFlightLabel(booking) {
  return (
    booking.flight_details?.flight_number ||
    booking.booking_metadata?.selected_flight?.flight_number ||
    booking.booking_metadata?.selected_flight?.code ||
    "Not attached"
  );
}

function getBookedHotelLabel(booking) {
  return (
    booking.hotel_details?.hotel_name ||
    booking.booking_metadata?.selected_hotel?.hotel_name ||
    "Not attached"
  );
}

function getBookedCarLabel(booking) {
  if (booking.car_details?.company || booking.car_details?.car_model) {
    return `${booking.car_details?.company || ""} ${booking.car_details?.car_model || ""}`.trim();
  }

  const snapshot = booking.booking_metadata?.selected_car;
  if (snapshot?.company || snapshot?.car_model) {
    return `${snapshot.company || ""} ${snapshot.car_model || ""}`.trim();
  }

  return "Not attached";
}

function ChatPanel({
  chatInput,
  chatLoading,
  messages,
  onInputChange,
  onSend,
  showQuickChips,
  fullHeight = false,
}) {
  return (
    <div className={`p-5 ${fullHeight ? "flex h-full flex-col p-0" : ""}`}>
      {!fullHeight ? (
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#173a7a]">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-orange-300">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-400" />
              SkyBook AI Copilot
            </div>
            <p className="mt-1 text-sm text-blue-50/80">
              Visa, weather, baggage, and trip help
            </p>
          </div>
        </div>
      ) : null}

      {showQuickChips ? (
        <div className={`flex flex-wrap gap-2 ${fullHeight ? "mt-0" : "mt-4"}`}>
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => onSend(chip)}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/15"
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`rounded-[24px] bg-white/95 p-4 text-slate-900 shadow-[0_14px_40px_rgba(8,15,36,0.16)] ${
          fullHeight ? "mt-4 flex min-h-0 flex-1 flex-col" : "mt-4"
        }`}
      >
        <div className={`space-y-4 overflow-y-auto pr-1 ${fullHeight ? "min-h-0 flex-1" : "max-h-[320px]"}`}>
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[94%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "rounded-tr-[10px] bg-orange-500 text-white"
                    : "rounded-tl-[10px] bg-slate-100 text-slate-700"
                }`}
              >
                {message.role === "assistant" ? (
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
                      SB
                    </span>
                    AI Copilot
                  </div>
                ) : null}
                {message.role === "assistant" ? (
                  <ChatMessageContent content={message.content} />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}

          {chatLoading ? (
            <div className="max-w-[88%] rounded-[20px] rounded-tl-[10px] bg-slate-100 px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <input
            value={chatInput}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask anything about your trip..."
            className="min-h-12 rounded-full border border-slate-200 bg-white px-5 text-sm text-slate-900 outline-none transition focus:border-[#173a7a] focus:ring-4 focus:ring-[#173a7a]/10"
          />
          <button
            onClick={() => onSend()}
            disabled={chatLoading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#173a7a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#102b5d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SendHorizontal className="h-4 w-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function formatLocationLabel(location) {
  if (!location) {
    return "";
  }

  return (
    location.label ||
    [location.city, location.country, location.city_code ? `(${location.city_code})` : ""]
      .filter(Boolean)
      .join(", ")
      .replace(", (", " (")
  );
}

function buildPlannerRouteMap(routeOptions, locationTokensFor) {
  const map = new Map();

  (routeOptions || []).forEach((origin) => {
    locationTokensFor(origin).forEach((token) => {
      map.set(token, origin.destinations || []);
    });
  });

  return map;
}

function getPlannerDestinationOptionsForValue(originValue, routeMap, locationOptions, locationTokensFor) {
  const normalizedOrigin = String(originValue || "").trim().toLowerCase();
  if (!normalizedOrigin) {
    return [];
  }

  const routeDestinations = routeMap.get(normalizedOrigin);
  if (Array.isArray(routeDestinations) && routeDestinations.length > 0) {
    return routeDestinations;
  }

  const matchedLocation = (locationOptions || []).find((location) =>
    locationTokensFor(location).includes(normalizedOrigin),
  );
  if (!matchedLocation) {
    return [];
  }

  for (const token of locationTokensFor(matchedLocation)) {
    const fallbackDestinations = routeMap.get(token);
    if (Array.isArray(fallbackDestinations) && fallbackDestinations.length > 0) {
      return fallbackDestinations;
    }
  }

  return [];
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function FlightSection({ title, flights, budget, seatClass, routeLabel, selectedFlightId, onSelectFlight }) {
  const topFlights = flights.slice(0, 3);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{routeLabel}</p>
      </div>
      {flights.length === 0 ? (
        <EmptyState text={`No ${title.toLowerCase()} flights available right now.`} />
      ) : null}
      <div className="grid gap-5">
        {topFlights.map((flight, index) => (
          <FlightResultCard
            key={`${title}-${flight.flight_id}`}
            flight={flight}
            budget={budget}
            seatClass={seatClass}
            recommended={index === 0}
            routeLabel={routeLabel}
            selected={selectedFlightId === flight.flight_id}
            onSelect={() => onSelectFlight(flight.flight_id)}
          />
        ))}
      </div>
    </div>
  );
}

function FlightResultCard({ flight, budget, seatClass, recommended, routeLabel, selected, onSelect }) {
  const [expanded, setExpanded] = useState(recommended);
  const reasons = buildRecommendationReasons(getSeatPrice(flight, seatClass), budget);

  return (
    <article className={`flex h-full flex-col rounded-[28px] border bg-white p-6 shadow-sm ${
      selected ? "border-orange-400 ring-2 ring-orange-100" : "border-slate-200"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-2xl font-semibold text-slate-900">{routeLabel}</h4>
            {recommended ? (
              <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {flight.flight_number} · {flight.aircraft}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-slate-900">
            {formatCurrency(getSeatPrice(flight, seatClass))}
          </p>
          <p className="text-sm text-slate-500">{seatClass}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
        <p className="text-lg font-semibold text-slate-900">
          {flight.departure_time_display}
        </p>
        <p className="text-slate-400">-&gt;</p>
        <p className="text-lg font-semibold text-slate-900">
          {flight.arrival_time_display}
        </p>
        <p className="text-sm text-slate-500">
          Duration: {flight.duration_display}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(flight.amenities || []).map((amenity) => (
          <Tag key={amenity}>{amenity}</Tag>
        ))}
      </div>

      <button
        onClick={() => setExpanded((current) => !current)}
        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#173a7a]"
      >
        Why recommended
      </button>

      {expanded ? (
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          {reasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        className={`mt-5 inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
          selected
            ? "bg-orange-500 text-white"
            : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
        }`}
      >
        {selected ? "Selected" : "Select this flight"}
      </button>
    </article>
  );
}

function HotelResultCard({ hotel, nights, recommended, selected, onSelect }) {
  const amenities = hotel.amenity_list || [];
  const pricingPending = Boolean(hotel.pricing_pending || hotel.is_discovery_result);
  const nightlyRate = getHotelNightlyRate(hotel);

  return (
    <article className={`rounded-[28px] border bg-white p-5 shadow-sm ${
      selected ? "border-orange-400 ring-2 ring-orange-100" : "border-slate-200"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-2xl font-semibold text-slate-900">
              {hotel.hotel_name}
            </h4>
            {recommended ? (
              <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {hotel.city}, {hotel.country_name}
          </p>
        </div>
        <div className="text-right">
          {pricingPending ? (
            <>
              <p className="text-2xl font-semibold text-slate-900">
                {hotel.price_display || "Check live offers"}
              </p>
              <p className="text-sm text-slate-500">
                Final room price is confirmed after selection
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-semibold text-slate-900">
                {formatCurrency(nightlyRate)}
              </p>
              <p className="text-sm text-slate-500">
                Total stay {formatCurrency(nightlyRate * nights)}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1 text-orange-500">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={`h-4 w-4 ${
              index < Math.round(Number(hotel.rating || 0)) ? "fill-current" : ""
            }`}
          />
        ))}
        <span className="ml-2 text-sm font-semibold text-slate-700">
          {Number(hotel.rating || 0).toFixed(1)}
        </span>
      </div>

      <p className="mt-5 text-sm leading-7 text-slate-600">{hotel.description}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {amenities.slice(0, 4).map((amenity) => (
          <Tag key={amenity}>{amenity}</Tag>
        ))}
        {amenities.length > 4 ? <Tag>+more</Tag> : null}
      </div>

      <div className="mt-auto pt-6">
        <p className="text-sm font-medium text-emerald-600">
          {pricingPending
            ? "Check live room availability after selection"
            : `Available rooms: ${hotel.available_rooms || 0}`}
        </p>
        <button
          type="button"
          onClick={onSelect}
          className={`mt-5 inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition ${
            selected
              ? "bg-orange-500 text-white"
              : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
        >
          {selected ? "Selected" : "Select this hotel"}
        </button>
      </div>
    </article>
  );
}

function CarResultCard({ car, nights, recommended, selected, onSelect }) {
  const features = car.features || [];

  return (
    <article className={`flex h-full flex-col rounded-[28px] border bg-white p-6 shadow-sm ${
      selected ? "border-orange-400 ring-2 ring-orange-100" : "border-slate-200"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-2xl font-semibold text-slate-900">
              {car.company} {car.car_model}
            </h4>
            <Tag>{car.car_type || "Standard"}</Tag>
            {recommended ? (
              <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {car.company} · {car.city}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-slate-900">
            {formatCurrency(Number(car.price_per_day || 0))}
          </p>
          <p className="text-sm text-slate-500">
            Total {formatCurrency(Number(car.price_per_day || 0) * nights)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Tag>{car.car_seats || 4} seats</Tag>
        <Tag>Automatic</Tag>
        {features.slice(0, 4).map((feature) => (
          <Tag key={feature}>{feature}</Tag>
        ))}
      </div>
      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={onSelect}
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition ${
            selected
              ? "bg-orange-500 text-white"
              : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
        >
          {selected ? "Selected" : "Select this car"}
        </button>
      </div>
    </article>
  );
}

function PricingCard({ pricing }) {
  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-6">
      <div className="space-y-4 text-sm text-slate-600">
        <PriceRow label="Flights" value={pricing.flightTotal} />
        <PriceRow label="Hotel" value={pricing.hotelTotal} />
        <PriceRow label="Car Rental" value={pricing.carTotal} />
        <div className="border-t border-dashed border-slate-300 pt-4" />
        <PriceRow label="Subtotal" value={pricing.subtotal} />
        <PriceRow
          label="Bundle Discount"
          value={-pricing.discount}
          highlight="text-emerald-600"
        />
        <p className="text-sm text-emerald-600">
          You saved {formatCurrency(pricing.discount)} by booking all 3 together!
        </p>
        <PriceRow label="Taxes & Fees" value={pricing.taxes} />
        <div className="border-t border-dashed border-slate-300 pt-4" />
        <PriceRow label="Grand Total" value={pricing.grandTotal} emphasize />
      </div>
    </div>
  );
}

function PlannerInsightsCard({ insights, loading = false }) {
  const itinerary = Array.isArray(insights.itinerary) ? insights.itinerary : [];
  const qualityScore = insights.qualityScore;

  return (
    <div className="mt-6 space-y-6">
      {loading ? (
        <div className="rounded-[24px] border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          AI insights are loading in the background. Search results are ready to review now.
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <InsightPanel
          title="Destination Brief"
          content={
            insights.destinationBrief ||
            "Run the planner to generate destination-specific guidance."
          }
        />
        <InsightPanel
          title="Visa Guidance"
          content={
            insights.visaInfo ||
            "Visa information will appear here after the planner runs."
          }
        />
        <InsightPanel
          title="Baggage Guidance"
          content={
            insights.baggageInfo ||
            "Baggage guidance will appear here after the planner runs."
          }
        />
      </div>

      {qualityScore ? (
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Quality Score
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="text-3xl font-semibold text-slate-900">
              {qualityScore.score}/10
            </div>
            <p className="text-sm text-slate-600">{qualityScore.summary}</p>
          </div>
          {Array.isArray(qualityScore.issues) && qualityScore.issues.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {qualityScore.issues.map((issue) => (
                <li key={issue}>- {issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Day-by-Day Itinerary
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">
              AI-generated trip flow
            </h3>
          </div>
        </div>

        {itinerary.length === 0 ? (
          <EmptyState text="Run the planner to generate a day-by-day itinerary." />
        ) : (
          <div className="mt-6 grid gap-4">
            {itinerary.map((day) => (
              <div
                key={`${day.day}-${day.title}`}
                className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                      Day {day.day}
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-slate-900">
                      {day.title}
                    </h4>
                  </div>
                  <Tag>{day.estimated_local_spend || "Local spend varies"}</Tag>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <ItinerarySlot label="Morning" text={day.morning} />
                  <ItinerarySlot label="Afternoon" text={day.afternoon} />
                  <ItinerarySlot label="Evening" text={day.evening} />
                </div>
                {Array.isArray(day.highlights) && day.highlights.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {day.highlights.map((highlight) => (
                      <Tag key={highlight}>{highlight}</Tag>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightPanel({ title, content }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <p className="mt-3 text-sm leading-7 text-slate-700 whitespace-pre-line">
        {content}
      </p>
    </div>
  );
}

function ItinerarySlot({ label, text }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {text || "Free time"}
      </p>
    </div>
  );
}

function SummaryRow({ icon: Icon, text }) {
  return (
    <div className="flex items-start gap-4 rounded-[22px] border border-slate-200 p-4 text-sm text-slate-700">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
        <Icon className="h-4 w-4" />
      </div>
      <p className="pt-1 leading-7">{text}</p>
    </div>
  );
}

function LookupItem({ label, value }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function PriceRow({ label, value, emphasize = false, highlight = "" }) {
  const numberValue = Number(value || 0);

  return (
    <div className="flex items-center justify-between">
      <span className={emphasize ? "font-semibold text-slate-900" : ""}>
        {label}
      </span>
      <span
        className={`${
          emphasize ? "text-2xl font-semibold text-slate-900" : "font-semibold text-slate-900"
        } ${highlight}`}
      >
        {numberValue < 0 ? "-" : ""}
        {formatCurrency(Math.abs(numberValue))}
      </span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      {text}
    </div>
  );
}

function Tag({ children }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
      {children}
    </span>
  );
}

function ChatMessageContent({ content }) {
  const blocks = formatChatMessage(content);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <p
              key={`heading-${index}`}
              className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
            >
              {block.text}
            </p>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="space-y-2 pl-4 text-sm leading-6 text-slate-700">
              {block.items.map((item) => (
                <li key={item} className="list-disc">
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`paragraph-${index}`} className="text-sm leading-6 text-slate-700 whitespace-pre-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function formatChatMessage(content) {
  const text = String(content || "").trim();
  if (!text) {
    return [{ type: "paragraph", text: "" }];
  }

  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*\s*/g, "\n**")
    .replace(/\s+\*\s/g, "\n* ")
    .replace(/\s+-\s/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks = [];
  let currentList = [];

  function flushList() {
    if (currentList.length > 0) {
      blocks.push({ type: "list", items: currentList });
      currentList = [];
    }
  }

  lines.forEach((line) => {
    const headingMatch = line.match(/^\*\*(.+?)\*\*:?$/);
    if (headingMatch) {
      flushList();
      blocks.push({ type: "heading", text: headingMatch[1].trim() });
      return;
    }

    if (line.startsWith("* ") || line.startsWith("- ")) {
      currentList.push(line.slice(2).trim());
      return;
    }

    flushList();
    blocks.push({
      type: "paragraph",
      text: line.replace(/\*\*(.+?)\*\*/g, "$1"),
    });
  });

  flushList();
  return blocks.length > 0 ? blocks : [{ type: "paragraph", text }];
}

function describeBudget(budget) {
  if (budget < 1500) return "Budget - Economy · 2-3 star hotels · Value cars";
  if (budget < 4000) return "Standard - Economy+ · 3-4 star hotels";
  if (budget < 7000) return "Premium - Business Class · 5 star hotels";
  return "Luxury - First Class · 5 star resort · Premium cars";
}

function buildPricing(selectedFlight, selectedHotel, selectedCar, form, nights) {
  const flightTotal =
    getSeatPrice(selectedFlight, form.seatClass) * Number(form.passengers || 1);
  const hotelTotal = getHotelNightlyRate(selectedHotel) * nights;
  const carTotal = Number(selectedCar?.price_per_day || 0) * nights;
  const subtotal = flightTotal + hotelTotal + carTotal;
  const discount = selectedFlight && selectedHotel && selectedCar ? subtotal * 0.12 : 0;
  const taxes = subtotal * 0.1;

  return {
    flightTotal,
    hotelTotal,
    carTotal,
    subtotal,
    discount,
    taxes,
    grandTotal: subtotal - discount + taxes,
  };
}

function buildRecommendationReasons(price, budget) {
  return [
    price <= budget
      ? `Fits within your $${budget.toLocaleString()} budget`
      : "Best value route close to your budget",
    "Highest rated route in our network",
    "Best departure time for your itinerary",
  ];
}

function getHotelNightlyRate(hotel) {
  if (!hotel) return 0;

  const directCandidates = [
    hotel.price_per_night,
    hotel.price,
    hotel.nightly_rate,
    hotel.price_confirmed,
    hotel.provider_metadata?.price_per_night,
    hotel.provider_metadata?.price,
  ];

  for (const value of directCandidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  const displayCandidates = [
    hotel.price_display,
    hotel.provider_metadata?.price_display,
  ];

  for (const value of displayCandidates) {
    const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
    if (!match) continue;
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  return 0;
}

function getSeatPrice(flight, seatClass) {
  if (!flight) return 0;
  return Number(
    seatClass === "Business"
      ? flight.price_business || flight.display_price
      : flight.price_economy || flight.display_price || 0,
  );
}

function clampPassengers(value) {
  const numeric = Number(value || 1);
  return Math.min(Math.max(numeric, 1), 9);
}

function formatRevalidationStatus(result) {
  if (!result) {
    return "Not required";
  }

  if (result.available) {
    return `Confirmed (${result.status})`;
  }

  return "Unavailable";
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function getNightCount(departureDate, returnDate) {
  if (!departureDate || !returnDate) return 1;
  const start = new Date(departureDate);
  const end = new Date(returnDate);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
}

function toDateInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function persistPlannerLoyalty(booking, totalPrice) {
  if (typeof window === "undefined") return;

  try {
    const bookings = safeParseStorage("skybook-ai-bookings", []);
    const loyalty = safeParseStorage("skybook-loyalty", {
      miles: 0,
      redeemedMiles: 0,
      joinedAt: new Date().toISOString(),
    });
    const milesEarned = Math.round(Number(totalPrice || 0));
    const nextBookings = Array.isArray(bookings)
      ? [...bookings, { ...booking, milesEarned, savedAt: new Date().toISOString() }]
      : [{ ...booking, milesEarned, savedAt: new Date().toISOString() }];
    const nextLoyalty = {
      ...loyalty,
      miles: Number(loyalty?.miles || 0) + milesEarned,
      joinedAt: loyalty?.joinedAt || new Date().toISOString(),
    };

    window.localStorage.setItem("skybook-ai-bookings", JSON.stringify(nextBookings));
    window.localStorage.setItem("skybook-loyalty", JSON.stringify(nextLoyalty));
  } catch {
    // Best effort only. Booking confirmation should not fail because of local storage.
  }
}

function safeParseStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

