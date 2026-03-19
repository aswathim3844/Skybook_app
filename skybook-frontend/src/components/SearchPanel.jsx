"use client";

import { useState } from "react";
import {
  BedDouble,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  ChevronDown,
  Clock3,
  MapPin,
  Package,
  PlaneTakeoff,
  Search,
  Users,
} from "lucide-react";

const tabs = [
  {
    id: "flights",
    label: "Flights",
    icon: PlaneTakeoff,
    helper: "Search routes across airlines",
  },
  {
    id: "bundle",
    label: "Flights + Hotels + Car",
    icon: Package,
    helper: "Build a full trip package",
  },
  {
    id: "hotels",
    label: "Hotels",
    icon: BedDouble,
    helper: "Compare rooms and stays",
  },
  {
    id: "cars",
    label: "Cars",
    icon: CarFront,
    helper: "Reserve a rental car",
  },
];

const tripTypes = [
  { id: "round-trip", label: "Round trip" },
  { id: "one-way", label: "One way" },
  { id: "multi-city", label: "Multi-city" },
];

const SearchPanel = () => {
  const [activeTab, setActiveTab] = useState("flights");
  const [tripType, setTripType] = useState("round-trip");
  const [cabinType, setCabinType] = useState("Economy");
  const [travelers, setTravelers] = useState("1 Adult");

  const showFlightControls = activeTab === "flights" || activeTab === "bundle";

  const renderFields = () => {
    if (activeTab === "flights") {
      return (
        <>
          <FieldCard
            label="Leaving from"
            icon={PlaneTakeoff}
            className="lg:col-span-3"
          >
            <input
              type="text"
              defaultValue="Kochi, COK"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard label="Going to" icon={MapPin} className="lg:col-span-3">
            <input
              type="text"
              placeholder="Search destination"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Departing"
            icon={CalendarDays}
            className="sm:col-span-2 lg:col-span-2"
          >
            <input
              type="date"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Returning"
            icon={CalendarDays}
            className="sm:col-span-2 lg:col-span-2"
          >
            <input
              type="date"
              disabled={tripType === "one-way"}
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
            />
          </FieldCard>

          <FieldCard
            label="Passenger(s)"
            icon={Users}
            className="sm:col-span-2 lg:col-span-2"
          >
            <select
              value={travelers}
              onChange={(event) => setTravelers(event.target.value)}
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            >
              <option>1 Adult</option>
              <option>2 Adults</option>
              <option>2 Adults, 1 Child</option>
              <option>4 Travelers</option>
            </select>
          </FieldCard>
        </>
      );
    }

    if (activeTab === "bundle") {
      return (
        <>
          <FieldCard
            label="Departure airport"
            icon={PlaneTakeoff}
            className="lg:col-span-3"
          >
            <input
              type="text"
              placeholder="City or airport"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Destination"
            icon={MapPin}
            className="lg:col-span-3"
          >
            <input
              type="text"
              placeholder="Where are you going?"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Departure"
            icon={CalendarDays}
            className="sm:col-span-2 lg:col-span-2"
          >
            <input
              type="date"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Return"
            icon={CalendarDays}
            className="sm:col-span-2 lg:col-span-2"
          >
            <input
              type="date"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Rooms"
            icon={BedDouble}
            className="sm:col-span-2 lg:col-span-1"
          >
            <select className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none">
              <option>1 Room</option>
              <option>2 Rooms</option>
              <option>3 Rooms</option>
            </select>
          </FieldCard>

          <FieldCard
            label="Car pickup"
            icon={CarFront}
            className="sm:col-span-2 lg:col-span-2"
          >
            <input
              type="text"
              placeholder="Airport or city center"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>
        </>
      );
    }

    if (activeTab === "hotels") {
      return (
        <>
          <FieldCard
            label="Destination"
            icon={MapPin}
            className="lg:col-span-4"
          >
            <input
              type="text"
              placeholder="City, landmark, or hotel"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Check-in"
            icon={CalendarDays}
            className="sm:col-span-2 lg:col-span-2"
          >
            <input
              type="date"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Check-out"
            icon={CalendarDays}
            className="sm:col-span-2 lg:col-span-2"
          >
            <input
              type="date"
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          <FieldCard
            label="Guests"
            icon={Users}
            className="sm:col-span-2 lg:col-span-2"
          >
            <select className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none">
              <option>2 Guests</option>
              <option>1 Guest</option>
              <option>3 Guests</option>
              <option>Family room</option>
            </select>
          </FieldCard>

          <FieldCard
            label="Rooms"
            icon={BedDouble}
            className="sm:col-span-2 lg:col-span-2"
          >
            <select className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none">
              <option>1 Room</option>
              <option>2 Rooms</option>
              <option>Suite</option>
            </select>
          </FieldCard>
        </>
      );
    }

    return (
      <>
        <FieldCard
          label="Pickup location"
          icon={MapPin}
          className="lg:col-span-4"
        >
          <input
            type="text"
            placeholder="Airport, city, or branch"
            className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
          />
        </FieldCard>

        <FieldCard
          label="Pickup date"
          icon={CalendarDays}
          className="sm:col-span-2 lg:col-span-2"
        >
          <input
            type="date"
            className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
          />
        </FieldCard>

        <FieldCard
          label="Pickup time"
          icon={Clock3}
          className="sm:col-span-2 lg:col-span-2"
        >
          <input
            type="time"
            className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
          />
        </FieldCard>

        <FieldCard
          label="Drop-off date"
          icon={CalendarDays}
          className="sm:col-span-2 lg:col-span-2"
        >
          <input
            type="date"
            className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
          />
        </FieldCard>

        <FieldCard
          label="Driver age"
          icon={Users}
          className="sm:col-span-2 lg:col-span-2"
        >
          <select className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none">
            <option>30+</option>
            <option>25+</option>
            <option>21+</option>
          </select>
        </FieldCard>
      </>
    );
  };

  return (
    <section className="overflow-hidden rounded-[32px] border border-white/55 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex min-w-[150px] flex-1 items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all sm:flex-none ${
              activeTab === tab.id
                ? "bg-[#16366f] text-white shadow-lg shadow-blue-900/20"
                : "bg-transparent text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            <tab.icon className="h-5 w-5" />
            <span>
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span
                className={`block text-xs ${
                  activeTab === tab.id ? "text-blue-100/85" : "text-slate-400"
                }`}
              >
                {tab.helper}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          {showFlightControls ? (
            <div className="flex flex-wrap gap-2 rounded-full bg-slate-100 p-1">
              {tripTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setTripType(type.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    tripType === type.id
                      ? "bg-white text-[#16366f] shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
              Flexible search for {activeTab === "hotels" ? "hotels" : "car rentals"}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {showFlightControls && (
              <label className="relative flex min-w-[150px] items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
                <span className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 text-slate-400" />
                  {cabinType}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
                <select
                  value={cabinType}
                  onChange={(event) => setCabinType(event.target.value)}
                  className="absolute inset-0 opacity-0"
                >
                  <option>Economy</option>
                  <option>Premium Economy</option>
                  <option>Business</option>
                  <option>First Class</option>
                </select>
              </label>
            )}

            {activeTab === "bundle" && (
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Save more by combining flights, hotels, and a car in one search.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {renderFields()}

          <button className="flex items-center justify-center gap-2 rounded-[22px] bg-[#1e63dd] px-6 py-4 text-base font-semibold text-white transition hover:bg-[#1958c7] lg:col-span-2">
            <Search className="h-5 w-5" />
            Search
          </button>
        </div>
      </div>
    </section>
  );
};

const FieldCard = ({ label, icon: Icon, children, className = "" }) => {
  return (
    <label
      className={`flex min-h-[92px] flex-col justify-center rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-300 hover:shadow-md ${className}`}
    >
      <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {children}
    </label>
  );
};

export default SearchPanel;
