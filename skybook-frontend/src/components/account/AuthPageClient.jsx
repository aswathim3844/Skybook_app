"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteFooter from "@/components/travel/SiteFooter";
import Navbar from "@/components/ui/Navbar";
import { fetchCountries, loginCustomer, registerCustomer } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const passwordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function AuthPageClient({ initialMode = "login" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isSignupMode = initialMode === "signup";
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
  const redirectTarget = searchParams.get("redirect") || "/account";

  useEffect(() => {
    if (!isSignupMode) {
      return undefined;
    }

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
  }, [isSignupMode]);

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
      router.push(redirectTarget);
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
          loyalty_miles: 0,
        },
      });
      router.push(redirectTarget);
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
      <section className="px-6 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-md rounded-[32px] border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-8">
          <p className="text-sm font-medium text-slate-400">Please enter your details</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
            {isSignupMode ? "Create account" : "Welcome back"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {isSignupMode
              ? "Create your SkyBook account to save trips, manage bookings, and earn miles."
              : "Sign in to manage your trips, saved items, and upcoming bookings."}
          </p>

          <div className="mt-8 space-y-4">
            <Input
              label="Email address"
              type="email"
              value={isSignupMode ? registerForm.email : loginForm.email}
              onChange={(event) =>
                isSignupMode
                  ? updateRegisterField("email", event.target.value)
                  : updateLoginField("email", event.target.value)
              }
              error={isSignupMode ? registerErrors.email : loginErrors.email}
            />

            <Input
              label={isSignupMode ? "Strong password" : "Password"}
              type="password"
              value={isSignupMode ? registerForm.password : loginForm.password}
              onChange={(event) =>
                isSignupMode
                  ? updateRegisterField("password", event.target.value)
                  : updateLoginField("password", event.target.value)
              }
              error={isSignupMode ? registerErrors.password : loginErrors.password}
            />

            {isSignupMode ? (
              <>
                <Input
                  label="Re-enter password"
                  type="password"
                  value={registerForm.confirmPassword}
                  onChange={(event) => updateRegisterField("confirmPassword", event.target.value)}
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
              </>
            ) : null}

            <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                Remember for 30 days
              </label>
              {!isSignupMode ? (
                <span className="text-[#3b82f6]">Forgot password</span>
              ) : null}
            </div>

            {isSignupMode
              ? registerMessage
                ? <MessageBox tone="error" text={registerMessage} />
                : null
              : loginMessage
                ? <MessageBox tone="error" text={loginMessage} />
                : null}

            <button
              onClick={isSignupMode ? handleRegister : handleLogin}
              disabled={isSignupMode ? submittingRegister : submittingLogin}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#3b82f6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSignupMode
                ? submittingRegister
                  ? "Creating account..."
                  : "Create account"
                : submittingLogin
                  ? "Signing in..."
                  : "Sign in"}
            </button>

            <div className="pt-1 text-center text-sm text-slate-500">
              {isSignupMode ? (
                <>
                  Already have an account?{" "}
                  <Link href={`/login?redirect=${encodeURIComponent(redirectTarget)}`} className="font-semibold text-[#3b82f6]">
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{" "}
                  <Link href={`/signup?redirect=${encodeURIComponent(redirectTarget)}`} className="font-semibold text-[#3b82f6]">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
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
