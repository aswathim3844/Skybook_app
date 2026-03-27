"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAdminStore = create(
  persist(
    (set) => ({
      token: null,
      admin: null,
      permissions: [],
      setAdminAuth: ({ token, admin, permissions }) =>
        set({
          token,
          admin,
          permissions: permissions || [],
        }),
      clearAdminAuth: () =>
        set({
          token: null,
          admin: null,
          permissions: [],
        }),
    }),
    {
      name: "skybook-admin-auth",
    }
  )
);

export function setAdminCookie(token) {
  if (typeof document === "undefined") {
    return;
  }

  if (!token) {
    document.cookie = "skybook_admin_token=; Path=/; Max-Age=0; SameSite=Lax";
    return;
  }

  document.cookie = `skybook_admin_token=${encodeURIComponent(token)}; Path=/; Max-Age=28800; SameSite=Lax`;
}
