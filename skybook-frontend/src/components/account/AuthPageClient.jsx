"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { PageHero } from "@/components/travel/TravelUI";
import { fetchCountries, loginCustomer, registerCustomer } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const passwordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function AuthPageClient() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [countries, setCountries] = useState([]);
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });
  const [registerForm, setRegisterForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    country: "",
  });
  const [loginErrors, setLoginErrors] = useState({});
  const [registerErrors, setRegisterErrors] = useState({});
  const [loginMessage, setLoginMessage] = useState("");
  const [registerMessage, setRegisterMessage] = useState("");
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [submittingRegister, setSubmittingRegister] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCountries() {
      try {
        const data = await fetchCountries();
        if (active) {
          setCountries(data);
        }
      } catch {
        if (active) {
          setRegisterMessage("Could not load countries from the backend.");
        }
      }
    }

    loadCountries();
    return () => {
      active = false;
    };
  }, []);

  function updateLoginField(field, value) {
    setLoginForm((current) => ({ ...current, [field]: value }));
    setLoginErrors((current) => clearFieldError(current, field));
    setLoginMessage("");
  }

  function updateRegisterField(field, value) {
    setRegisterForm((current) => ({ ...current, [field]: value }));
    setRegisterErrors((current) => clearFieldError(current, field));
    setRegisterMessage("");
  }

  function validateLogin() {
    const errors = {};

    if (!loginForm.email.trim()) {
      errors.email = "Enter your email address.";
    }
    if (!loginForm.password) {
      errors.password = "Enter your password.";
    }

    return errors;
  }

  function validateRegister() {
    const errors = {};

    if (!registerForm.email.trim()) {
      errors.email = "Email is required.";
    }
    if (!passwordPattern.test(registerForm.password)) {
      errors.password =
        "Use at least 8 characters with upper, lower, number, and symbol.";
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    if (!registerForm.phone.trim()) {
      errors.phone = "Phone number is required.";
    }
    if (!registerForm.country) {
      errors.country = "Select a country.";
    }

    return errors;
  }

  async function handleLogin() {
    const errors = validateLogin();

    if (Object.keys(errors).length > 0) {
      setLoginErrors(errors);
      return;
    }

    try {
      setSubmittingLogin(true);
      const response = await loginCustomer(loginForm);
      setAuth(response);
      router.push("/account");
    } catch (error) {
      setLoginMessage(error.payload?.message || "Invalid email or password.");
    } finally {
      setSubmittingLogin(false);
    }
  }

  async function handleRegister() {
    const errors = validateRegister();

    if (Object.keys(errors).length > 0) {
      setRegisterErrors(errors);
      return;
    }

    try {
      setSubmittingRegister(true);
      const response = await registerCustomer({
        email: registerForm.email,
        password: registerForm.password,
        confirm_password: registerForm.confirmPassword,
        phone: registerForm.phone,
        country: registerForm.country,
      });

      setAuth({
        customer: response.customer,
        summary: {
          booking_count: 0,
          upcoming_trips: 0,
          loyalty_points: 0,
        },
      });
      router.push("/account");
    } catch (error) {
      setRegisterMessage(
        error.payload?.message || "Could not create account. Check the form and try again."
      );
      if (error.payload?.errors) {
        setRegisterErrors(error.payload.errors);
      }
    } finally {
      setSubmittingRegister(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f7ff]">
      <Navbar />

      <PageHero
        eyebrow="Account"
        title="Login or create an account"
        description="This is now connected to PostgreSQL. Sign in uses your email and password, and registration writes directly into the customers table."
      >
        <div className="rounded-[32px] border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
          <div className="rounded-[28px] border border-white/15 bg-slate-950/20 p-6 text-white">
            <p className="text-sm uppercase tracking-[0.22em] text-orange-300">SkyBook access</p>
            <p className="mt-4 text-2xl font-semibold">Your account unlocks bookings, wishlist, and trip history</p>
          </div>
        </div>
      </PageHero>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:px-8 lg:grid-cols-2 lg:px-12">
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Sign in</p>
          <div className="mt-6 space-y-4">
            <Input
              label="Email address"
              type="email"
              value={loginForm.email}
              onChange={(event) => updateLoginField("email", event.target.value)}
              error={loginErrors.email}
            />
            <Input
              label="Password"
              type="password"
              value={loginForm.password}
              onChange={(event) => updateLoginField("password", event.target.value)}
              error={loginErrors.password}
            />
            {loginMessage ? <MessageBox tone="error" text={loginMessage} /> : null}
            <button
              onClick={handleLogin}
              disabled={submittingLogin}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingLogin ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </article>

        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">Create account</p>
          <div className="mt-6 space-y-4">
            <Input
              label="Email address"
              type="email"
              value={registerForm.email}
              onChange={(event) => updateRegisterField("email", event.target.value)}
              error={registerErrors.email}
            />
            <Input
              label="Strong password"
              type="password"
              value={registerForm.password}
              onChange={(event) => updateRegisterField("password", event.target.value)}
              error={registerErrors.password}
            />
            <Input
              label="Re-enter password"
              type="password"
              value={registerForm.confirmPassword}
              onChange={(event) =>
                updateRegisterField("confirmPassword", event.target.value)
              }
              error={registerErrors.confirmPassword}
            />
            <Input
              label="Phone number"
              type="text"
              value={registerForm.phone}
              onChange={(event) => updateRegisterField("phone", event.target.value)}
              error={registerErrors.phone}
            />
            <Select
              label="Country"
              value={registerForm.country}
              onChange={(event) => updateRegisterField("country", event.target.value)}
              error={registerErrors.country}
              options={countries}
            />
            {registerMessage ? <MessageBox tone="error" text={registerMessage} /> : null}
            <button
              onClick={handleRegister}
              disabled={submittingRegister}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingRegister ? "Creating account..." : "Create account"}
            </button>
          </div>
        </article>
      </section>

      <SiteFooter />
    </main>
  );
}

function Input({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      <input
        {...props}
        className={`min-h-12 w-full rounded-[20px] border px-4 text-slate-900 outline-none transition ${
          error
            ? "border-red-300 bg-red-50/60 focus:border-red-400"
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

function MessageBox({ text, tone }) {
  return (
    <div
      className={`rounded-[20px] border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
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
