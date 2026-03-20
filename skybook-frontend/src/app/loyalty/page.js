import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import LoyaltyDashboardClient from "@/components/travel/LoyaltyDashboardClient";

export default function LoyaltyPage() {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        <LoyaltyDashboardClient />
      </section>
      <SiteFooter />
    </main>
  );
}
