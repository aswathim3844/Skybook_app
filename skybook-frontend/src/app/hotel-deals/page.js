import HotelDealsPageClient from "@/components/travel/HotelDealsPageClient";

export default async function HotelDealsPage({ searchParams }) {
  const params = await searchParams;
  return <HotelDealsPageClient initialHotelId={params?.hotel || ""} />;
}
