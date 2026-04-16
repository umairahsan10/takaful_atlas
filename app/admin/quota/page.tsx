"use client";

import { useEffect, useState } from "react";

interface Quota {
  maxUsers: number;
  currentUserCount: number;
  maxExtractionsPerMonth: number;
  bonusExtractions: number;
  enforcementMode: string;
  currentMonthExtractions: number;
  quotaResetDay: number;
  lastResetAt: string | null;
}

export default function AdminQuotaPage() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics?period=month")
      .then((r) => r.json())
      .then((d) => {
        setQuota({
          maxUsers: d.maxUsers,
          currentUserCount: d.userCount,
          maxExtractionsPerMonth: d.maxExtractions,
          bonusExtractions: d.bonusExtractions,
          enforcementMode: d.enforcement,
          currentMonthExtractions: d.extractionsThisMonth,
          quotaResetDay: d.quotaResetDay || 1,
          lastResetAt: d.lastResetAt,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-600 animate-pulse">Loading quota...</div>;
  }

  if (!quota) {
    return <div className="text-red-700">Failed to load quota</div>;
  }

  const totalLimit =
    (quota.maxExtractionsPerMonth || 0) + (quota.bonusExtractions || 0);
  const remaining = Math.max(
    0,
    totalLimit - (quota.currentMonthExtractions || 0),
  );
  const usagePercent = totalLimit
    ? Math.min(
        100,
        Math.round(((quota.currentMonthExtractions || 0) / totalLimit) * 100),
      )
    : 0;

  // User quota: actual staff users created vs max allowed
  const userUsagePercent =
    (quota.maxUsers || 0) > 0
      ? Math.min(
          100,
          Math.round(((quota.currentUserCount || 0) / quota.maxUsers) * 100),
        )
      : 0;

  const barColor = (pct: number) =>
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Quota Overview</h1>
      <p className="text-gray-500 text-sm mb-8">
        Read-only view of your organization&apos;s quota limits and current
        usage. Contact Super Admin to request changes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Extraction Quota */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              Extraction Quota
            </h2>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                quota.enforcementMode === "HARD_BLOCK"
                  ? "bg-red-50 text-red-700"
                  : "bg-yellow-50 text-yellow-700"
              }`}
            >
              {quota.enforcementMode}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4 mb-3">
            <div
              className={`${barColor(usagePercent)} h-4 rounded-full transition-all`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Used</p>
              <p className="text-gray-900 font-semibold">
                {quota.currentMonthExtractions}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Remaining</p>
              <p className="text-gray-900 font-semibold">{remaining}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Monthly Limit</p>
              <p className="text-gray-900 font-semibold">
                {quota.maxExtractionsPerMonth}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Bonus</p>
              <p className="text-gray-900 font-semibold">
                {quota.bonusExtractions}
              </p>
            </div>
          </div>
        </div>

        {/* User Quota */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            User Quota
          </h2>
          <div className="w-full bg-gray-100 rounded-full h-4 mb-3">
            <div
              className={`${barColor(userUsagePercent)} h-4 rounded-full transition-all`}
              style={{ width: `${userUsagePercent}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Staff Users</p>
              <p className="text-gray-900 font-semibold">
                {quota.currentUserCount} / {quota.maxUsers}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Reset Day</p>
              <p className="text-gray-900 font-semibold">
                {quota.quotaResetDay}{" "}
                <span className="text-xs text-gray-500">of each month</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Quota Details
        </h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: "Enforcement", value: quota.enforcementMode },
            {
              label: "Total Assigned",
              value: totalLimit,
            },
            { label: "Reset Day", value: `Day ${quota.quotaResetDay}` },
            {
              label: "Last Reset",
              value: quota.lastResetAt
                ? new Date(quota.lastResetAt).toLocaleDateString()
                : "Never",
            },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-gray-500 text-xs">{item.label}</dt>
              <dd className="text-gray-900 font-semibold mt-0.5">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
