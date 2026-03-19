import { HotelSelectionScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default function HotelSelectionPage({ searchParams }) {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <HotelSelectionScreen initialParams={searchParams || {}} />
    </main>
  );
}
