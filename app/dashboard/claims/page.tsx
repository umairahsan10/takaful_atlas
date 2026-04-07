"use client";

import { useEffect, useState } from "react";

interface Claim {
  id: string;
  requestId: string;
  fileNameHash: string;
  status: string;
  modelId: string | null;
  createdAt: string;
  crossCheckResult: Record<string, unknown> | null;
}

const STATUSES = ["PENDING_REVIEW", "APPROVED", "FLAGGED", "EXPORTED"];

export default function StaffClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    const controller = new AbortController();
    fetch(`/api/dashboard/claims?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        setClaims(d.claims || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [page, status]);

  const statusStyle: Record<string, string> = {
    PENDING_REVIEW: "bg-yellow-500/20 text-yellow-400",
    APPROVED: "bg-green-500/20 text-green-400",
    FLAGGED: "bg-red-500/20 text-red-400",
    EXPORTED: "bg-blue-500/20 text-blue-400",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Claims</h1>
          <p className="text-slate-500 text-sm mt-1">
            {total} total extraction{total !== 1 ? "s" : ""}
          </p>
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 text-sm text-white rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 animate-pulse">
            Loading claims...
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="text-left px-5 py-3">Request ID</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Cross-Check</th>
                  <th className="text-left px-5 py-3">Model</th>
                  <th className="text-left px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {claims.length ? (
                  claims.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-5 py-3 text-xs text-slate-300 font-mono">
                        {c.requestId.slice(0, 12)}...
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            statusStyle[c.status] ||
                            "bg-slate-700 text-slate-400"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {c.crossCheckResult ? (
                          <span className="text-xs text-green-400">
                            ✓ Checked
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400">
                        {c.modelId || "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-slate-600"
                    >
                      No claims found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="p-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page {page} of {pages}
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
