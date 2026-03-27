"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAdmin } from "@/lib/api";
import { setAdminCookie, useAdminStore } from "@/lib/admin-store";

export default function LoginClient() {
  const router = useRouter();
  const setAdminAuth = useAdminStore((state) => state.setAdminAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload = await loginAdmin({ email, password });
      setAdminAuth(payload);
      setAdminCookie(payload.token);
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">SkyBook Admin</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Secure login</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Use your assigned admin account. Login attempts are audited and role permissions are enforced.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 rounded-[18px] border border-white/10 bg-slate-950/40 px-4 text-white outline-none"
              required
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 rounded-[18px] border border-white/10 bg-slate-950/40 px-4 text-white outline-none"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 min-h-12 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
