import { redirect } from "next/navigation";

export default function AdminCarsPage() {
  redirect(process.env.NEXT_PUBLIC_ADMIN_APP_URL || "http://localhost:3001/cars");
}
