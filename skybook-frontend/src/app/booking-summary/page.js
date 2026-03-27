import { BookingSummaryScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default async function BookingSummaryPage({ searchParams }) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <BookingSummaryScreen initialParams={params || {}} />
    </main>
  );
}
