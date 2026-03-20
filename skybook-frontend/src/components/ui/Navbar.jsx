"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgePercent,
  ChevronDown,
  CircleUserRound,
  Heart,
  LogOut,
  Menu,
  Plane,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";

const accountLinks = [
  { label: "My account", href: "/account", icon: UserRound },
  { label: "Loyalty dashboard", href: "/loyalty", icon: BadgePercent },
  { label: "Saved", href: "/saved", icon: Heart },
  { label: "Upcoming trips", href: "/my-bookings", icon: Ticket },
];

function getDisplayName(customer) {
  if (!customer) {
    return "";
  }

  if (customer.name?.trim()) {
    return customer.name.trim();
  }

  if (customer.email?.includes("@")) {
    return customer.email.split("@")[0];
  }

  return "My account";
}

const Navbar = ({ heroStyle = false }) => {
  const customer = useAuthStore((state) => state.customer);
  const summary = useAuthStore((state) => state.summary);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const menuRef = useRef(null);
  const displayName = useMemo(() => getDisplayName(customer), [customer]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <nav
      className={`z-50 px-5 py-4 text-white md:px-8 ${
        heroStyle
          ? "relative border-b border-white/0 bg-transparent"
          : "sticky top-0 border-b border-white/12 bg-[#09214d]/90 backdrop-blur"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
              heroStyle
                ? "border border-white/0 bg-transparent shadow-none"
                : "border border-white/15 bg-white/10 shadow-lg shadow-slate-950/20"
            }`}
          >
            <Plane className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">SkyBook</p>
          </div>
        </Link>

        <div className="hidden items-center lg:flex">
          {customer ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full border border-white/30 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
              >
                <CircleUserRound className="h-5 w-5" />
                {displayName}
                <ChevronDown className="h-4 w-4" />
              </button>

              {isMenuOpen ? (
                <div className="absolute right-0 mt-3 w-72 overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 text-slate-800 shadow-2xl">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold">{displayName}</p>
                    <p className="text-sm text-slate-500">{customer.email}</p>
                  </div>

                  <div className="mt-2 space-y-1">
                    {accountLinks.map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <link.icon className="h-4 w-4 text-slate-500" />
                        <span>{link.label}</span>
                      </Link>
                    ))}

                    <Link href="/loyalty" className="flex items-center justify-between rounded-2xl px-4 py-3 transition hover:bg-slate-50">
                      <span className="flex items-center gap-3">
                        <BadgePercent className="h-4 w-4 text-slate-500" />
                        Loyalty points
                      </span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {summary?.loyalty_points || 0}
                      </span>
                    </Link>

                    <button
                      onClick={() => {
                        clearAuth();
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <Link
              href="/login"
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                heroStyle
                  ? "border border-white/45 bg-white/5 hover:bg-white/10"
                  : "border border-white/30 hover:bg-white/10"
              }`}
            >
              <CircleUserRound className="h-5 w-5" />
              Sign in
            </Link>
          )}
        </div>

        <button
          onClick={() => setIsMobileNavOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 lg:hidden"
          aria-label="Open navigation"
        >
          {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isMobileNavOpen ? (
        <div className="mx-auto mt-4 max-w-7xl rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur lg:hidden">
          <div className="grid gap-3">
            {customer ? (
              <>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs text-blue-100/75">{customer.email}</p>
                </div>
                {accountLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link href="/loyalty" className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold">
                  Loyalty points: {summary?.loyalty_points || 0}
                </Link>
                <button
                  onClick={() => {
                    clearAuth();
                    setIsMobileNavOpen(false);
                  }}
                  className="rounded-2xl bg-red-500 px-4 py-3 text-left text-sm font-semibold text-white"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </nav>
  );
};

export default Navbar;
