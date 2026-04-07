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
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);

    fetch(`/api/super-admin/audit-log?${params}`)
      .then((r) => r.json())
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [actionFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Global Audit Log</h1>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">All Actions</option>
          <option value="LOGIN">Login</option>
          <option value="LOGOUT">Logout</option>
          <option value="FORCE_LOGOUT">Force Logout</option>
          <option value="CREATE_ORG">Create Org</option>
          <option value="CREATE_USER">Create User</option>
          <option value="SET_QUOTA">Set Quota</option>
          <option value="UPLOAD_CLAIM">Upload Claim</option>
          <option value="QUOTA_EXCEEDED">Quota Exceeded</option>
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
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
                    className="border-b border-slate-800/50 text-slate-300 hover:bg-slate-800/30"
                  >
                    <td className="p-4 text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div>{log.actor.name}</div>
                      <div className="text-xs text-slate-500">
                        {log.actor.email}
                      </div>
                    </td>
                    <td className="p-4">{log.org?.name ?? "—"}</td>
                    <td className="p-4 text-center">
                      <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">
                        {log.actionType}
                      </span>
                    </td>
                    <td className="p-4 text-slate-400 text-xs font-mono truncate max-w-[200px]">
                      {log.targetEntity ?? "—"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
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
