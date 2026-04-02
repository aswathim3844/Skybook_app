import { BundleDealScreen } from "@/components/travel/BundleDealScreen";

export default async function BundleDealPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <BundleDealScreen
      slug={resolvedParams?.slug || ""}
      initialParams={{
        departure: resolvedSearchParams?.departure || "",
        return: resolvedSearchParams?.return || "",
      }}
    />
  );
}
