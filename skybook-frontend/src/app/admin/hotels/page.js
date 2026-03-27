import { redirect } from "next/navigation";

export default function AdminHotelsPage() {
  redirect(process.env.NEXT_PUBLIC_ADMIN_APP_URL || "http://localhost:3001/hotels");
}
