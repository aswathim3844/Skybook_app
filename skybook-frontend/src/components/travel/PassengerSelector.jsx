"use client";

const MAX_ADULTS = 8;
const MAX_CHILDREN = 6;

export default function PassengerSelector({
  value,
  onChange,
  dark = false,
}) {
  const counts = parsePassengerValue(value);

  function updateCounts(nextAdults, nextChildren) {
    const adults = Math.max(1, Math.min(MAX_ADULTS, Number(nextAdults || 1)));
    const children = Math.max(0, Math.min(MAX_CHILDREN, Number(nextChildren || 0)));
    onChange(formatPassengerValue({ adults, children }));
  }

  return (
    <div className="space-y-3">
      <PassengerRow
        label="Adults"
        description="18+ Years Old"
        value={counts.adults}
        dark={dark}
        onDecrease={() => updateCounts(counts.adults - 1, counts.children)}
        onIncrease={() => updateCounts(counts.adults + 1, counts.children)}
      />
      <PassengerRow
        label="Children"
        description="0 - 17 Years Old"
        value={counts.children}
        dark={dark}
        onDecrease={() => updateCounts(counts.adults, counts.children - 1)}
        onIncrease={() => updateCounts(counts.adults, counts.children + 1)}
      />
    </div>
  );
}

function PassengerRow({ label, description, value, onDecrease, onIncrease, dark }) {
  const shellClassName = dark
    ? "border-white/20 bg-white/10 text-white"
    : "border-slate-200 bg-white text-slate-900";
  const buttonClassName = dark
    ? "text-white/80 hover:bg-white/10"
    : "text-slate-500 hover:bg-slate-100";
  const secondaryTextClassName = dark ? "text-blue-100/75" : "text-slate-400";

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className={`text-base font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{label}</p>
        <p className={`text-sm ${secondaryTextClassName}`}>{description}</p>
      </div>
      <div className={`flex items-center overflow-hidden rounded-2xl border ${shellClassName}`}>
        <button
          type="button"
          onClick={onDecrease}
          className={`inline-flex h-11 w-11 items-center justify-center text-xl transition ${buttonClassName}`}
        >
          -
        </button>
        <span className="inline-flex min-w-10 items-center justify-center text-lg font-semibold">
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          className={`inline-flex h-11 w-11 items-center justify-center text-xl transition ${buttonClassName}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function parsePassengerValue(value) {
  const text = String(value || "").trim();
  const adultsMatch = text.match(/(\d+)\s*Adult/i);
  const childrenMatch = text.match(/(\d+)\s*Child/i);
  const travelersMatch = text.match(/(\d+)\s*Traveler/i);

  const adults = Number(adultsMatch?.[1] || travelersMatch?.[1] || 1);
  const children = Number(childrenMatch?.[1] || 0);

  return {
    adults: Math.max(1, adults),
    children: Math.max(0, children),
  };
}

export function formatPassengerValue({ adults, children }) {
  const safeAdults = Math.max(1, Number(adults || 1));
  const safeChildren = Math.max(0, Number(children || 0));

  if (safeChildren > 0) {
    return `${safeAdults} Adult${safeAdults === 1 ? "" : "s"}, ${safeChildren} Child${safeChildren === 1 ? "" : "ren"}`;
  }

  return `${safeAdults} Adult${safeAdults === 1 ? "" : "s"}`;
}
