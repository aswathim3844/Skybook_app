"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const defaultDepartureDate = buildFutureDate(14);
const defaultReturnDate = buildFutureDate(18);
const defaultSecondSegmentDate = buildFutureDate(16);

export const defaultBookingSearch = {
  tripType: "roundtrip",
  from: "Mumbai, India (BOM)",
  to: "London, United Kingdom (LHR)",
  departure: defaultDepartureDate,
  returnDate: defaultReturnDate,
  passengers: "2 Adults",
  multiCitySegments: [
    {
      id: "segment-1",
      from: "Mumbai, India (BOM)",
      to: "London, United Kingdom (LHR)",
      departure: defaultDepartureDate,
    },
    {
      id: "segment-2",
      from: "London, United Kingdom (LHR)",
      to: "Dubai, United Arab Emirates (DXB)",
      departure: defaultSecondSegmentDate,
    },
  ],
};

export const useBookingStore = create(
  persist(
    (set) => ({
      search: defaultBookingSearch,
      selectedFlightId: null,
      selectedReturnFlightId: null,
      selectedHotelId: null,
      selectedCarId: null,
      selectedFlight: null,
      selectedReturnFlight: null,
      selectedHotel: null,
      selectedCar: null,
      setSearchField: (field, value) =>
        set((state) => ({
          search: {
            ...state.search,
            [field]: value,
          },
        })),
      setSearch: (search) =>
        set((state) => ({
          search: {
            ...state.search,
            ...search,
          },
        })),
      selectFlight: (flight) =>
        set({
          selectedFlightId: flight?.id || null,
          selectedFlight: flight || null,
          selectedReturnFlightId: null,
          selectedReturnFlight: null,
          selectedHotelId: null,
          selectedCarId: null,
          selectedHotel: null,
          selectedCar: null,
        }),
      selectReturnFlight: (flight) =>
        set({
          selectedReturnFlightId: flight?.id || null,
          selectedReturnFlight: flight || null,
          selectedHotelId: null,
          selectedCarId: null,
          selectedHotel: null,
          selectedCar: null,
        }),
      selectHotel: (hotel) =>
        set({
          selectedHotelId: hotel?.id || null,
          selectedHotel: hotel || null,
          selectedCarId: null,
          selectedCar: null,
        }),
      selectCar: (car) =>
        set({
          selectedCarId: car?.id || null,
          selectedCar: car || null,
        }),
      clearFlight: () =>
        set({
          selectedFlightId: null,
          selectedReturnFlightId: null,
          selectedHotelId: null,
          selectedCarId: null,
          selectedFlight: null,
          selectedReturnFlight: null,
          selectedHotel: null,
          selectedCar: null,
        }),
      clearReturnFlight: () =>
        set({
          selectedReturnFlightId: null,
          selectedReturnFlight: null,
          selectedHotelId: null,
          selectedCarId: null,
          selectedHotel: null,
          selectedCar: null,
        }),
      clearHotel: () =>
        set({
          selectedHotelId: null,
          selectedHotel: null,
        }),
      clearCar: () =>
        set({
          selectedCarId: null,
          selectedCar: null,
        }),
      hydrateFromParams: (params) =>
        set((state) => ({
          search: {
            ...state.search,
            ...(params.tripType ? { tripType: params.tripType } : {}),
            ...(params.from ? { from: params.from } : {}),
            ...(params.to ? { to: params.to } : {}),
            ...(params.departure ? { departure: params.departure } : {}),
            ...(params.return ? { returnDate: params.return } : {}),
            ...(params.passengers ? { passengers: params.passengers } : {}),
            ...(params.segments ? { multiCitySegments: safeParseSegments(params.segments) } : {}),
          },
          ...(params.flight ? { selectedFlightId: params.flight } : {}),
          ...(params.returnFlight ? { selectedReturnFlightId: params.returnFlight } : {}),
          ...(params.hotel ? { selectedHotelId: params.hotel } : {}),
          ...(params.car ? { selectedCarId: params.car } : {}),
        })),
      resetBooking: () =>
        set({
          search: defaultBookingSearch,
          selectedFlightId: null,
          selectedReturnFlightId: null,
          selectedHotelId: null,
          selectedCarId: null,
          selectedFlight: null,
          selectedReturnFlight: null,
          selectedHotel: null,
          selectedCar: null,
        }),
    }),
    {
      name: "skybook-booking",
    }
  )
);

export function buildBookingQuery({
  search,
  flightId,
  returnFlightId,
  hotelId,
  carId,
}) {
  const params = new URLSearchParams();

  if (search.from) {
    params.set("from", search.from);
  }
  if (search.tripType) {
    params.set("tripType", search.tripType);
  }
  if (search.to) {
    params.set("to", search.to);
  }
  if (search.departure) {
    params.set("departure", search.departure);
  }
  if (search.returnDate) {
    params.set("return", search.returnDate);
  }
  if (search.passengers) {
    params.set("passengers", search.passengers);
  }
  if (Array.isArray(search.multiCitySegments) && search.multiCitySegments.length > 0) {
    params.set("segments", JSON.stringify(search.multiCitySegments));
  }
  if (flightId) {
    params.set("flight", flightId);
  }
  if (returnFlightId) {
    params.set("returnFlight", returnFlightId);
  }
  if (hotelId) {
    params.set("hotel", hotelId);
  }
  if (carId) {
    params.set("car", carId);
  }

  return params.toString();
}

export function useHydrateBookingFromParams(params) {
  const hydrateFromParams = useBookingStore((state) => state.hydrateFromParams);

  useEffect(() => {
    hydrateFromParams(params || {});
  }, [hydrateFromParams, params]);
}

function safeParseSegments(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : defaultBookingSearch.multiCitySegments;
  } catch {
    return defaultBookingSearch.multiCitySegments;
  }
}

function buildFutureDate(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
