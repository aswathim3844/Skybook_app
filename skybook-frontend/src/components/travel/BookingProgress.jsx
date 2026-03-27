"use client";

import Link from "next/link";

const steps = [
  { id: "flights", label: "Flights" },
  { id: "hotel", label: "Hotel" },
  { id: "car", label: "Car" },
  { id: "summary", label: "Summary" },
  { id: "payment", label: "Payment" },
];

export default function BookingProgress({ currentStep, stepLinks = {} }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <section className="mx-auto max-w-7xl px-6 pt-8 sm:px-8 lg:px-12">
      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {steps.map((step, index) => {
            const isActive = index === currentIndex;
            const isComplete = index < currentIndex;

            const content = (
              <>
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    isActive
                      ? "bg-orange-500 text-white"
                      : isComplete
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <p
                    className={`text-sm font-semibold ${
                      isActive
                        ? "text-slate-900"
                        : isComplete
                          ? "text-emerald-700"
                          : "text-slate-500"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-400">
                    {isActive
                      ? "Current step"
                      : isComplete
                        ? "Completed"
                        : "Upcoming"}
                  </p>
                </div>
              </>
            );

            return (
              <div key={step.id} className="flex flex-1 items-center gap-3">
                {stepLinks[step.id] && !isActive ? (
                  <Link
                    href={stepLinks[step.id]}
                    className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-slate-50"
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}

                {index < steps.length - 1 ? (
                  <div className="hidden h-[2px] flex-1 rounded-full bg-slate-200 lg:block">
                    <div
                      className={`h-full rounded-full ${
                        isComplete ? "bg-emerald-500" : "bg-slate-200"
                      }`}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
