import FlightSearchForm from "@/components/travel/FlightSearchForm";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero, SecondaryLink } from "@/components/travel/TravelUI";

export default function SearchFlightsPage() {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        eyebrow="Flight Search"
        title="Search flights with a focused booking flow"
        description="This page keeps manual search separate from AI planning so the user journey stays simple and easy to scan."
        actions={<SecondaryLink href="/ai-planner">Switch to AI planner</SecondaryLink>}
      >
        <div className="rounded-[36px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
          <div className="h-[320px] rounded-[28px] bg-[radial-gradient(circle_at_24%_20%,rgba(255,255,255,0.32),transparent_18%),linear-gradient(135deg,#90be6d,#43aa8b_45%,#173a7a)]" />
        </div>
      </PageHero>

      <section className="relative z-10 -mt-16 px-6 pb-6 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <FlightSearchForm />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
