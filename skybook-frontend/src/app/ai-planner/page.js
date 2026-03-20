import AIPlannerExperience from "@/components/travel/AIPlannerExperience";
import Link from "next/link";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero } from "@/components/travel/TravelUI";

export default function AIPlannerPage() {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        topSlot={
          <div className="inline-flex rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur">
            <Link
              href="/"
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white/85 transition hover:text-white"
            >
              Book Flights
            </Link>
            <Link
              href="/ai-planner"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900"
            >
              AI Planner
            </Link>
          </div>
        }
        title="AI Trip Planner That Books The Whole Journey"
      />

      <section className="mx-auto max-w-7xl px-6 py-10 sm:px-8 lg:px-12">
        <AIPlannerExperience />
      </section>

      <SiteFooter />
    </main>
  );
}
