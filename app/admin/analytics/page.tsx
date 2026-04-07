"use client";

import { useEffect, useState } from "react";

interface Analytics {
  extractionsThisMonth: number;
  totalCost: number;
  perUserStats: {
    userId: string;
    name: string;
    email: string;
    extractions: number;
    cost: number;
  }[];
  claimsByStatus: { status: string; _count: number }[];
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/analytics?period=${period}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [period]);

  if (loading) {
    return (
      <div className="text-slate-400 animate-pulse">Loading analytics...</div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">
            OCR usage and cost breakdown for your organization
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-sm text-white rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
        >
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-1">Total Extractions</p>
          <p className="text-2xl font-bold text-white">
            {data?.extractionsThisMonth || 0}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-1">Total Cost</p>
          <p className="text-2xl font-bold text-white">
            ${(data?.totalCost || 0).toFixed(8)}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-1">Active Staff</p>
          <p className="text-2xl font-bold text-white">
            {data?.perUserStats?.length || 0}
          </p>
        </div>
      </div>

      {/* Per-User Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-8">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-300">
            Usage by Staff Member
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 border-b border-slate-800">
            <tr>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Extractions</th>
              <th className="text-left px-5 py-3">Cost (USD)</th>
              <th className="text-left px-5 py-3">Avg Cost/Extraction</th>
            </tr>
          </thead>
          <tbody>
            {data?.perUserStats?.length ? (
              data.perUserStats.map((u) => (
                <tr
                  key={u.userId}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30"
                >
                  <td className="px-5 py-3">
                    <div className="text-white">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{u.extractions}</td>
                  <td className="px-5 py-3 text-slate-300">
                    ${u.cost.toFixed(8)}
                  </td>
                  <td className="px-5 py-3 text-slate-300">
                    ${u.extractions ? (u.cost / u.extractions).toFixed(8) : "0"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-6 text-center text-slate-600"
                >
                  No data for this period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Claims By Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">
          Claims by Status
        </h2>
        <div className="flex gap-4 flex-wrap">
          {data?.claimsByStatus?.length ? (
            data.claimsByStatus.map((s) => {
              const statusColor: Record<string, string> = {
                PENDING_REVIEW: "bg-yellow-500/20 text-yellow-400",
                APPROVED: "bg-green-500/20 text-green-400",
                FLAGGED: "bg-red-500/20 text-red-400",
                EXPORTED: "bg-blue-500/20 text-blue-400",
              };
              return (
                <div
                  key={s.status}
                  className={`rounded-lg px-4 py-3 min-w-30 ${
                    statusColor[s.status] || "bg-slate-800 text-slate-400"
                  }`}
                >
                  <p className="text-xs opacity-80">{s.status}</p>
                  <p className="text-xl font-bold">{s._count}</p>
                </div>
              );
            })
          ) : (
            <p className="text-slate-600 text-sm">No claims data</p>
          )}
        </div>
      </div>
    </div>
  );
}
