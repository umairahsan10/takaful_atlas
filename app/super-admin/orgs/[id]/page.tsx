"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type QuotaData = {
  id: string;
  orgId: string;
  maxUsers: number;
  maxExtractionsPerMonth: number;
  bonusExtractions: number;
  enforcementMode: string;
  currentMonthExtractions: number;
  quotaResetDay: number;
};

type OrgUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
};

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editQuota, setEditQuota] = useState<Partial<QuotaData>>({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/super-admin/orgs/${id}/quota`).then((r) => r.json()),
      fetch(`/api/super-admin/orgs/${id}/users`).then((r) => r.json()),
    ])
      .then(([q, u]) => {
        setQuota(q);
        setEditQuota({
          maxUsers: q.maxUsers,
          maxExtractionsPerMonth: q.maxExtractionsPerMonth,
          bonusExtractions: q.bonusExtractions,
          enforcementMode: q.enforcementMode,
          quotaResetDay: q.quotaResetDay,
        });
        setUsers(u);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaveQuota = async () => {
    setSaving(true);
    const res = await fetch(`/api/super-admin/orgs/${id}/quota`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editQuota),
    });
    if (res.ok) {
      const updated = await res.json();
      setQuota(updated);
    }
    setSaving(false);
  };

  const handleForceLogout = async (userId: string) => {
    await fetch(`/api/super-admin/orgs/${id}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: "force-logout" }),
    });
    // Refresh users
    const u = await fetch(`/api/super-admin/orgs/${id}/users`).then((r) =>
      r.json()
    );
    setUsers(u);
  };

  if (loading) {
    return <div className="text-slate-400 text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/super-admin/orgs"
          className="text-slate-400 hover:text-white transition-colors"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-white">Organization Detail</h1>
      </div>

      {/* Quota Management */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Quota Settings
        </h2>
        <div className="mb-4 p-3 bg-slate-800 rounded-lg">
          <span className="text-sm text-slate-400">Current usage: </span>
          <span className="text-white font-medium">
            {quota?.currentMonthExtractions ?? 0}
          </span>
          <span className="text-slate-400"> / </span>
          <span className="text-white font-medium">
            {(quota?.maxExtractionsPerMonth ?? 0) +
              (quota?.bonusExtractions ?? 0)}
          </span>
          <span className="text-sm text-slate-400"> extractions this month</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Max Users
            </label>
            <input
              type="number"
              min={1}
              value={editQuota.maxUsers ?? ""}
              onChange={(e) =>
                setEditQuota({
                  ...editQuota,
                  maxUsers: parseInt(e.target.value) || 1,
                })
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
              value={editQuota.maxExtractionsPerMonth ?? ""}
              onChange={(e) =>
                setEditQuota({
                  ...editQuota,
                  maxExtractionsPerMonth: e.target.value === "" ? 0 : Math.max(1, parseInt(e.target.value, 10) || 1),
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Bonus Extractions
            </label>
            <input
              type="number"
              min={0}
              value={editQuota.bonusExtractions ?? ""}
              onChange={(e) =>
                setEditQuota({
                  ...editQuota,
                  bonusExtractions: parseInt(e.target.value) || 0,
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Enforcement
            </label>
            <select
              value={editQuota.enforcementMode ?? "HARD_BLOCK"}
              onChange={(e) =>
                setEditQuota({ ...editQuota, enforcementMode: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            >
              <option value="HARD_BLOCK">Hard Block</option>
              <option value="SOFT_WARN">Soft Warn</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Reset Day of Month
            </label>
            <input
              type="number"
              min={1}
              max={28}
              value={editQuota.quotaResetDay ?? 1}
              onChange={(e) =>
                setEditQuota({
                  ...editQuota,
                  quotaResetDay: parseInt(e.target.value) || 1,
                })
              }
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSaveQuota}
              disabled={saving}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? "Saving..." : "Save Quota"}
            </button>
          </div>
        </div>
      </div>

      {/* Users */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Email</th>
                <th className="text-center p-4">Role</th>
                <th className="text-center p-4">Status</th>
                <th className="text-left p-4">Last Login</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/30"
                >
                  <td className="p-4 font-medium">{user.name}</td>
                  <td className="p-4">{user.email}</td>
                  <td className="p-4 text-center">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        user.role === "ADMIN"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-slate-500/10 text-slate-400"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        user.isActive
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-4 text-slate-400">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleForceLogout(user.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Force Logout
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No users in this organization
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
