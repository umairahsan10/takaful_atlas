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
    quotaLimit: number;
    quotaUsed: number;
  }[];
};

export default function SuperAdminDashboard() {
  const [data, setData] = useState<GlobalAnalytics | null>(null);
  const [period, setPeriod] = useState("month");
  const [pipeline, setPipeline] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/super-admin/analytics?period=${period}&pipeline=${pipeline}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [period, pipeline]);

  if (loading) {
    return (
      <div className="text-gray-600 text-center py-12">
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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <select
            value={pipeline}
            onChange={(e) => setPipeline(e.target.value)}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          >
            <option value="ALL">All Pipelines</option>
            <option value="CLAIM">Claims</option>
            <option value="BILLS">Bills</option>
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          >
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <p className="text-sm text-gray-600">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per-Org Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Organization Breakdown
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Extractions = OCR requests for the selected period &amp; pipeline.
            Quota Used = filtered extraction count against the monthly quota limit.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
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
                  className="border-b border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  <td className="p-4 font-medium">{org.orgName}</td>
                  <td className="p-4 text-right">{org.extractionCount}</td>
                  <td className="p-4 text-right">
                    <span
                      className={
                        org.quotaUsed >= org.quotaLimit
                          ? "text-red-600"
                          : "text-green-700"
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
                  <td colSpan={5} className="p-8 text-center text-gray-500">
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
