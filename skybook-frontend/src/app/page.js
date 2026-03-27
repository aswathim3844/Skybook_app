import Link from "next/link";
import HomeHeroTabs from "@/components/travel/HomeHeroTabs";
import BundleDealsGrid from "@/components/travel/BundleDealsGrid";
import CarDealsSection from "@/components/travel/CarDealsSection";
import HeroImageSlideshow from "@/components/travel/HeroImageSlideshow";
import HotelDealsSection from "@/components/travel/HotelDealsSection";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import {
  FeatureCard,
  PageHero,
  PageSection,
  TestimonialCard,
} from "@/components/travel/TravelUI";
import {
  testimonials,
  trendingTrips,
  whyAiFeatures,
} from "@/lib/mock-data";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f3f7ff] text-slate-900">
      <Navbar />

      <PageHero
        topSlot={
          <div className="inline-flex rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur">
            <Link
              href="/"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900"
            >
              Book Flights
            </Link>
            <Link
              href="/ai-planner"
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white/85 transition hover:text-white"
            >
              AI Planner
            </Link>
          </div>
        }
        title="Plan Your Perfect Trip"
        description="Book flights, hotels, and cars — seamlessly in one smart platform."
        descriptionClassName="max-w-xl text-[1.08rem] font-medium italic leading-8 text-cyan-50 sm:text-[1.2rem]"
      >
        <HeroImageSlideshow />
      </PageHero>

      <section className="relative z-10 -mt-16 px-6 pb-6 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <HomeHeroTabs />
        </div>
      </section>

      <PageSection
        eyebrow="Hotel Stays"
        title="Book a hotel stay directly"
      >
        <HotelDealsSection />
      </PageSection>

      <PageSection
        eyebrow="Car Rentals"
        title="Book a rental car directly"
      >
        <CarDealsSection />
      </PageSection>

      <PageSection
        eyebrow="Trending Trips"
        title="Bundles and routes people are checking right now"
      >
        <BundleDealsGrid bundles={trendingTrips} limit={3} className="grid gap-5 lg:grid-cols-3" />
        <div className="mt-6">
          <Link
            href="/bundles"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-orange-200 hover:text-orange-500"
          >
            Show more bundles
          </Link>
        </div>
      </PageSection>

      <PageSection
        eyebrow="Why AI"
        title="Why use AI Travel Planner"
        description="Manual booking is still available, but the AI path reduces the mental work of comparing multiple categories by yourself."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {whyAiFeatures.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </PageSection>

      <PageSection
        eyebrow="Testimonials"
        title="Customer feedback"
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>
      </PageSection>

      <SiteFooter />
    </main>
  );
}
