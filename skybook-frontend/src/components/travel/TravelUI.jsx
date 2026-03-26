"use client";

import Link from "next/link";
import {
  ArrowRight,
  CarFront,
  CloudSun,
  CreditCard,
  Heart,
  MapPinned,
  PlaneTakeoff,
  ShieldCheck,
  Sparkles,
  Star,
  TrainFront,
  UtensilsCrossed,
} from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";

const guideIcons = {
  CloudSun,
  MapPinned,
  TrainFront,
  UtensilsCrossed,
};

export function PageSection({
  eyebrow,
  title,
  description,
  children,
  className = "",
}) {
  return (
    <section className={`mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12 ${className}`}>
      {(eyebrow || title || description) && (
        <div className="mb-8 max-w-2xl">
          {eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-orange-500">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
              {description}
            </p>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function GradientThumbnail({
  image,
  title,
  caption,
  height = "h-40",
  rounded = "rounded-[28px]",
}) {
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${height}`}
      style={{ backgroundImage: image }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <p className="text-lg font-semibold">{title}</p>
        {caption ? <p className="mt-1 text-sm text-white/80">{caption}</p> : null}
      </div>
    </div>
  );
}

export function DestinationCard({ destination }) {
  return (
    <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <GradientThumbnail
        image={destination.image}
        title={`${destination.city}, ${destination.country}`}
        caption={destination.tagline}
      />
      <div className="space-y-3 p-5">
        <p className="text-sm text-slate-500">From {formatCurrency(destination.startingPrice)}</p>
        <Link
          href={`/flight-results?to=${encodeURIComponent(destination.city)}&departure=2026-04-18&return=2026-04-23&passengers=2`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#173a7a] transition hover:text-orange-500"
        >
          Explore this route
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export function TrendingTripCard({ trip }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
        {trip.badge}
      </span>
      <h3 className="mt-4 text-xl font-semibold text-slate-900">{trip.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{trip.description}</p>
      <p className="mt-5 text-lg font-semibold text-slate-900">{formatCurrency(trip.price)}</p>
    </article>
  );
}

export function FeatureCard({ title, description }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

export function TestimonialCard({ testimonial }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-1 text-orange-500">
        <Star className="h-4 w-4 fill-current" />
        <Star className="h-4 w-4 fill-current" />
        <Star className="h-4 w-4 fill-current" />
        <Star className="h-4 w-4 fill-current" />
        <Star className="h-4 w-4 fill-current" />
      </div>
      <p className="mt-4 text-base leading-7 text-slate-700">
        &quot;{testimonial.quote}&quot;
      </p>
      <div className="mt-6">
        <p className="font-semibold text-slate-900">{testimonial.name}</p>
        <p className="text-sm text-slate-500">{testimonial.role}</p>
      </div>
    </article>
  );
}

export function FlightCard({
  flight,
  href,
  buttonLabel = "Select",
  accentClassName,
  onSelect,
  isSaved = false,
  onToggleSave,
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-semibold text-white ${accentClassName || flight.accent}`}
          >
            {flight.logo}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">{flight.airline}</p>
            <p className="text-sm text-slate-500">{flight.code}</p>
          </div>
        </div>

        <div className="grid flex-1 gap-3 text-sm text-slate-600 sm:grid-cols-3 xl:px-6">
          <div className="min-w-0 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Departure</p>
            <p className="mt-2 text-xl font-semibold leading-none text-slate-900">{flight.departure}</p>
          </div>
          <div className="min-w-0 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Arrival</p>
            <p className="mt-2 text-xl font-semibold leading-none text-slate-900">{flight.arrival}</p>
          </div>
          <div className="min-w-0 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Duration</p>
            <p className="mt-2 text-xl font-semibold leading-none text-slate-900">{flight.duration}</p>
            <p className="mt-2 text-xs text-slate-500">{flight.stops}</p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 xl:items-end">
          <p className="text-2xl font-semibold text-slate-900">{formatCurrency(flight.price)}</p>
          {onToggleSave ? (
            <button
              onClick={onToggleSave}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                isSaved
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Heart className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
              {isSaved ? "Saved" : "Save"}
            </button>
          ) : null}
          {onSelect ? (
            <button
              onClick={onSelect}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              {buttonLabel}
            </button>
          ) : (
            <Link
              href={href}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              {buttonLabel}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCard({
  item,
  href,
  buttonLabel = "Select",
  pricePrefix = "From",
  onSelect,
  isSaved = false,
  onToggleSave,
}) {
  return (
    <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
      <GradientThumbnail image={item.image} title={item.name} caption={item.details} />
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{item.location || item.type}</p>
          <p className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
            {item.rating}
          </p>
        </div>
        <p className="text-lg font-semibold text-slate-900">{item.name}</p>
        <p className="text-sm leading-6 text-slate-600">{item.details}</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{pricePrefix}</p>
            <p className="text-xl font-semibold text-slate-900">
              {formatCurrency(item.pricePerDay)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {onToggleSave ? (
              <button
                onClick={onToggleSave}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isSaved
                    ? "bg-red-50 text-red-600 hover:bg-red-100"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Heart className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
                {isSaved ? "Saved" : "Save"}
              </button>
            ) : null}
            {onSelect ? (
              <button
                onClick={onSelect}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                {buttonLabel}
              </button>
            ) : (
              <Link
                href={href}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                {buttonLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function SummaryPanel({
  flight,
  hotel,
  car,
  total,
  ctaHref,
  ctaLabel,
  title = "Booking Summary",
  description = "Review everything before continuing.",
}) {
  return (
    <aside className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
        Summary
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

      <div className="mt-6 space-y-4">
        <SummaryItem
          icon={PlaneTakeoff}
          title="Selected Flight"
          name={flight ? `${flight.airline} ${flight.code}` : "Not selected yet"}
          price={flight ? flight.price : 0}
        />
        <SummaryItem
          icon={ShieldCheck}
          title="Selected Hotel"
          name={hotel ? hotel.name : "Not selected yet"}
          price={hotel ? hotel.pricePerDay : 0}
        />
        <SummaryItem
          icon={CarFront}
          title="Selected Car"
          name={car ? car.name : "Not selected yet"}
          price={car ? car.pricePerDay : 0}
        />
      </div>

      <div className="mt-6 rounded-[24px] bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Total price</p>
          <p className="text-2xl font-semibold text-slate-900">{formatCurrency(total)}</p>
        </div>
      </div>

      <Link
        href={ctaHref}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
      >
        {ctaLabel}
      </Link>
    </aside>
  );
}

function SummaryItem({ icon: Icon, title, name, price }) {
  return (
    <div className="flex items-center justify-between rounded-[24px] border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
          <p className="mt-1 font-semibold text-slate-900">{name}</p>
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-900">{formatCurrency(price)}</p>
    </div>
  );
}

export function AIRecommendationCard({ item, selected = false }) {
  return (
    <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
      <GradientThumbnail image={item.image} title={item.title} caption={item.name} />
      <div className="space-y-4 p-5">
        <p className="text-sm leading-6 text-slate-600">{item.details}</p>
        <div className="flex items-center justify-between">
          <p className="text-xl font-semibold text-slate-900">
            {item.price ? formatCurrency(item.price) : "Included in plan"}
          </p>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
              selected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {selected ? "Selected" : "Suggested"}
          </span>
        </div>
      </div>
    </article>
  );
}

export function TravelGuideCard({ item }) {
  const Icon = guideIcons[item.icon];

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
        {Icon ? <Icon className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
      </div>
      <h3 className="mt-5 text-xl font-semibold text-slate-900">{item.title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
    </article>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  children,
  topSlot,
  descriptionClassName = "",
}) {
  return (
    <section className="hero-section-bg relative overflow-hidden px-6 py-16 text-white sm:px-8 lg:px-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.16),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(255,255,255,0.12),transparent_22%),linear-gradient(120deg,rgba(255,255,255,0.06),transparent_40%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
        <div className="max-w-2xl">
          {topSlot ? <div className="mb-2">{topSlot}</div> : null}
          <div className="pt-4 sm:pt-5">
          {eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-orange-300">
              {eyebrow}
            </p>
          ) : null}
          <h1 className={`${eyebrow ? "mt-3" : "mt-0"} text-4xl font-semibold tracking-tight sm:text-5xl`}>
            {title}
          </h1>
          <p className={`mt-3 text-base leading-7 text-blue-100/90 sm:text-lg ${descriptionClassName}`}>
            {description}
          </p>
          {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
          </div>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export function PrimaryLink({ href, children }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
    >
      {children}
    </Link>
  );
}
