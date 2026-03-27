"use client";

import { useEffect, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import ClientGuard from "@/components/admin/ClientGuard";
import { hasPermission } from "@/components/admin/formatters";
import { useAdminStore } from "@/lib/admin-store";

function EmptyFormState({ label }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-slate-950/20 p-5 text-sm text-slate-400">
      {label}
    </div>
  );
}

export default function CrudPage({
  title,
  description,
  columns,
  loadData,
  createItem,
  updateItem,
  deleteItem,
  createPermission,
  editPermission,
  deletePermission,
  initialForm,
  renderForm,
  rowKey,
  rowMapper,
}) {
  const token = useAdminStore((state) => state.token);
  const permissions = useAdminStore((state) => state.permissions);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm());
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const payload = await loadData(token);
      setItems(payload);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editingItem) {
        await updateItem(token, rowKey(editingItem), form);
      } else {
        await createItem(token, form);
      }
      setForm(initialForm());
      setEditingItem(null);
      await refresh();
    } catch (requestError) {
      setError(requestError.message || "Unable to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!token) {
      return;
    }

    setError("");
    try {
      await deleteItem(token, rowKey(item));
      if (editingItem && rowKey(editingItem) === rowKey(item)) {
        setEditingItem(null);
        setForm(initialForm());
      }
      await refresh();
    } catch (requestError) {
      setError(requestError.message || "Unable to delete item.");
    }
  }

  return (
    <ClientGuard>
      <AdminLayoutShell title={title} description={description}>
        {error ? <p className="mb-5 rounded-[20px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-[24px] border border-white/10 bg-slate-950/30 p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-300">
                    {columns.map((column) => (
                      <th key={column} className="pb-3 pr-6 font-semibold uppercase tracking-[0.18em]">
                        {column}
                      </th>
                    ))}
                    <th className="pb-3 font-semibold uppercase tracking-[0.18em] text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={rowKey(item)} className="border-b border-white/10 last:border-b-0">
                      {rowMapper(item).map((value, index) => (
                        <td key={`${rowKey(item)}-${index}`} className="py-4 pr-6 text-slate-100">
                          {value}
                        </td>
                      ))}
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          {hasPermission(permissions, editPermission) ? (
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setForm(initialForm(item));
                              }}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                            >
                              Edit
                            </button>
                          ) : null}
                          {hasPermission(permissions, deletePermission) ? (
                            <button
                              onClick={() => handleDelete(item)}
                              className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading ? <p className="mt-4 text-sm text-slate-400">Loading records...</p> : null}
          </article>

          {hasPermission(permissions, createPermission) || hasPermission(permissions, editPermission) ? (
            <form onSubmit={handleSubmit} className="rounded-[24px] border border-white/10 bg-slate-950/30 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{editingItem ? "Edit item" : "Create item"}</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    {editingItem ? "Update the selected record." : "Add a new record to the shared backend."}
                  </p>
                </div>
                {editingItem ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setForm(initialForm());
                    }}
                    className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    Reset
                  </button>
                ) : null}
              </div>

              <div className="mt-6 grid gap-4">{renderForm({ form, setForm })}</div>

              <button
                type="submit"
                disabled={saving}
                className="mt-6 min-h-11 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving..." : editingItem ? "Save changes" : "Create"}
              </button>
            </form>
          ) : (
            <EmptyFormState label="Your role has read access only for this listing type." />
          )}
        </div>
      </AdminLayoutShell>
    </ClientGuard>
  );
}
