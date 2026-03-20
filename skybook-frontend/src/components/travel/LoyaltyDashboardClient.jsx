"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleHelp, Crown, Gift, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

const LOYALTY_KEY = "skybook-loyalty";
const BOOKING_HISTORY_KEY = "skybook-ai-bookings";

export default function LoyaltyDashboardClient() {
  const customer = useAuthStore((state) => state.customer);
  const [loyalty, setLoyalty] = useState(() => {
    const storedLoyalty = safeParseStorage(LOYALTY_KEY);
    if (storedLoyalty) {
      return storedLoyalty;
    }

    const storedBookings = safeParseStorage(BOOKING_HISTORY_KEY, []);
    const computedMiles = storedBookings.reduce(
      (total, booking) => total + Number(booking.total_price || 0),
      4250
    );

    return {
      name: "",
      miles: computedMiles,
      trips: Math.max(3, storedBookings.length || 3),
      memberSince: "Jan 2026",
    };
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOYALTY_KEY, JSON.stringify(loyalty));
    }
  }, [loyalty]);

  const displayName = customer?.name?.trim() || customer?.email?.split("@")[0] || loyalty.name || "Traveler";
  const loyaltyView = useMemo(() => ({ ...loyalty, name: displayName }), [displayName, loyalty]);
  const tier = useMemo(() => getTierFromMiles(loyaltyView.miles), [loyaltyView.miles]);
  const rewardProgress = Math.min((loyaltyView.miles % 10000) / 100, 100);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_30%),linear-gradient(135deg,#09214d_0%,#173a7a_52%,#1f4f96_100%)] px-6 py-10 text-white sm:px-8 lg:px-10">
          <div className="grid gap-8 xl:grid-cols-[1.15fr_1.5fr_1fr] xl:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
                SkyNest Miles
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Welcome, {loyaltyView.name}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-blue-100/90">
                Your loyalty wallet is now separate from the AI Planner, with tier perks,
                reward progress, and trip value all in one premium dashboard.
              </p>

              <div className="group relative mt-6 inline-flex">
                <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${tier.badgeClassName}`}>
                  <Crown className="h-4 w-4" />
                  {tier.label}
                  <CircleHelp className="h-4 w-4" />
                </div>
                <div className="pointer-events-none absolute left-0 top-full z-10 mt-3 hidden w-72 rounded-[22px] border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-2xl group-hover:block">
                  {tier.benefits}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Sparkles} label="Miles Balance" value={`${loyaltyView.miles.toLocaleString()} miles`} />
              <MetricCard icon={ShieldCheck} label="Trips Taken" value={`${loyaltyView.trips} trips`} />
              <MetricCard icon={Zap} label="Miles to Next Tier" value={describeMilesToNextTier(loyaltyView.miles)} />
              <MetricCard icon={Star} label="Member Since" value={loyaltyView.memberSince} />
            </div>

            <div className="rounded-[28px] border border-white/15 bg-white/10 p-5 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-200">
                    Next Reward
                  </p>
                  <p className="mt-1 text-lg font-semibold">10,000 miles = $100 off</p>
                </div>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-cyan-300"
                  style={{ width: `${rewardProgress}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-blue-100/85">
                {(loyaltyView.miles % 10000).toLocaleString()} / 10,000 miles toward your next reward
              </p>

              <button
                disabled={loyaltyView.miles < 10000}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-white/80"
              >
                Redeem Miles
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
            Membership Benefits
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Your current tier perks
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {tier.cards.map((card) => (
              <div key={card.title} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.copy}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
            Quick Actions
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Keep earning faster
          </h2>
          <div className="mt-6 space-y-4">
            <QuickLink href="/search-flights" label="Book a flight" />
            <QuickLink href="/ai-planner" label="Plan with AI" />
            <QuickLink href="/my-bookings" label="View upcoming trips" />
          </div>
        </article>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/70">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function QuickLink({ href, label }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function getTierFromMiles(miles) {
  if (miles >= 15000) {
    return {
      label: "PLATINUM",
      badgeClassName: "bg-cyan-50 text-cyan-700",
      benefits: "Unlimited lounge, dedicated support, 4 upgrades, chauffeur",
      cards: [
        { title: "Unlimited Lounge", copy: "Relax in partner lounges on every eligible itinerary." },
        { title: "Dedicated Support", copy: "Priority care from a premium concierge support team." },
        { title: "Premium Ground Perks", copy: "Four upgrades and chauffeur-style transfer perks each year." },
      ],
    };
  }

  if (miles >= 5000) {
    return {
      label: "GOLD",
      badgeClassName: "bg-amber-50 text-amber-700",
      benefits: "Lounge access, 2 free upgrades, extra baggage allowance",
      cards: [
        { title: "Lounge Access", copy: "Use selected lounges before eligible departures." },
        { title: "Priority Comfort", copy: "Enjoy two upgrades and extra baggage flexibility." },
        { title: "Faster Travel Days", copy: "Shorter queues and smoother airport handling when available." },
      ],
    };
  }

  return {
    label: "SILVER",
    badgeClassName: "bg-slate-100 text-slate-700",
    benefits: "Priority check-in, 1 free seat upgrade per year",
    cards: [
      { title: "Priority Check-in", copy: "Move through the airport faster with preferred counters." },
      { title: "Annual Upgrade", copy: "Use one complimentary seat upgrade every membership year." },
      { title: "Member Pricing", copy: "See loyalty-focused rewards and milestone redemption progress." },
    ],
  };
}

function describeMilesToNextTier(miles) {
  if (miles >= 15000) {
    return "Top tier reached";
  }
  if (miles >= 5000) {
    return `${(15000 - miles).toLocaleString()} miles to Platinum`;
  }
  return `${(5000 - miles).toLocaleString()} miles to Gold`;
}

function safeParseStorage(key) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
