"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  orgId: string | null;
  actorUserId: string;
  actionType: string;
  targetEntity: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string; email: string };
  org: { name: string } | null;
};

export default function SuperAdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (actionFilter) params.set("action", actionFilter);
    if (orgFilter) params.set("orgId", orgFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    fetch(`/api/super-admin/audit-log?${params}`)
      .then((r) => r.json())
      .then((payload) => {
        setLogs(payload.logs || []);
        setActions(payload.filters?.actions || []);
        setOrgs(payload.filters?.orgs || []);
      })
      .finally(() => setLoading(false));
  }, [searchQuery, actionFilter, orgFilter, fromDate, toDate]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Global Audit Log</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            value={searchQuery}
            onChange={(e) => {
              setLoading(true);
              setSearchQuery(e.target.value);
            }}
            placeholder="Search actor, email, org, action, target..."
            className="md:col-span-2 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-red-500 focus:outline-none"
          />

          <select
            value={orgFilter}
            onChange={(e) => {
              setLoading(true);
              setOrgFilter(e.target.value);
            }}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          >
            <option value="">All Organizations</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          <select
            value={actionFilter}
            onChange={(e) => {
              setLoading(true);
              setActionFilter(e.target.value);
            }}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          >
            <option value="">All Actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setSearchQuery("");
              setActionFilter("");
              setOrgFilter("");
              setFromDate("");
              setToDate("");
            }}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-200 transition-colors"
          >
            Clear Filters
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setLoading(true);
              setFromDate(e.target.value);
            }}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setLoading(true);
              setToDate(e.target.value);
            }}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          />
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-gray-500">Showing {logs.length} log entries</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="text-left p-4">Time</th>
                  <th className="text-left p-4">Actor</th>
                  <th className="text-left p-4">Org</th>
                  <th className="text-center p-4">Action</th>
                  <th className="text-left p-4">Target</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    <td className="p-4 text-gray-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div>{log.actor.name}</div>
                      <div className="text-xs text-gray-500">
                        {log.actor.email}
                      </div>
                    </td>
                    <td className="p-4">{log.org?.name ?? "—"}</td>
                    <td className="p-4 text-center">
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                        {log.actionType}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600 text-xs font-mono truncate max-w-[200px]">
                      {log.targetEntity ?? "—"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No audit logs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
