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

export default function AdminRateCardsPage() {
  const [cards, setCards] = useState<RateCardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [hospitals, setHospitals] = useState<FilterOption[]>([]);
  const [parties, setParties] = useState<FilterOption[]>([]);
  const [hospitalFilter, setHospitalFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Import state
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
    errors?: { row: number; message: string }[];
    error?: string;
  } | null>(null);

  const fetchCards = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (hospitalFilter) params.set("hospitalId", hospitalFilter);
    if (partyFilter) params.set("partyId", partyFilter);
    if (search) params.set("search", search);
    fetch(`/api/rate-cards?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
        if (d.filters) {
          setHospitals(d.filters.hospitals || []);
          setParties(d.filters.parties || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchCards, [page, hospitalFilter, partyFilter, search]);

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
        setImportResult({
          success: false,
          error: data.error,
          errors: data.details,
        });
      } else {
        setImportResult({
          success: true,
          summary: data.summary,
          errors: data.errors,
        });
        fetchCards(); // refresh table
      }
    } catch {
      setImportResult({ success: false, error: "Network error" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Rate Cards</h1>
      <p className="text-gray-500 text-sm mb-8">
        Import and manage hospital rate cards for billing cross-checks
      </p>

      {/* Import Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">
          Import Rate Cards
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
            {importing ? "Importing..." : "Upload & Import"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Required columns: hospital_name, party_name, category_name,
          service_code, service_description, rate. Optional: revised_rate,
          effective_start_date, effective_end_date.
        </p>

        {/* Import Result */}
        {importResult && (
          <div
            className={`mt-4 p-4 rounded-lg text-sm ${
              importResult.success
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {importResult.success && importResult.summary && (
              <div>
                <span className="font-semibold">Import complete: </span>
                {importResult.summary.totalParsed} rows parsed,{" "}
                {importResult.summary.inserted} inserted,{" "}
                {importResult.summary.updated} updated,{" "}
                {importResult.summary.failed} failed
              </div>
            )}
            {!importResult.success && (
              <div className="font-semibold">{importResult.error}</div>
            )}
            {importResult.errors && importResult.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs opacity-90 max-h-32 overflow-auto">
                {importResult.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {importResult.errors.length > 10 && (
                  <li>...and {importResult.errors.length - 10} more</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <input
          placeholder="Search service code or description..."
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
        <select
          value={partyFilter}
          onChange={(e) => {
            setPartyFilter(e.target.value);
            setPage(1);
          }}
          className="bg-white border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
        >
          <option value="">All Parties</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
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
                  <th className="text-left px-4 py-3">Party</th>
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Service</th>
                  <th className="text-right px-4 py-3">Rate</th>
                  <th className="text-right px-4 py-3">Revised</th>
                  <th className="text-left px-4 py-3">Effective</th>
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
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {c.partyName}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-mono">
                        {c.serviceCode}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs max-w-50 truncate">
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
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {new Date(c.effectiveStartDate).toLocaleDateString()}
                        {c.effectiveEndDate &&
                          ` – ${new Date(c.effectiveEndDate).toLocaleDateString()}`}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No rate cards found. Import a CSV or Excel file to get
                      started.
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
