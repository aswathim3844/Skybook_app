import Link from "next/link";

const footerColumns = [
  {
    title: "Explore",
    links: [
      { label: "Home", href: "/" },
      { label: "Search flights", href: "/search-flights" },
      { label: "AI planner", href: "/ai-planner" },
      { label: "My bookings", href: "/my-bookings" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Why SkyBook", href: "/" },
      { label: "Support", href: "/login" },
      { label: "Admin login", href: "/admin/login" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:px-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:px-12">
        <div className="max-w-md">
          <p className="text-2xl font-semibold tracking-tight text-slate-900">SkyBook</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Professional travel booking frontend with manual search and AI planning
            in one clear journey.
          </p>
          <p className="mt-6 text-sm text-slate-500">
            Contact: hello@skybook.test | +1 (800) 555-0148
          </p>
        </div>

        {footerColumns.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
              {column.title}
            </p>
            <div className="mt-4 space-y-3">
              {column.links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="block text-sm text-slate-600 transition hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}
