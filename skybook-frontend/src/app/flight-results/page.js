import { FlightResultsScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default function FlightResultsPage({ searchParams }) {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <FlightResultsScreen initialParams={searchParams || {}} />
    </main>
  );
}
