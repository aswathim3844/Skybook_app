"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero } from "@/components/travel/TravelUI";
import { fetchAccount, fetchCountries, updateAccount } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useSavedStore } from "@/lib/saved-store";

const passwordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function AccountPageClient() {
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);
  const summary = useAuthStore((state) => state.summary);
  const setAuth = useAuthStore((state) => state.setAuth);
  const savedFlights = useSavedStore((state) => state.savedFlights);
  const savedHotels = useSavedStore((state) => state.savedHotels);
  const savedCars = useSavedStore((state) => state.savedCars);
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    country: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer?.customer_id) {
      router.replace("/login");
      return;
    }

    let active = true;

    async function loadAccountData() {
      try {
        setLoading(true);
        const [accountResponse, countriesResponse] = await Promise.all([
          fetchAccount(customer.customer_id),
          fetchCountries(),
        ]);

        if (!active) {
          return;
        }

        setAuth(accountResponse);
        setCountries(countriesResponse);
        setForm({
          name: accountResponse.customer.name || "",
          phone: accountResponse.customer.phone || "",
          country: accountResponse.customer.country ? String(accountResponse.customer.country) : "",
          password: "",
          confirmPassword: "",
        });
      } catch {
        if (active) {
          setMessageTone("error");
          setMessage("Could not load account details from the backend.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAccountData();
    return () => {
      active = false;
    };
  }, [customer?.customer_id, router, setAuth]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      let next = clearFieldError(current, field);

      if (field === "password" || field === "confirmPassword") {
        next = clearFieldError(next, "password");
        next = clearFieldError(next, "confirmPassword");
      }

      return next;
    });
    setMessage("");
  }

  function validateForm() {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = "Name is required.";
    }
    if (!form.phone.trim()) {
      errors.phone = "Phone number is required.";
    }
    if (!form.country) {
      errors.country = "Select a country.";
    }
    if (form.password || form.confirmPassword) {
      if (!passwordPattern.test(form.password)) {
        errors.password =
          "Use at least 8 characters with upper, lower, number, and symbol.";
      }
      if (form.password !== form.confirmPassword) {
        errors.confirmPassword = "Passwords do not match.";
      }
    }

    return errors;
  }

  async function handleSave() {
    const errors = validateForm();

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const response = await updateAccount(customer.customer_id, {
        name: form.name,
        phone: form.phone,
        country: form.country,
        password: form.password,
        confirm_password: form.confirmPassword,
      });

      setAuth({
        customer: response.customer,
        summary: response.summary,
      });
      setForm((current) => ({
        ...current,
        name: response.customer.name || "",
        phone: response.customer.phone || "",
        country: response.customer.country ? String(response.customer.country) : "",
        password: "",
        confirmPassword: "",
      }));
      setMessageTone("success");
      setMessage("Account details updated successfully.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error.payload?.message || "Could not update account.");
      if (error.payload?.errors) {
        setFieldErrors(error.payload.errors);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!customer) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        eyebrow="My Account"
        title={`Welcome, ${customer.name || customer.email}`}
        description="Keep your profile details up to date so planning and booking stays simple."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-orange-300">Basic profile</p>
          <p className="mt-3 text-2xl font-semibold">{customer.email}</p>
          <p className="mt-2 text-sm text-blue-100/85">
            {customer.phone || "No phone"} | {customer.country_name || "No country"}
          </p>
        </div>
      </PageHero>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        {message ? <MessageBox tone={messageTone} text={message} className="mb-6" /> : null}

        <div className="grid gap-5 lg:grid-cols-4">
          <SummaryCard label="Bookings" value={summary?.booking_count || 0} />
          <SummaryCard label="Upcoming trips" value={summary?.upcoming_trips || 0} />
          <SummaryCard
            label="Wishlist items"
            value={savedFlights.length + savedHotels.length + savedCars.length}
          />
          <SummaryCard label="Loyalty miles" value={summary?.loyalty_miles ?? summary?.loyalty_points ?? 0} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xl font-semibold text-slate-900">Edit profile</p>
            <p className="mt-2 text-sm text-slate-600">
              Update the main details used for your SkyBook account. Email stays fixed and
              continues to act as your username.
            </p>

            {loading ? (
              <div className="mt-6 rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Loading account form...
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Input
                  label="Display name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  error={fieldErrors.name}
                />
                <Input label="Email address" value={customer.email || ""} disabled readOnly />
                <Input
                  label="Phone number"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  error={fieldErrors.phone}
                />
                <Select
                  label="Country"
                  value={form.country}
                  onChange={(event) => updateField("country", event.target.value)}
                  error={fieldErrors.country}
                  options={countries}
                />
                <Input
                  label="New password"
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  error={fieldErrors.password}
                  placeholder="Leave blank to keep current password"
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => updateField("confirmPassword", event.target.value)}
                  error={fieldErrors.confirmPassword}
                  placeholder="Re-enter new password"
                />
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={loading || saving}
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving changes..." : "Save account changes"}
            </button>
          </article>

          <div className="space-y-6">
            <InfoCard
              title="Current details"
              lines={[
                `Name: ${customer.name || "Not added"}`,
                `Email: ${customer.email}`,
                `Phone: ${customer.phone || "Not added"}`,
                `Country: ${customer.country_name || "Not added"}`,
              ]}
            />
            <InfoCard
              title="Quick links"
              links={[
                { label: "Saved wishlist", href: "/saved" },
                { label: "Upcoming trips", href: "/my-bookings" },
                { label: "Search flights", href: "/search-flights" },
              ]}
            />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function SummaryCard({ label, value }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.22em] text-orange-500">{label}</p>
      <p className="mt-4 text-4xl font-semibold text-slate-900">{value}</p>
    </article>
  );
}

function InfoCard({ title, lines, links }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xl font-semibold text-slate-900">{title}</p>
      {lines ? (
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {links ? (
        <div className="mt-4 space-y-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-sm font-semibold text-[#173a7a] transition hover:text-orange-500"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Input({ label, error, className = "", ...props }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <input
        {...props}
        className={`min-h-12 w-full rounded-[20px] border px-4 text-slate-900 outline-none transition ${
          error
            ? "border-red-300 bg-red-50/60 focus:border-red-400"
            : props.disabled
              ? "border-slate-200 bg-slate-100 text-slate-500"
              : "border-slate-200 bg-slate-50 focus:border-[#173a7a]"
        }`}
      />
      {error ? <span className="mt-2 block text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

function Select({ label, error, options, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <select
        {...props}
        className={`min-h-12 w-full rounded-[20px] border px-4 text-slate-900 outline-none transition ${
          error
            ? "border-red-300 bg-red-50/60 focus:border-red-400"
            : "border-slate-200 bg-slate-50 focus:border-[#173a7a]"
        }`}
      >
        <option value="">Select country</option>
        {options.map((country) => (
          <option key={country.country_id} value={country.country_id}>
            {country.country_name}
          </option>
        ))}
      </select>
      {error ? <span className="mt-2 block text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

function MessageBox({ text, tone, className = "" }) {
  return (
    <div
      className={`rounded-[20px] border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      } ${className}`}
    >
      {text}
    </div>
  );
}

function clearFieldError(errors, field) {
  if (!errors[field]) {
    return errors;
  }

  const next = { ...errors };
  delete next[field];
  return next;
}
