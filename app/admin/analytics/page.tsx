"use client";

import { useEffect, useState } from "react";

interface Analytics {
  extractionsThisMonth: number;
  totalExtractions: number;
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
  const [pipeline, setPipeline] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/analytics?period=${period}&pipeline=${pipeline}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [period, pipeline]);

  if (loading) {
    return (
      <div className="text-gray-600 animate-pulse">Loading analytics...</div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">
            OCR usage and cost breakdown for your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pipeline}
            onChange={(e) => setPipeline(e.target.value)}
            className="bg-gray-100 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
          >
            <option value="ALL">All Pipelines</option>
            <option value="CLAIM">Claims</option>
            <option value="BILLS">Bills</option>
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-gray-100 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
          >
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total Extractions</p>
          <p className="text-2xl font-bold text-gray-900">
            {data?.totalExtractions || 0}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total Cost</p>
          <p className="text-2xl font-bold text-gray-900">
            ${(data?.totalCost || 0).toFixed(8)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Active Staff</p>
          <p className="text-2xl font-bold text-gray-900">
            {data?.perUserStats?.length || 0}
          </p>
        </div>
      </div>

      {/* Per-User Breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">
            Usage by Staff Member
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b border-gray-200">
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
                  className="border-b border-gray-200 hover:bg-gray-50"
                >
                  <td className="px-5 py-3">
                    <div className="text-gray-900">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-gray-700">{u.extractions}</td>
                  <td className="px-5 py-3 text-gray-700">
                    ${u.cost.toFixed(8)}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    ${u.extractions ? (u.cost / u.extractions).toFixed(8) : "0"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-6 text-center text-gray-500"
                >
                  No data for this period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Claims By Status */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Claims by Status
        </h2>
        <div className="flex gap-4 flex-wrap">
          {data?.claimsByStatus?.length ? (
            data.claimsByStatus.map((s) => {
              const statusColor: Record<string, string> = {
                PENDING_REVIEW: "bg-yellow-50 text-yellow-700",
                APPROVED: "bg-green-50 text-green-700",
                FLAGGED: "bg-red-50 text-red-700",
                EXPORTED: "bg-blue-50 text-blue-700",
              };
              return (
                <div
                  key={s.status}
                  className={`rounded-lg px-4 py-3 min-w-30 ${
                    statusColor[s.status] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  <p className="text-xs opacity-80">{s.status}</p>
                  <p className="text-xl font-bold">{s._count}</p>
                </div>
              );
            })
          ) : (
            <p className="text-gray-500 text-sm">No claims data</p>
          )}
        </div>
      </div>
    </div>
  );
}
