"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAdminSession } from "@/lib/api";
import { setAdminCookie, useAdminStore } from "@/lib/admin-store";

export default function ClientGuard({ children }) {
  const router = useRouter();
  const token = useAdminStore((state) => state.token);
  const setAdminAuth = useAdminStore((state) => state.setAdminAuth);
  const clearAdminAuth = useAdminStore((state) => state.clearAdminAuth);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    fetchAdminSession(token)
      .then((payload) => {
        setAdminAuth({
          token,
          admin: payload.admin,
          permissions: payload.permissions,
        });
        setReady(true);
      })
      .catch(() => {
        clearAdminAuth();
        setAdminCookie(null);
        router.replace("/login");
      });
  }, [clearAdminAuth, router, setAdminAuth, token]);

  if (!ready) {
    return <div className="px-6 py-10 text-sm text-slate-300">Validating admin session...</div>;
  }

  return children;
}
