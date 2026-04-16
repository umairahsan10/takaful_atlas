"use client";

import { useEffect, useState } from "react";

interface AuditEntry {
  id: string;
  actionType: string;
  targetEntity: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

const ACTION_TYPES = [
  "LOGIN",
  "LOGOUT",
  "UPLOAD_CLAIM",
  "CREATE_USER",
  "IMPORT_RATES",
  "EXPORT_CLAIM",
  "FORCE_LOGOUT",
  "QUOTA_EXCEEDED",
];

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    const controller = new AbortController();
    fetch(`/api/admin/audit-log?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setLogs)
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [actionFilter]);

  const actionColor: Record<string, string> = {
    LOGIN: "text-green-700",
    LOGOUT: "text-gray-600",
    UPLOAD_CLAIM: "text-blue-700",
    CREATE_USER: "text-purple-700",
    CREATE_ORG: "text-purple-700",
    FORCE_LOGOUT: "text-red-700",
    QUOTA_EXCEEDED: "text-yellow-700",
    IMPORT_RATES: "text-cyan-700",
    EXPORT_CLAIM: "text-blue-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-500 text-sm mt-1">
            Activity log for your organization
          </p>
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-gray-100 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
        >
          <option value="">All Actions</option>
          {ACTION_TYPES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600 animate-pulse">
            Loading logs...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3">Time</th>
                <th className="text-left px-5 py-3">Actor</th>
                <th className="text-left px-5 py-3">Action</th>
                <th className="text-left px-5 py-3">Target</th>
                <th className="text-left px-5 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length ? (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-5 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-gray-900 text-xs">
                        {log.actor?.name || "System"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {log.actor?.email}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs font-medium ${
                          actionColor[log.actionType] || "text-gray-600"
                        }`}
                      >
                        {log.actionType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600 max-w-50 truncate">
                      {log.targetEntity || "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {log.ipAddress || "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-gray-500"
                  >
                    No audit events found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
