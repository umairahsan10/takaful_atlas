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
    summary?: { totalParsed: number; inserted: number; updated: number; failed: number };
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
      const res = await fetch("/api/rate-cards/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ success: false, error: data.error, errors: data.details });
      } else {
        setImportResult({ success: true, summary: data.summary, errors: data.errors });
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
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Rate Cards</h1>
      <p className="text-slate-500 text-sm mb-8">
        Import and manage hospital rate cards for billing cross-checks
      </p>

      {/* Import Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">
          Import Rate Cards
        </h2>
        <div className="flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-600 file:text-white hover:file:bg-red-700 file:cursor-pointer"
          />
          <button
            onClick={handleImport}
            disabled={importing}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Upload & Import"}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Required columns: hospital_name, party_name, category_name,
          service_code, service_description, rate. Optional: revised_rate,
          effective_start_date, effective_end_date.
        </p>

        {/* Import Result */}
        {importResult && (
          <div
            className={`mt-4 p-4 rounded-lg text-sm ${
              importResult.success
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
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
              <ul className="mt-2 space-y-1 text-xs opacity-80 max-h-32 overflow-auto">
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
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
        />
        <select
          value={hospitalFilter}
          onChange={(e) => {
            setHospitalFilter(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 text-sm text-white rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
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
          className="bg-slate-800 border border-slate-700 text-sm text-white rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none"
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">{total} rate cards</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 animate-pulse">
            Loading...
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-800">
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
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-3 text-white text-xs">
                        {c.hospitalName}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {c.partyName}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs font-mono">
                        {c.serviceCode}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs max-w-50 truncate">
                        {c.serviceDescription}
                      </td>
                      <td className="px-4 py-3 text-white text-xs text-right">
                        {c.rate.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-right">
                        {c.revisedRate ? (
                          <span className="text-yellow-400">
                            {c.revisedRate.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
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
                      className="px-4 py-8 text-center text-slate-600"
                    >
                      No rate cards found. Import a CSV or Excel file to get
                      started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {pages > 1 && (
              <div className="p-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs text-slate-400 hover:text-white disabled:opacity-30"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page {page} of {pages}
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs text-slate-400 hover:text-white disabled:opacity-30"
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
