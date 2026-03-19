import AdminPage, { AdminTable } from "@/components/travel/AdminPage";
import { adminFlights } from "@/lib/mock-data";

export default function AdminFlightsPage() {
  return (
    <AdminPage
      eyebrow="Admin Flights"
      title="Manage flights"
      description="Inventory-style admin table for flight routes, airlines, seat counts, and fares."
    >
      <AdminTable
        title="Flight inventory"
        columns={["Route", "Airline", "Seats", "Fare"]}
        rows={adminFlights}
      />
    </AdminPage>
  );
}
