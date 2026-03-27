import { CarRentalScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default async function CarRentalPage({ searchParams }) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <CarRentalScreen initialParams={params || {}} />
    </main>
  );
}
