import Link from "next/link";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import {
  PageHero,
  PageSection,
  TravelGuideCard,
} from "@/components/travel/TravelUI";
import { itinerary, travelGuide } from "@/lib/mock-data";

export default function TripConfirmedPage() {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        eyebrow="Success"
        title="Trip confirmed"
        description="After confirmation, the user sees a success state, a concise booking summary, and helpful travel guidance instead of a blank completion screen."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Booking confirmation</p>
          <p className="mt-3 text-3xl font-semibold">SKY-2026-0418</p>
          <p className="mt-2 text-sm text-blue-100/85">
            Paris · 5-day AI planned trip with bundled recommendations.
          </p>
        </div>
      </PageHero>

      <PageSection eyebrow="Trip Summary" title="Confirmed itinerary">
        <div className="grid gap-5 lg:grid-cols-2">
          {itinerary.map((day) => (
            <article key={day.day} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-orange-500">{day.day}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{day.title}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{day.detail}</p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection
        eyebrow="Travel Guide"
        title="Helpful local guidance"
        description="These cards make the confirmation screen more useful by turning it into the start of the trip, not just the end of checkout."
      >
        <div className="grid gap-5 lg:grid-cols-4">
          {travelGuide.map((item) => (
            <TravelGuideCard key={item.id} item={item} />
          ))}
        </div>
        <Link
          href="/my-bookings"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          Go to My Bookings
        </Link>
      </PageSection>

      <SiteFooter />
    </main>
  );
}
