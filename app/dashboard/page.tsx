"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface DashStats {
  claimsToday: number;
  totalClaims: number;
  pendingReview: number;
  flagged: number;
  quotaUsed: number;
  quotaLimit: number;
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
      <div className="text-slate-400 animate-pulse">Loading dashboard...</div>
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
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-slate-500 text-sm mb-8">
        Welcome back, {session?.user?.name || session?.user?.email}
      </p>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Claims Today", value: stats?.claimsToday || 0 },
          { label: "Total Claims", value: stats?.totalClaims || 0 },
          { label: "Pending Review", value: stats?.pendingReview || 0 },
          {
            label: "Flagged",
            value: stats?.flagged || 0,
            accent: (stats?.flagged || 0) > 0,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5"
          >
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p
              className={`text-2xl font-bold ${
                "accent" in card && card.accent ? "text-red-400" : "text-white"
              }`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quota Indicator */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-300">
            Organization Extraction Quota
          </h2>
          <span className="text-xs text-slate-500">
            {stats?.quotaUsed || 0} / {stats?.quotaLimit || 0} used
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-3">
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">
            Recent Extractions
          </h2>
          <Link
            href="/dashboard/claims"
            className="text-xs text-red-400 hover:text-red-300"
          >
            View All →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 border-b border-slate-800">
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
                  PENDING_REVIEW: "bg-yellow-500/20 text-yellow-400",
                  APPROVED: "bg-green-500/20 text-green-400",
                  FLAGGED: "bg-red-500/20 text-red-400",
                  EXPORTED: "bg-blue-500/20 text-blue-400",
                };
                return (
                  <tr
                    key={c.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3 text-xs text-slate-300 font-mono">
                      {c.requestId.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          statusStyle[c.status] || "bg-slate-700 text-slate-400"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="px-5 py-8 text-center text-slate-600"
                >
                  No extractions yet.{" "}
                  <Link
                    href="/claim-form"
                    className="text-red-400 hover:text-red-300"
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
