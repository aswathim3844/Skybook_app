"use client";

import FlightSearchForm from "@/components/travel/FlightSearchForm";
import { DestinationCard } from "@/components/travel/TravelUI";
import { popularDestinations } from "@/lib/mock-data";

export default function HomeHeroTabs() {
  return (
    <div className="space-y-6">
      <FlightSearchForm />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {popularDestinations.map((destination) => (
          <DestinationCard key={destination.id} destination={destination} />
        ))}
      </div>
    </div>
  );
}
