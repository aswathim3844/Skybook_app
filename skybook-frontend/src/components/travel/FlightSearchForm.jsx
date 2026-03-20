"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarDays,
  MapPin,
  PlaneTakeoff,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { fetchFlightLocations } from "@/lib/api";
import { buildBookingQuery, useBookingStore } from "@/lib/booking-store";

const tripTypeOptions = [
  { value: "roundtrip", label: "Round trip" },
  { value: "oneway", label: "One way" },
  { value: "multicity", label: "Multi-city" },
];

export default function FlightSearchForm({
  actionHref = "/flight-results",
  submitLabel = "Search Flights",
  compact = false,
}) {
  const router = useRouter();
  const search = useBookingStore((state) => state.search);
  const setSearchField = useBookingStore((state) => state.setSearchField);
  const setSearch = useBookingStore((state) => state.setSearch);
  const [showConnectedRoute, setShowConnectedRoute] = useState(false);
  const [errors, setErrors] = useState({});
  const [locationOptions, setLocationOptions] = useState([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const validLocationTokens = useMemo(
    () =>
      new Set(
        locationOptions.flatMap((location) =>
          [
            location.label,
            location.city,
            location.city_code,
            `${location.city || ""}, ${location.country || ""}`.replace(/,\s*$/, ""),
          ]
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean)
        )
      ),
    [locationOptions]
  );

  useEffect(() => {
    let active = true;

    async function loadLocations() {
      try {
        const locations = await fetchFlightLocations();
        if (active) {
          setLocationOptions(Array.isArray(locations) ? locations : []);
        }
      } catch {
        if (active) {
          setLocationOptions([]);
        }
      } finally {
        if (active) {
          setLocationsLoaded(true);
        }
      }
    }

    loadLocations();

    return () => {
      active = false;
    };
  }, []);

  function handleFieldChange(field, value) {
    setSearchField(field, value);
    clearError(field);
  }

  function clearError(field) {
    setErrors((current) => {
      if (!current[field] && !current.form) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  function handleTripTypeChange(value) {
    setSearch({
      tripType: value,
      ...(value === "oneway" ? { returnDate: "" } : {}),
    });
    setShowConnectedRoute(value === "roundtrip");
    setErrors({});
  }

  function updateSegment(index, field, value) {
    const nextSegments = search.multiCitySegments.map((segment, segmentIndex) =>
      segmentIndex === index ? { ...segment, [field]: value } : segment
    );

    setSearch({ multiCitySegments: nextSegments });
    clearError(`segment-${index}`);
  }

  function addSegment() {
    const nextSegments = [
      ...search.multiCitySegments,
      {
        id: `segment-${Date.now()}`,
        from: "",
        to: "",
        departure: "",
      },
    ];

    setSearch({ multiCitySegments: nextSegments });
  }

  function validateSearch() {
    const nextErrors = {};

    if (search.tripType === "multicity") {
      search.multiCitySegments.forEach((segment, index) => {
        if (!segment.from.trim() || !segment.to.trim() || !segment.departure) {
          nextErrors[`segment-${index}`] = "Complete all fields for this flight.";
          return;
        }

        if (!isValidLocation(segment.from) || !isValidLocation(segment.to)) {
          nextErrors[`segment-${index}`] = "Choose departure and destination from the available list.";
        }
      });

      if (!search.passengers) {
        nextErrors.passengers = "Select the number of passengers.";
      }

      return nextErrors;
    }

    if (!search.from.trim()) {
      nextErrors.from = "Enter the departure city or airport.";
    } else if (!isValidLocation(search.from)) {
      nextErrors.from = "Choose a departure value from the available list.";
    }
    if (!search.to.trim()) {
      nextErrors.to = "Enter the destination city or airport.";
    } else if (!isValidLocation(search.to)) {
      nextErrors.to = "Choose a destination value from the available list.";
    }
    if (!search.departure) {
      nextErrors.departure = "Choose a departure date.";
    }
    if (search.tripType === "roundtrip" && !search.returnDate) {
      nextErrors.returnDate = "Choose a return date.";
    }
    if (
      search.from.trim() &&
      search.to.trim() &&
      search.from.trim().toLowerCase() === search.to.trim().toLowerCase()
    ) {
      nextErrors.to = "Destination should be different from departure.";
    }
    if (
      search.tripType === "roundtrip" &&
      search.departure &&
      search.returnDate &&
      search.returnDate < search.departure
    ) {
      nextErrors.returnDate = "Return date must be after departure date.";
    }
    if (!search.passengers) {
      nextErrors.passengers = "Select the number of passengers.";
    }

    return nextErrors;
  }

  function isValidLocation(value) {
    if (!value.trim()) {
      return false;
    }

    if (!locationsLoaded || locationOptions.length === 0) {
      return true;
    }

    return validLocationTokens.has(value.trim().toLowerCase());
  }

  function handleSubmit() {
    const nextErrors = validateSearch();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    router.push(`${actionHref}?${buildBookingQuery({ search })}`);
  }

  return (
    <div className={`rounded-[36px] border border-white/55 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:p-7 ${compact ? "" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
            Book Flights
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {search.tripType === "roundtrip" ? (
              <>
                <FlowChip active>Flight</FlowChip>
                <FlowArrow />
                <FlowChip>Hotel</FlowChip>
                <FlowArrow />
                <FlowChip>Car</FlowChip>
                <FlowArrow />
                <FlowChip>Summary</FlowChip>
                <FlowArrow />
                <FlowChip>Payment</FlowChip>
              </>
            ) : search.tripType === "oneway" ? (
              <>
                <FlowChip active>Flight</FlowChip>
                <FlowArrow />
                <FlowChip>Optional Hotel</FlowChip>
                <FlowArrow />
                <FlowChip>Optional Car</FlowChip>
              </>
            ) : (
              <>
                <FlowChip active>Flights</FlowChip>
                <FlowArrow />
                <FlowChip>Stopover Help</FlowChip>
                <FlowArrow />
                <FlowChip>Summary</FlowChip>
              </>
            )}
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Trip type
          </span>
          <select
            value={search.tripType}
            onChange={(event) => handleTripTypeChange(event.target.value)}
            className="min-h-12 rounded-full border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-700 outline-none"
          >
            {tripTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {search.tripType === "multicity" ? (
        <div className="mt-7 space-y-4">
          {search.multiCitySegments.map((segment, index) => (
            <div key={segment.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Flight {index + 1}
                </p>
                {errors[`segment-${index}`] ? (
                  <span className="text-xs font-medium text-red-600">{errors[`segment-${index}`]}</span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FieldCard icon={PlaneTakeoff} label="From">
                  <LocationInput
                    value={segment.from}
                    onChange={(value) => updateSegment(index, "from", value)}
                    options={locationOptions}
                    placeholder="Select a departure city"
                  />
                </FieldCard>
                <FieldCard icon={MapPin} label="To">
                  <LocationInput
                    value={segment.to}
                    onChange={(value) => updateSegment(index, "to", value)}
                    options={locationOptions}
                    placeholder="Select a destination city"
                  />
                </FieldCard>
                <FieldCard icon={CalendarDays} label="Departure Date">
                  <input
                    type="date"
                    value={segment.departure}
                    onChange={(event) => updateSegment(index, "departure", event.target.value)}
                    className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
                  />
                </FieldCard>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={addSegment}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              <Plus className="h-4 w-4" />
              Add another flight
            </button>

            <FieldCard icon={Users} label="Passengers" error={errors.passengers} className="w-full md:max-w-[260px]">
              <select
                value={search.passengers}
                onChange={(event) => handleFieldChange("passengers", event.target.value)}
                className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
              >
                <option>1 Adult</option>
                <option>2 Adults</option>
                <option>2 Adults, 1 Child</option>
                <option>4 Travelers</option>
              </select>
            </FieldCard>
          </div>
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {showConnectedRoute && search.tripType === "roundtrip" ? (
            <ConnectedRouteFields
              fromValue={search.from}
              toValue={search.to}
              fromError={errors.from}
              toError={errors.to}
              options={locationOptions}
              onFromChange={(value) => handleFieldChange("from", value)}
              onToChange={(value) => handleFieldChange("to", value)}
            />
          ) : (
            <>
              <FieldCard icon={PlaneTakeoff} label="From" error={errors.from}>
                <LocationInput
                  value={search.from}
                  onChange={(value) => handleFieldChange("from", value)}
                  options={locationOptions}
                  placeholder="Select a departure city"
                />
              </FieldCard>

              <FieldCard icon={MapPin} label="To" error={errors.to}>
                <LocationInput
                  value={search.to}
                  onChange={(value) => handleFieldChange("to", value)}
                  options={locationOptions}
                  placeholder="Select a destination city"
                />
              </FieldCard>
            </>
          )}

          <FieldCard icon={CalendarDays} label="Departure Date" error={errors.departure}>
            <input
              type="date"
              value={search.departure}
              onChange={(event) => handleFieldChange("departure", event.target.value)}
              className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </FieldCard>

          {search.tripType === "roundtrip" ? (
            <FieldCard icon={CalendarDays} label="Return Date" error={errors.returnDate}>
              <input
                type="date"
                value={search.returnDate}
                onChange={(event) => handleFieldChange("returnDate", event.target.value)}
                className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
              />
            </FieldCard>
          ) : (
            <FieldCard icon={Users} label="Passengers" error={errors.passengers}>
              <select
                value={search.passengers}
                onChange={(event) => handleFieldChange("passengers", event.target.value)}
                className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
              >
                <option>1 Adult</option>
                <option>2 Adults</option>
                <option>2 Adults, 1 Child</option>
                <option>4 Travelers</option>
              </select>
            </FieldCard>
          )}

          {search.tripType === "roundtrip" ? (
            <FieldCard icon={Users} label="Passengers" error={errors.passengers}>
              <select
                value={search.passengers}
                onChange={(event) => handleFieldChange("passengers", event.target.value)}
                className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
              >
                <option>1 Adult</option>
                <option>2 Adults</option>
                <option>2 Adults, 1 Child</option>
                <option>4 Travelers</option>
              </select>
            </FieldCard>
          ) : (
            <div />
          )}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-slate-500">
          {locationOptions.length > 0
            ? `Choose from ${locationOptions.length} available locations in the database.`
            : "Start typing and pick a location from the available list."}
        </div>
        <button
          onClick={handleSubmit}
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-orange-500 px-7 py-3 text-base font-semibold text-white transition hover:bg-orange-600 md:ml-auto"
        >
          <Search className="h-4 w-4" />
          {search.tripType === "multicity" ? "Search Multi-city Flights" : submitLabel}
        </button>
      </div>

    </div>
  );
}

function FieldCard({ icon: Icon, label, children, error, className = "" }) {
  return (
    <label
      className={`flex min-h-[122px] flex-col justify-center rounded-[24px] border bg-slate-50 px-4 py-4 shadow-sm ${
        error ? "border-red-300 bg-red-50/70" : "border-slate-200"
      } ${className}`}
    >
      <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <div className="rounded-[18px] border border-white/90 bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        {children}
      </div>
      {error ? <span className="mt-3 text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

function ConnectedRouteFields({
  fromValue,
  toValue,
  fromError,
  toError,
  options,
  onFromChange,
  onToChange,
}) {
  return (
    <div className="xl:col-span-2">
      <div
        className={`grid min-h-[122px] grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-[24px] border bg-slate-50 shadow-sm ${
          fromError || toError ? "border-red-300 bg-red-50/70" : "border-slate-200"
        }`}
      >
        <RouteInput
          icon={PlaneTakeoff}
          label="From"
          value={fromValue}
          options={options}
          onChange={onFromChange}
          className="rounded-none border-0 border-r border-slate-200"
        />
        <div className="flex items-center justify-center border-r border-slate-200 bg-white/60 px-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
            <ArrowRightLeft className="h-4 w-4" />
          </div>
        </div>
        <RouteInput
          icon={MapPin}
          label="To"
          value={toValue}
          options={options}
          onChange={onToChange}
          className="rounded-none border-0"
        />
      </div>
      {fromError || toError ? (
        <div className="mt-3 grid gap-1 text-xs font-medium text-red-600">
          {fromError ? <span>{fromError}</span> : null}
          {toError ? <span>{toError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function RouteInput({ icon: Icon, label, className = "", ...props }) {
  return (
    <label className={`flex min-h-[122px] flex-col justify-center px-5 py-4 ${className}`}>
      <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <div className="rounded-[18px] border border-white/90 bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <LocationInput {...props} />
      </div>
    </label>
  );
}

function LocationInput({
  value,
  onChange,
  options = [],
  placeholder = "Select a location",
}) {
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    const query = String(value || "").trim().toLowerCase();

    if (!query) {
      return options.slice(0, 8);
    }

    return options
      .filter((location) =>
        [location.label, location.city, location.country, location.city_code]
          .filter(Boolean)
          .some((part) => String(part).toLowerCase().includes(query))
      )
      .slice(0, 8);
  }, [options, value]);

  function handleSelect(nextValue) {
    onChange(nextValue);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        type="text"
        placeholder={placeholder}
        className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none"
      />
      {isOpen && filteredOptions.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.65rem)] z-20 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          {filteredOptions.map((location) => (
            <button
              key={location.id || location.label}
              type="button"
              onMouseDown={() => handleSelect(location.label)}
              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
            >
              <span className="text-sm font-semibold text-slate-900">{location.label}</span>
              {location.airport_name ? (
                <span className="text-xs text-slate-500">{location.airport_name}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FlowChip({ active = false, children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 ${
        active ? "bg-orange-500 text-white shadow-sm" : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

function FlowArrow() {
  return <span className="text-slate-300">→</span>;
}
