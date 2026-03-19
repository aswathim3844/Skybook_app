"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      customer: null,
      summary: null,
      setAuth: ({ customer, summary }) =>
        set({
          customer,
          summary,
        }),
      clearAuth: () =>
        set({
          customer: null,
          summary: null,
        }),
      updateSummary: (summary) =>
        set((state) => ({
          summary: {
            ...state.summary,
            ...summary,
          },
        })),
    }),
    {
      name: "skybook-auth",
    }
  )
);
