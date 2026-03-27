import { BundleDealScreen } from "@/components/travel/BundleDealScreen";

export default async function BundleDealPage({ params }) {
  const resolvedParams = await params;

  return <BundleDealScreen slug={resolvedParams?.slug || ""} />;
}
