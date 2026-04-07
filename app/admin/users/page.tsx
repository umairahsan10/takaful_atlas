"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  currentSessionToken: string | null;
  createdAt: string;
}

interface QuotaInfo {
  maxUsers: number;
  currentUserCount: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fetchUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users || []);
        setQuota(d.quota || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchUsers, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create user");
        return;
      }
      setForm({ name: "", email: "", password: "" });
      setShowCreate(false);
      fetchUsers();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleForceLogout = async (userId: string) => {
    if (!confirm("Force logout this user? Their active session will end."))
      return;
    await fetch(`/api/admin/users/${userId}/force-logout`, { method: "POST" });
    fetchUsers();
  };

  const atLimit = quota && quota.currentUserCount >= quota.maxUsers;

  if (loading) {
    return (
      <div className="text-slate-400 animate-pulse">Loading users...</div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            {quota?.currentUserCount || 0} / {quota?.maxUsers || 0} staff users
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!!atLimit}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            atLimit
              ? "bg-slate-700 text-slate-500 cursor-not-allowed"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          {atLimit ? "User Limit Reached" : "+ Create Staff User"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">
            New Staff User
          </h2>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2 mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-3 gap-4">
            <input
              required
              placeholder="Full Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
            />
            <input
              required
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
            />
            <div className="col-span-3 flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create User"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setError("");
                }}
                className="text-slate-400 px-4 py-2 rounded-lg text-sm hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 border-b border-slate-800">
            <tr>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Session</th>
              <th className="text-left px-5 py-3">Last Login</th>
              <th className="text-left px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length ? (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30"
                >
                  <td className="px-5 py-3">
                    <div className="text-white">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        u.isActive
                          ? "bg-green-500/20 text-green-400"
                          : "bg-slate-700 text-slate-500"
                      }`}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`w-2 h-2 rounded-full inline-block mr-2 ${
                        u.currentSessionToken
                          ? "bg-green-500"
                          : "bg-slate-600"
                      }`}
                    />
                    <span className="text-xs text-slate-400">
                      {u.currentSessionToken ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {u.lastLogin
                      ? new Date(u.lastLogin).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-5 py-3">
                    {u.currentSessionToken && (
                      <button
                        onClick={() => handleForceLogout(u.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Force Logout
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-8 text-center text-slate-600"
                >
                  No staff users yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
