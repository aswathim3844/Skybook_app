import { redirect } from "next/navigation";

export default function AdminAnalyticsPage() {
  redirect(process.env.NEXT_PUBLIC_ADMIN_APP_URL || "http://localhost:3001/dashboard");
}
