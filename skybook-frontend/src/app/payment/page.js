import { PaymentScreen } from "@/components/travel/BookingFlowScreens";
import Navbar from "@/components/ui/Navbar";

export default function PaymentPage({ searchParams }) {
  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />
      <PaymentScreen initialParams={searchParams || {}} />
    </main>
  );
}
