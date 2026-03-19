import AdminPage, { AdminTable } from "@/components/travel/AdminPage";
import { adminHotels } from "@/lib/mock-data";

export default function AdminHotelsPage() {
  return (
    <AdminPage
      eyebrow="Admin Hotels"
      title="Manage hotels"
      description="Hotel inventory view with room counts and current nightly rates."
    >
      <AdminTable
        title="Hotel inventory"
        columns={["Hotel", "City", "Rooms", "Rate"]}
        rows={adminHotels}
      />
    </AdminPage>
  );
}
