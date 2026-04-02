"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleHelp, Crown, Gift, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

const LOYALTY_KEY = "skybook-loyalty";
const BOOKING_HISTORY_KEY = "skybook-ai-bookings";

export default function LoyaltyDashboardClient() {
  const customer = useAuthStore((state) => state.customer);
  const summary = useAuthStore((state) => state.summary);
  const [loyalty, setLoyalty] = useState({
    name: "",
    miles: 0,
    trips: 0,
    memberSince: null,
  });

  useEffect(() => {
    const storedLoyalty = safeParseStorage(LOYALTY_KEY);
    if (storedLoyalty) {
      setLoyalty(storedLoyalty);
      return;
    }

    const storedBookings = safeParseStorage(BOOKING_HISTORY_KEY, []);
    const normalizedBookings = Array.isArray(storedBookings) ? storedBookings : [];
    const computedMiles = normalizedBookings.reduce(
      (total, booking) => total + Number(booking.milesEarned || booking.total_price || 0),
      0
    );

    setLoyalty({
      name: "",
      miles: computedMiles,
      trips: normalizedBookings.length || 0,
      memberSince: null,
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOYALTY_KEY, JSON.stringify(loyalty));
    }
  }, [loyalty]);

  const displayName = customer?.name?.trim() || customer?.email?.split("@")[0] || loyalty.name || "Traveler";
  const loyaltyView = useMemo(() => {
    const persistedMiles = Number(loyalty?.miles || 0);
    const backendMiles = Number(summary?.loyalty_miles ?? summary?.loyalty_points ?? 0);
    const tripsTaken = Math.max(Number(summary?.booking_count || 0), Number(loyalty?.trips || 0));
    return {
      ...loyalty,
      name: displayName,
      miles: Math.max(persistedMiles, backendMiles),
      trips: tripsTaken,
      memberSince: formatMemberSince(loyalty?.joinedAt || customer?.created_at || loyalty?.memberSince),
    };
  }, [customer?.created_at, displayName, loyalty, summary?.booking_count, summary?.loyalty_miles, summary?.loyalty_points]);
  const tier = useMemo(() => getTierFromMiles(loyaltyView.miles), [loyaltyView.miles]);
  const rewardProgress = Math.min((loyaltyView.miles % 10000) / 100, 100);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_30%),linear-gradient(135deg,#09214d_0%,#173a7a_52%,#1f4f96_100%)] px-6 py-10 text-white sm:px-8 lg:px-10">
          <div className="grid gap-8 xl:grid-cols-[1.15fr_1.5fr_1fr] xl:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
                SkyBook Miles
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Welcome, {loyaltyView.name}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-blue-100/90">
                Track the miles you have earned from confirmed bookings, see your current tier,
                and understand what rewards unlock as your travel spend grows.
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
              <MetricCard icon={ShieldCheck} label="Confirmed Trips" value={`${loyaltyView.trips} trips`} />
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
                  <p className="mt-1 text-lg font-semibold">10,000 miles = $100 booking credit</p>
                </div>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-cyan-300"
                  style={{ width: `${rewardProgress}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-blue-100/85">
                {(loyaltyView.miles % 10000).toLocaleString()} / 10,000 miles toward your next travel credit
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
            Your current booking-linked perks
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
      benefits: "Priority support, waived service fees, flexible changes, and the fastest mile earning rate.",
      cards: [
        { title: "25% Bonus Miles", copy: "Earn miles faster on every eligible confirmed booking." },
        { title: "Flexible Booking Help", copy: "Get priority support and reduced change friction on supported trips." },
        { title: "Waived Service Fees", copy: "Selected service fees are reduced or removed for top-tier members." },
      ],
    };
  }

  if (miles >= 5000) {
    return {
      label: "GOLD",
      badgeClassName: "bg-amber-50 text-amber-700",
      benefits: "Bonus miles, faster support, and extra flexibility on eligible bookings.",
      cards: [
        { title: "15% Bonus Miles", copy: "Boost your earning rate on future flights and packages." },
        { title: "Priority Support", copy: "Reach customer support faster for active and upcoming trips." },
        { title: "Flexible Changes", copy: "Enjoy friendlier change support on selected booking types." },
      ],
    };
  }

  return {
    label: "SILVER",
    badgeClassName: "bg-slate-100 text-slate-700",
    benefits: "Base miles earning, member offers, and access to reward redemptions.",
    cards: [
      { title: "Base Miles Earn", copy: "Earn 1 mile for each eligible booking dollar spent." },
      { title: "Member Offers", copy: "See rewards-focused offers and milestone progress in one place." },
      { title: "Reward Access", copy: "Redeem miles for booking credits once you hit reward thresholds." },
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

function safeParseStorage(key, fallback = null) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function formatMemberSince(value) {
  if (!value) {
    return "New member";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "New member";
  }

  return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
