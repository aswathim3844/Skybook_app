import { HotelSelectionScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default async function HotelSelectionPage({ searchParams }) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <HotelSelectionScreen initialParams={params || {}} />
    </main>
  );
}
