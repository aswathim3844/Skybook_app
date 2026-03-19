import Link from "next/link";
import AdminPage from "@/components/travel/AdminPage";

export default function AdminLoginPage() {
  return (
    <AdminPage
      eyebrow="Admin"
      title="Admin login"
      description="Frontend-only admin access page for managing travel inventory and viewing performance screens."
    >
      <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Credentials</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Input label="Admin email" placeholder="admin@skybook.test" />
          <Input label="Password" placeholder="••••••••" type="password" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/analytics"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Login to dashboard
          </Link>
        </div>
      </article>
    </AdminPage>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <input
        {...props}
        className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none"
      />
    </label>
  );
}
