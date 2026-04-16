"use client";

import { useEffect, useState, useRef } from "react";

interface RateCardEntry {
  id: string;
  hospitalName: string;
  partyName: string;
  serviceCode: string;
  serviceDescription: string;
  rate: number;
  revisedRate: number | null;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
}

interface FilterOption {
  id: string;
  name: string;
}

export default function StaffRateCardsPage() {
  const [cards, setCards] = useState<RateCardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [hospitals, setHospitals] = useState<FilterOption[]>([]);
  const [search, setSearch] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    summary?: {
      totalParsed: number;
      inserted: number;
      updated: number;
      failed: number;
    };
    error?: string;
  } | null>(null);

  const fetchCards = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (hospitalFilter) params.set("hospitalId", hospitalFilter);
    if (search) params.set("search", search);
    fetch(`/api/rate-cards?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
        if (d.filters) setHospitals(d.filters.hospitals || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchCards, [page, hospitalFilter, search]);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/rate-cards/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ success: false, error: data.error });
      } else {
        setImportResult({ success: true, summary: data.summary });
        fetchCards();
      }
    } catch {
      setImportResult({ success: false, error: "Network error" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Rate Cards</h1>
      <p className="text-gray-500 text-sm mb-8">
        View and upload hospital rate cards
      </p>

      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">
          Upload Rate Cards
        </h2>
        <div className="flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer"
          />
          <button
            onClick={handleImport}
            disabled={importing}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Upload"}
          </button>
        </div>
        {importResult && (
          <div
            className={`mt-3 text-sm ${
              importResult.success ? "text-green-700" : "text-red-700"
            }`}
          >
            {importResult.success && importResult.summary
              ? `Imported: ${importResult.summary.inserted} new, ${importResult.summary.updated} updated`
              : importResult.error}
          </div>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-4 mb-4">
        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
        />
        <select
          value={hospitalFilter}
          onChange={(e) => {
            setHospitalFilter(e.target.value);
            setPage(1);
          }}
          className="bg-white border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
        >
          <option value="">All Hospitals</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <span className="text-xs text-gray-500">{total} rate cards</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500 animate-pulse">
            Loading...
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3">Hospital</th>
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Service</th>
                  <th className="text-right px-4 py-3">Rate</th>
                  <th className="text-right px-4 py-3">Revised</th>
                </tr>
              </thead>
              <tbody>
                {cards.length ? (
                  cards.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-gray-900 text-xs">
                        {c.hospitalName}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-mono">
                        {c.serviceCode}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {c.serviceDescription}
                      </td>
                      <td className="px-4 py-3 text-gray-900 text-xs text-right">
                        {c.rate.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-right">
                        {c.revisedRate ? (
                          <span className="text-amber-600">
                            {c.revisedRate.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No rate cards found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {pages > 1 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-30"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-500">
                  Page {page} of {pages}
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-30"
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
