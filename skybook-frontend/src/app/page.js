import Link from "next/link";
import HomeHeroTabs from "@/components/travel/HomeHeroTabs";
import HeroImageSlideshow from "@/components/travel/HeroImageSlideshow";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import {
  DestinationCard,
  FeatureCard,
  PageHero,
  PageSection,
  TestimonialCard,
  TrendingTripCard,
} from "@/components/travel/TravelUI";
import {
  popularDestinations,
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
        eyebrow="Popular Destinations"
        title="Popular destination inspiration"
        description="These sections help the homepage feel complete and credible, while also giving beginners a clear example of reusable card-based layout patterns."
      >
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {popularDestinations.map((destination) => (
            <DestinationCard key={destination.id} destination={destination} />
          ))}
        </div>
      </PageSection>

      <PageSection
        eyebrow="Trending Trips"
        title="Bundles and routes people are checking right now"
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {trendingTrips.map((trip) => (
            <TrendingTripCard key={trip.id} trip={trip} />
          ))}
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
