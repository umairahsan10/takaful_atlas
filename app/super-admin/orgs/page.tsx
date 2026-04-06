"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Org = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  adminEmail: string | null;
  adminName: string | null;
  userCount: number;
  quota: {
    maxUsers: number;
    maxExtractionsPerMonth: number;
    bonusExtractions: number;
    enforcementMode: string;
    currentMonthExtractions: number;
  } | null;
};

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    orgName: "",
    orgSlug: "",
    adminEmail: "",
    adminPassword: "",
    adminName: "",
    maxUsers: 5,
    maxExtractionsPerMonth: 100,
    enforcementMode: "HARD_BLOCK",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadOrgs = () => {
    fetch("/api/super-admin/orgs")
      .then((r) => r.json())
      .then(setOrgs)
      .finally(() => setLoading(false));
  };

  useEffect(loadOrgs, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");

    const res = await fetch("/api/super-admin/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create organization");
      setCreating(false);
      return;
    }

    setShowCreate(false);
    setForm({
      orgName: "",
      orgSlug: "",
      adminEmail: "",
      adminPassword: "",
      adminName: "",
      maxUsers: 5,
      maxExtractionsPerMonth: 100,
      enforcementMode: "HARD_BLOCK",
    });
    setCreating(false);
    loadOrgs();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Organizations</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Organization"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">
            Create Organization + Admin
          </h2>
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Org Name
              </label>
              <input
                required
                value={form.orgName}
                onChange={(e) =>
                  setForm({ ...form, orgName: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="Pak Qatar Family Takaful"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Slug (unique)
              </label>
              <input
                required
                value={form.orgSlug}
                onChange={(e) =>
                  setForm({
                    ...form,
                    orgSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="pak-qatar"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Admin Name
              </label>
              <input
                required
                value={form.adminName}
                onChange={(e) =>
                  setForm({ ...form, adminName: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Admin Email
              </label>
              <input
                required
                type="email"
                value={form.adminEmail}
                onChange={(e) =>
                  setForm({ ...form, adminEmail: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="admin@company.com"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Admin Password
              </label>
              <input
                required
                type="password"
                value={form.adminPassword}
                onChange={(e) =>
                  setForm({ ...form, adminPassword: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Enforcement
              </label>
              <select
                value={form.enforcementMode}
                onChange={(e) =>
                  setForm({ ...form, enforcementMode: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="HARD_BLOCK">Hard Block</option>
                <option value="SOFT_WARN">Soft Warn</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Max Users
              </label>
              <input
                type="number"
                min={1}
                value={form.maxUsers}
                onChange={(e) =>
                  setForm({ ...form, maxUsers: parseInt(e.target.value) || 5 })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Max Extractions/Month
              </label>
              <input
                type="number"
                min={1}
                value={form.maxExtractionsPerMonth}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxExtractionsPerMonth: parseInt(e.target.value) || 100,
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {creating ? "Creating..." : "Create Organization"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Orgs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left p-4">Organization</th>
                  <th className="text-left p-4">Admin</th>
                  <th className="text-right p-4">Users</th>
                  <th className="text-right p-4">Extractions</th>
                  <th className="text-center p-4">Enforcement</th>
                  <th className="text-center p-4">Status</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr
                    key={org.id}
                    className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/30"
                  >
                    <td className="p-4">
                      <div className="font-medium">{org.name}</div>
                      <div className="text-xs text-slate-500">{org.slug}</div>
                    </td>
                    <td className="p-4">
                      <div>{org.adminName ?? "—"}</div>
                      <div className="text-xs text-slate-500">
                        {org.adminEmail ?? "—"}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {org.userCount} / {org.quota?.maxUsers ?? "—"}
                    </td>
                    <td className="p-4 text-right">
                      <span
                        className={
                          org.quota &&
                          org.quota.currentMonthExtractions >=
                            org.quota.maxExtractionsPerMonth
                            ? "text-red-400"
                            : ""
                        }
                      >
                        {org.quota?.currentMonthExtractions ?? 0} /{" "}
                        {org.quota
                          ? org.quota.maxExtractionsPerMonth +
                            org.quota.bonusExtractions
                          : "—"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          org.quota?.enforcementMode === "HARD_BLOCK"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {org.quota?.enforcementMode ?? "—"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          org.isActive
                            ? "bg-green-500/10 text-green-400"
                            : "bg-slate-500/10 text-slate-400"
                        }`}
                      >
                        {org.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/super-admin/orgs/${org.id}`}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-slate-500"
                    >
                      No organizations yet. Create one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
