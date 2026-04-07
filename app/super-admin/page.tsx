"use client";

import { useEffect, useState } from "react";

type GlobalAnalytics = {
  global: {
    totalOrgs: number;
    totalUsers: number;
    totalCost: number;
    totalTokens: number;
    totalExtractions: number;
  };
  orgs: {
    orgId: string;
    orgName: string;
    totalCost: number;
    totalTokens: number;
    extractionCount: number;
    claimCount: number;
    quotaUsed: number;
    quotaLimit: number;
  }[];
};

export default function SuperAdminDashboard() {
  const [data, setData] = useState<GlobalAnalytics | null>(null);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/super-admin/analytics?period=${period}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="text-slate-400 text-center py-12">
        Loading analytics...
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    { label: "Organizations", value: data.global.totalOrgs },
    { label: "Total Users", value: data.global.totalUsers },
    { label: "Extractions", value: data.global.totalExtractions },
    {
      label: "Total Cost",
      value: `$${data.global.totalCost.toFixed(4)}`,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5"
          >
            <p className="text-sm text-slate-400">{card.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per-Org Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">
            Organization Breakdown
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left p-4">Organization</th>
                <th className="text-right p-4">Extractions</th>
                <th className="text-right p-4">Quota Used</th>
                <th className="text-right p-4">Cost (USD)</th>
                <th className="text-right p-4">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {data.orgs.map((org) => (
                <tr
                  key={org.orgId}
                  className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/30"
                >
                  <td className="p-4 font-medium">{org.orgName}</td>
                  <td className="p-4 text-right">{org.extractionCount}</td>
                  <td className="p-4 text-right">
                    <span
                      className={
                        org.quotaUsed >= org.quotaLimit
                          ? "text-red-400"
                          : "text-green-400"
                      }
                    >
                      {org.quotaUsed} / {org.quotaLimit}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    ${org.totalCost.toFixed(4)}
                  </td>
                  <td className="p-4 text-right">
                    {org.totalTokens.toLocaleString()}
                  </td>
                </tr>
              ))}
              {data.orgs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-slate-500"
                  >
                    No organizations yet
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
