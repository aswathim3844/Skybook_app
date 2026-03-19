import AdminPage, { AdminTable } from "@/components/travel/AdminPage";
import { adminCars } from "@/lib/mock-data";

export default function AdminCarsPage() {
  return (
    <AdminPage
      eyebrow="Admin Cars"
      title="Manage cars"
      description="Rental fleet view with inventory counts and current per-day rates."
    >
      <AdminTable
        title="Car inventory"
        columns={["Vehicle", "Location", "Inventory", "Rate"]}
        rows={adminCars}
      />
    </AdminPage>
  );
}
