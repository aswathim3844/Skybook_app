import CarDealsPageClient from "@/components/travel/CarDealsPageClient";

export default async function CarDealsPage({ searchParams }) {
  const params = await searchParams;
  return <CarDealsPageClient initialCarId={params?.car || ""} />;
}
