import SiteFooter from "@/components/travel/SiteFooter";
import BundleDealsGrid from "@/components/travel/BundleDealsGrid";
import Navbar from "@/components/ui/Navbar";
import { PageHero, PageSection } from "@/components/travel/TravelUI";
import { bundleDeals } from "@/lib/mock-data";

export default function BundlesPage() {
  return (
    <main className="min-h-screen bg-[#f3f7ff] text-slate-900">
      <Navbar />

      <PageHero
        eyebrow="Bundle Deals"
        title="Pick a ready-made travel package"
        description="Choose from curated flight, hotel, and car bundles, then review the summary and continue straight to payment."
      />

      <PageSection eyebrow="Packages" title="Available bundles">
        <BundleDealsGrid bundles={bundleDeals} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" />
      </PageSection>

      <SiteFooter />
    </main>
  );
}
