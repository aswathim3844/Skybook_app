import { BookingSummaryScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default function BookingSummaryPage({ searchParams }) {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <BookingSummaryScreen initialParams={searchParams || {}} />
    </main>
  );
}
