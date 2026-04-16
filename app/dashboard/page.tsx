"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface DashStats {
  claimsToday: number;
  claimsThisMonth: number;
  totalClaims: number;
  pendingReview: number;
  flagged: number;
  quotaUsed: number;
  quotaLimit: number;
  billsToday: number;
  totalBills: number;
  billsThisMonth: number;
  recentClaims: {
    id: string;
    requestId: string;
    fileName: string;
    status: string;
    createdAt: string;
  }[];
}

export default function StaffDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-gray-400 animate-pulse">Loading dashboard...</div>
    );
  }

  const quotaPercent = stats
    ? Math.min(
        100,
        Math.round((stats.quotaUsed / (stats.quotaLimit || 1)) * 100),
      )
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-gray-500 text-sm mb-8">
        Welcome back, {session?.user?.name || session?.user?.email}
      </p>

      {/* Quick Stats — Claims */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Claims
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Claims Today", value: stats?.claimsToday || 0 },
          { label: "Claims This Month", value: stats?.claimsThisMonth || 0 },
          { label: "Total Claims", value: stats?.totalClaims || 0 },
          { label: "Pending Review", value: stats?.pendingReview || 0 },
          {
            label: "Flagged Claims",
            value: stats?.flagged || 0,
            accent: (stats?.flagged || 0) > 0,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
          >
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p
              className={`text-2xl font-bold ${
                "accent" in card && card.accent ? "text-red-500" : "text-gray-900"
              }`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Stats — Bills */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Bills
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Bills Today", value: stats?.billsToday || 0 },
          { label: "Bills This Month", value: stats?.billsThisMonth || 0 },
          { label: "Total Bills", value: stats?.totalBills || 0 },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
          >
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quota Indicator */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Organization Extraction Quota
          </h2>
          <span className="text-xs text-gray-500">
            {stats?.quotaUsed || 0} / {stats?.quotaLimit || 0} used
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${
              quotaPercent >= 90
                ? "bg-red-500"
                : quotaPercent >= 70
                  ? "bg-yellow-500"
                  : "bg-green-500"
            }`}
            style={{ width: `${quotaPercent}%` }}
          />
        </div>
      </div>

      {/* Recent Claims */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Recent Extractions
          </h2>
          <Link
            href="/dashboard/claims"
            className="text-xs text-red-500 hover:text-red-600"
          >
            View All →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-400 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3">Request ID</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {stats?.recentClaims?.length ? (
              stats.recentClaims.map((c) => {
                const statusStyle: Record<string, string> = {
                  PENDING_REVIEW: "bg-yellow-100 text-yellow-700",
                  APPROVED: "bg-green-100 text-green-700",
                  FLAGGED: "bg-red-100 text-red-700",
                  EXPORTED: "bg-blue-100 text-blue-700",
                };
                return (
                  <tr
                    key={c.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-5 py-3 text-xs text-gray-700 font-mono">
                      {c.requestId.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          statusStyle[c.status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="px-5 py-8 text-center text-gray-400"
                >
                  No extractions yet.{" "}
                  <Link
                    href="/claim-form"
                    className="text-red-500 hover:text-red-600"
                  >
                    Process your first claim →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
