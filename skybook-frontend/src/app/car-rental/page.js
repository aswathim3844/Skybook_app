import { CarRentalScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default function CarRentalPage({ searchParams }) {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <CarRentalScreen initialParams={searchParams || {}} />
    </main>
  );
}
