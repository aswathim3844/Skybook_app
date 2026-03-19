import AdminPage, { AdminTable } from "@/components/travel/AdminPage";
import { adminBookings } from "@/lib/mock-data";

export default function AdminBookingsPage() {
  return (
    <AdminPage
      eyebrow="Admin Bookings"
      title="View bookings"
      description="Operations table for order status checks and support follow-up."
    >
      <AdminTable
        title="Recent bookings"
        columns={["Booking ID", "Customer", "Trip", "Status"]}
        rows={adminBookings}
      />
    </AdminPage>
  );
}
