import AIPlannerExperience from "@/components/travel/AIPlannerExperience";
import HeroImageSlideshow from "@/components/travel/HeroImageSlideshow";
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
        title="Chat-first travel planning"
        description="Tell us where you want to go — our AI builds the perfect journey."
        descriptionClassName="max-w-xl text-[1.08rem] font-medium italic leading-8 text-cyan-50 sm:text-[1.2rem]"
      >
        <HeroImageSlideshow />
      </PageHero>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        <AIPlannerExperience />
      </section>

      <SiteFooter />
    </main>
  );
}
