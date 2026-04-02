"use client";

import { useEffect, useMemo, useState } from "react";

import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import ClientGuard from "@/components/admin/ClientGuard";
import { hasPermission } from "@/components/admin/formatters";
import { createAdminUser, fetchAdminRoles, fetchAdminUsers } from "@/lib/api";
import { useAdminStore } from "@/lib/admin-store";

export default function AdminUsersPage() {
  const token = useAdminStore((state) => state.token);
  const permissions = useAdminStore((state) => state.permissions);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    role_id: "",
    password: "",
  });

  async function refresh() {
    if (!token) return;

    setLoading(true);
    try {
      const [usersPayload, rolesPayload] = await Promise.all([
        fetchAdminUsers(token),
        fetchAdminRoles(token),
      ]);
      setUsers(Array.isArray(usersPayload) ? usersPayload : []);
      setRoles(Array.isArray(rolesPayload) ? rolesPayload : []);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load admin users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  async function handleCreateUser() {
    if (!form.email.trim() || !form.full_name.trim() || !form.role_id || !form.password.trim()) {
      setError("Fill in email, full name, role, and password before creating an admin user.");
      return;
    }

    try {
      setError("");
      setMessage("");
      await createAdminUser(token, {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        role_id: Number(form.role_id),
        password: form.password,
      });
      setMessage("Admin user created successfully.");
      setForm({ email: "", full_name: "", role_id: "", password: "" });
      await refresh();
    } catch (requestError) {
      setError(requestError.message || "Unable to create admin user.");
    }
  }

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      [user.email, user.full_name, user.role_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, users]);

  return (
    <ClientGuard>
      <AdminLayoutShell
        title="Admin users"
        description="Manage the internal users who can access the SkyBook admin panel and operational controls."
      >
        {error ? (
          <p className="mb-5 rounded-[20px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mb-5 rounded-[20px] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {message}
          </p>
        ) : null}

        <section className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <article className="rounded-[24px] border border-white/10 bg-slate-950/30 p-5">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Search admin users
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Email, full name, role..."
                className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
              />
            </label>
          </article>

          {hasPermission(permissions, "admin_users.write") ? (
            <article className="rounded-[24px] border border-white/10 bg-slate-950/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Create admin user
              </p>
              <div className="mt-4 grid gap-3">
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                  placeholder="Full name"
                  className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
                />
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email"
                  className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
                />
                <select
                  value={form.role_id}
                  onChange={(event) => setForm((current) => ({ ...current, role_id: event.target.value }))}
                  className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
                >
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role.role_id} value={role.role_id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Temporary password"
                  className="min-h-11 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateUser}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  Create admin user
                </button>
              </div>
            </article>
          ) : null}
        </section>

        <article className="rounded-[24px] border border-white/10 bg-slate-950/30 p-6">
          {loading ? (
            <p className="text-sm text-slate-300">Loading admin users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-300">
                    <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Name</th>
                    <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Email</th>
                    <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Role</th>
                    <th className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">Status</th>
                    <th className="pb-3 font-semibold uppercase tracking-[0.18em]">Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.admin_user_id} className="border-b border-white/10 last:border-b-0">
                      <td className="py-4 pr-6 text-slate-100">{user.full_name || "Unnamed admin"}</td>
                      <td className="py-4 pr-6 text-slate-100">{user.email}</td>
                      <td className="py-4 pr-6 text-slate-100">{user.role_name || "No role"}</td>
                      <td className="py-4 pr-6 text-slate-100">
                        {user.is_active ? "Active" : "Inactive"}
                      </td>
                      <td className="py-4 text-slate-300">
                        {Array.isArray(user.permissions) && user.permissions.length > 0
                          ? user.permissions.join(", ")
                          : "No explicit permissions"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </AdminLayoutShell>
    </ClientGuard>
  );
}
