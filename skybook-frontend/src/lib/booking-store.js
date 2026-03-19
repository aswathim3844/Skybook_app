"use client";

import { useEffect } from "react";
import { create } from "zustand";

export const defaultBookingSearch = {
  tripType: "roundtrip",
  from: "Kochi, COK",
  to: "Paris, France",
  departure: "2026-04-18",
  returnDate: "2026-04-23",
  passengers: "2 Adults",
  multiCitySegments: [
    {
      id: "segment-1",
      from: "Kochi, COK",
      to: "Paris, France",
      departure: "2026-04-18",
    },
    {
      id: "segment-2",
      from: "Paris, France",
      to: "Rome, Italy",
      departure: "2026-04-20",
    },
  ],
};

export const useBookingStore = create((set) => ({
  search: defaultBookingSearch,
  selectedFlightId: null,
  selectedHotelId: null,
  selectedCarId: null,
  selectedFlight: null,
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
      ...(params.hotel ? { selectedHotelId: params.hotel } : {}),
      ...(params.car ? { selectedCarId: params.car } : {}),
    })),
  resetBooking: () =>
    set({
        search: defaultBookingSearch,
        selectedFlightId: null,
        selectedHotelId: null,
        selectedCarId: null,
        selectedFlight: null,
        selectedHotel: null,
        selectedCar: null,
    }),
}));

export function buildBookingQuery({
  search,
  flightId,
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
