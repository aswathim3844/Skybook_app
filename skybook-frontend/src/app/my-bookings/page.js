import MyBookingsClient from "@/components/travel/MyBookingsClient";

export default async function MyBookingsPage({ searchParams }) {
  const params = await searchParams;
  return <MyBookingsClient confirmed={params?.confirmed === "true"} />;
}
