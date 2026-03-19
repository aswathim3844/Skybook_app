"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useSavedStore = create(
  persist(
    (set, get) => ({
      savedFlights: [],
      savedHotels: [],
      savedCars: [],
      toggleSavedFlight: (flight) =>
        set((state) => ({
          savedFlights: toggleItem(state.savedFlights, flight, "id"),
        })),
      toggleSavedHotel: (hotel) =>
        set((state) => ({
          savedHotels: toggleItem(state.savedHotels, hotel, "id"),
        })),
      toggleSavedCar: (car) =>
        set((state) => ({
          savedCars: toggleItem(state.savedCars, car, "id"),
        })),
      removeSavedFlight: (flightId) =>
        set((state) => ({
          savedFlights: state.savedFlights.filter((item) => item.id !== flightId),
        })),
      removeSavedHotel: (hotelId) =>
        set((state) => ({
          savedHotels: state.savedHotels.filter((item) => item.id !== hotelId),
        })),
      removeSavedCar: (carId) =>
        set((state) => ({
          savedCars: state.savedCars.filter((item) => item.id !== carId),
        })),
      isFlightSaved: (flightId) =>
        get().savedFlights.some((item) => item.id === flightId),
      isHotelSaved: (hotelId) =>
        get().savedHotels.some((item) => item.id === hotelId),
      isCarSaved: (carId) =>
        get().savedCars.some((item) => item.id === carId),
    }),
    {
      name: "skybook-saved-items",
    }
  )
);

function toggleItem(items, item, key) {
  const exists = items.some((entry) => entry[key] === item[key]);

  if (exists) {
    return items.filter((entry) => entry[key] !== item[key]);
  }

  return [item, ...items];
}
