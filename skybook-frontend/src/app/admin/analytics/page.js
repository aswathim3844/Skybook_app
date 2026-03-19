import AdminPage from "@/components/travel/AdminPage";

const analyticsCards = [
  {
    title: "Manual booking vs AI planning",
    value: "61% / 39%",
    detail: "Manual search still leads, but AI planning is already meaningful.",
  },
  {
    title: "Top destination",
    value: "Paris",
    detail: "High conversion on 5-day city-break prompts and manual searches.",
  },
  {
    title: "Best performing category",
    value: "Flight + Hotel",
    detail: "Bundles are generating the strongest order value uplift.",
  },
];

export default function AdminAnalyticsPage() {
  return (
    <AdminPage
      eyebrow="Admin Analytics"
      title="Analytics dashboard"
      description="High-level product metrics and simple insight cards for the admin view."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {analyticsCards.map((card) => (
          <article key={card.title} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.22em] text-orange-500">{card.title}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">{card.value}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{card.detail}</p>
          </article>
        ))}
      </div>
    </AdminPage>
  );
}
