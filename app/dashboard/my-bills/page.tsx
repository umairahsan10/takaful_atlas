"use client";

import { useEffect, useState } from "react";

interface BillEntry {
  id: string;
  requestId: string;
  status: string;
  totalCostUsd: number;
  totalTokens: number;
  processingTimeMs: number | null;
  createdAt: string;
}

export default function MyBillsPage() {
  const [bills, setBills] = useState<BillEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/dashboard/bills?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        setBills(d.bills || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [page, statusFilter]);

  const statusStyle: Record<string, string> = {
    SUCCESS: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Bills</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} bill submission{total !== 1 ? "s" : ""}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="bg-white border border-gray-300 text-sm text-gray-700 rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-gray-400 animate-pulse">
            Loading bills...
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3">Request ID</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Tokens</th>
                  <th className="text-left px-5 py-3">Cost (USD)</th>
                  <th className="text-left px-5 py-3">Processing</th>
                  <th className="text-left px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {bills.length ? (
                  bills.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="px-5 py-3 text-xs text-gray-700 font-mono">
                        {b.requestId.slice(0, 12)}...
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            statusStyle[b.status] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {b.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        ${b.totalCostUsd.toFixed(6)}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {b.processingTimeMs
                          ? `${(b.processingTimeMs / 1000).toFixed(1)}s`
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-gray-400"
                    >
                      No bill submissions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">
                  Page {page} of {pages}
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
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
