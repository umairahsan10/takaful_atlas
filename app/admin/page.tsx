"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface DashboardData {
  userCount: number;
  maxUsers: number;
  extractionsThisMonth: number;
  totalExtractions: number;
  maxExtractions: number;
  bonusExtractions: number;
  enforcement: string;
  totalCost: number;
  claimsToday: number;
  perUserStats: {
    userId: string;
    name: string;
    email: string;
    extractions: number;
    cost: number;
  }[];
  claimsByStatus: { status: string; _count: number }[];
}

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics?period=month")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const quotaPercent = data
    ? Math.min(
        100,
        Math.round(
          (data.extractionsThisMonth /
            (data.maxExtractions + data.bonusExtractions || 1)) *
            100,
        ),
      )
    : 0;
  const quotaColor =
    quotaPercent >= 90
      ? "bg-red-500"
      : quotaPercent >= 70
        ? "bg-yellow-500"
        : "bg-green-500";

  if (loading) {
    return (
      <div className="text-gray-600 animate-pulse">Loading dashboard...</div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin Dashboard</h1>
      <p className="text-gray-500 text-sm mb-8">
        Welcome back, {session?.user?.name || session?.user?.email}
      </p>

      {/* Quota Meter */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Extraction Quota
          </h2>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              data?.enforcement === "HARD_BLOCK"
                ? "bg-red-50 text-red-700"
                : "bg-yellow-50 text-yellow-700"
            }`}
          >
            {data?.enforcement}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-4 mb-2">
          <div
            className={`${quotaColor} h-4 rounded-full transition-all`}
            style={{ width: `${quotaPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>
            {data?.extractionsThisMonth} used
            {data?.bonusExtractions ? ` (+${data.bonusExtractions} bonus)` : ""}
          </span>
          <span>
            {(data?.maxExtractions || 0) + (data?.bonusExtractions || 0)} limit
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Staff Users",
            value: `${data?.userCount || 0} / ${data?.maxUsers || 0}`,
          },
          {
            label: "Extractions (Month)",
            value: data?.totalExtractions || 0,
          },
          {
            label: "OCR Cost (Month)",
            value: `$${(data?.totalCost || 0).toFixed(8)}`,
          },
          { label: "Claims Today", value: data?.claimsToday || 0 },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per-User Stats */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">
            Staff Usage This Month
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Extractions</th>
              <th className="text-left px-5 py-3">Cost</th>
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
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="px-5 py-6 text-center text-gray-500"
                >
                  No usage data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Claims by Status */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Claims by Status
        </h2>
        <div className="flex gap-4 flex-wrap">
          {data?.claimsByStatus?.length ? (
            data.claimsByStatus.map((s) => (
              <div
                key={s.status}
                className="bg-gray-100 rounded-lg px-4 py-3 min-w-30"
              >
                <p className="text-xs text-gray-500">{s.status}</p>
                <p className="text-xl font-bold text-gray-900">{s._count}</p>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No claims yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
