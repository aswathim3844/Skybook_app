import { ReturnFlightSelectionScreen } from "@/components/travel/BookingFlowScreens";

export default async function ReturnFlightSelectionPage({ searchParams }) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-slate-900">
      <ReturnFlightSelectionScreen initialParams={params || {}} />
    </main>
  );
}
