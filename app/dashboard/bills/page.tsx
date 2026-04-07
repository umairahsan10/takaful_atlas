"use client";

import { useMemo, useRef, useState } from "react";
import { extractAllPagesFromPDF } from "@/app/utils/pdf-extractor";

type BillSection =
  | "pharmacy"
  | "laboratory"
  | "radiology"
  | "direct_services"
  | "consultations"
  | "opd_services"
  | "other";

type BillValidationStatus =
  | "MATCH"
  | "OVERCHARGED"
  | "UNDERCHARGED"
  | "NOT_IN_RATE_LIST"
  | "AMBIGUOUS_MATCH"
  | "DATE_OUT_OF_RANGE"
  | "LOW_CONFIDENCE";

type SummaryTotals = {
  consultations: number | null;
  pharmacy: number | null;
  laboratory: number | null;
  radiology: number | null;
  direct_services: number | null;
  opd_services: number | null;
  grand_total: number | null;
};

type BillLineItem = {
  page_no: number;
  section: BillSection;
  line_no: number;
  reference_no: string | null;
  line_datetime: string | null;
  consultant: string | null;
  service_description: string;
  service_code_raw: string | null;
  qty: number | null;
  unit_price: number | null;
  line_amount: number | null;
  confidence: number | null;
};

type ValidationCandidate = {
  service_code: string;
  service_description: string;
  score: number;
};

type BillValidationLineResult = {
  page_no: number;
  section: BillSection;
  line_no: number;
  reference_no: string | null;
  service_description: string;
  service_code_raw: string | null;
  qty: number;
  billed_amount: number | null;
  matched_service_code: string | null;
  matched_service_description: string | null;
  expected_unit_rate: number | null;
  expected_line_amount: number | null;
  amount_difference: number | null;
  percentage_deviation: number | null;
  status: BillValidationStatus;
  reason: string;
  confidence: number | null;
  candidates: ValidationCandidate[];
};

type ReconciliationEntry = {
  key: keyof SummaryTotals;
  printed: number | null;
  computed: number | null;
  difference: number | null;
  status:
    | "MATCH"
    | "MINOR_RECONCILIATION_DIFFERENCE"
    | "TOTAL_MISMATCH"
    | "NOT_AVAILABLE";
};

type BillValidationResult = {
  summary: {
    total_lines: number;
    match: number;
    overcharged: number;
    undercharged: number;
    not_in_rate_list: number;
    ambiguous_match: number;
    date_out_of_range: number;
    low_confidence: number;
  };
  line_results: BillValidationLineResult[];
};

type ExtractionException = {
  type: string;
  page_no: number | null;
  section: BillSection | null;
  note: string;
};

type BillsExtractionResponse = {
  request_id: string;
  metadata: {
    hospital_name?: string | null;
    patient_name?: string | null;
    party_name?: string | null;
    encounter_datetime?: string | null;
    source_pages_count?: number;
    prompt_version?: string;
  };
  summary_totals_printed: SummaryTotals;
  summary_totals_computed: SummaryTotals;
  line_items: BillLineItem[];
  validation_results: BillValidationResult | null;
  exceptions: ExtractionException[];
  extraction_health?: {
    total_pages: number;
    failed_pages: number[];
    failed_pages_count: number;
    partial_success: boolean;
  };
  reconciliation: {
    mismatch_tolerance_pkr: number;
    sections: ReconciliationEntry[];
    has_major_mismatch: boolean;
    has_minor_mismatch: boolean;
  };
};

type ApiErrorPayload = {
  error?: string;
  details?: string;
  retryable?: boolean;
  retry_after_seconds?: number;
  support_hint?: string;
};

type RemapTraceEntry = {
  line_no: number;
  page_no: number;
  section: BillSection;
  service_description: string;
  selected_service_code: string | null;
  previous_status: BillValidationStatus | null;
  next_status: BillValidationStatus;
  previous_matched_service_code: string | null;
  next_matched_service_code: string | null;
  changed: boolean;
  reason: string;
  timestamp: string;
};

type RevalidateResponse = {
  request_id: string;
  updated_line_results: BillValidationLineResult[];
  remap_trace: RemapTraceEntry[];
  updated_count: number;
};

const MAX_FILE_SIZE_MB = 20;
const SECTION_FILTERS: Array<{ value: "ALL" | BillSection; label: string }> = [
  { value: "ALL", label: "All Sections" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "laboratory", label: "Laboratory" },
  { value: "radiology", label: "Radiology" },
  { value: "direct_services", label: "Direct Services" },
  { value: "consultations", label: "Consultations" },
  { value: "opd_services", label: "OPD Services" },
  { value: "other", label: "Other" },
];

const STATUS_FILTERS: Array<{ value: "ALL" | BillValidationStatus; label: string }> = [
  { value: "ALL", label: "All Statuses" },
  { value: "MATCH", label: "Match" },
  { value: "OVERCHARGED", label: "Overcharged" },
  { value: "UNDERCHARGED", label: "Undercharged" },
  { value: "NOT_IN_RATE_LIST", label: "Not In Rate List" },
  { value: "AMBIGUOUS_MATCH", label: "Ambiguous Match" },
  { value: "DATE_OUT_OF_RANGE", label: "Date Out Of Range" },
  { value: "LOW_CONFIDENCE", label: "Low Confidence" },
];

const TOTAL_KEYS: Array<{ key: keyof SummaryTotals; label: string }> = [
  { key: "consultations", label: "Consultations" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "laboratory", label: "Laboratory" },
  { key: "radiology", label: "Radiology" },
  { key: "direct_services", label: "Direct Services" },
  { key: "opd_services", label: "OPD Services" },
  { key: "grand_total", label: "Grand Total" },
];

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return String(value);
}

function validationBadgeClass(status: BillValidationStatus): string {
  const classes: Record<BillValidationStatus, string> = {
    MATCH: "bg-green-500/20 text-green-300 border-green-500/30",
    OVERCHARGED: "bg-red-500/20 text-red-300 border-red-500/30",
    UNDERCHARGED: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    NOT_IN_RATE_LIST: "bg-slate-600/30 text-slate-200 border-slate-500/40",
    AMBIGUOUS_MATCH: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    DATE_OUT_OF_RANGE: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    LOW_CONFIDENCE: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  };

  return classes[status];
}

function reconciliationBadgeClass(status: ReconciliationEntry["status"]): string {
  const classes: Record<ReconciliationEntry["status"], string> = {
    MATCH: "bg-green-500/20 text-green-300 border-green-500/30",
    MINOR_RECONCILIATION_DIFFERENCE:
      "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    TOTAL_MISMATCH: "bg-red-500/20 text-red-300 border-red-500/30",
    NOT_AVAILABLE: "bg-slate-600/30 text-slate-200 border-slate-500/40",
  };

  return classes[status];
}

function computeValidationSummary(lines: BillValidationLineResult[]): BillValidationResult["summary"] {
  return {
    total_lines: lines.length,
    match: lines.filter((line) => line.status === "MATCH").length,
    overcharged: lines.filter((line) => line.status === "OVERCHARGED").length,
    undercharged: lines.filter((line) => line.status === "UNDERCHARGED").length,
    not_in_rate_list: lines.filter((line) => line.status === "NOT_IN_RATE_LIST").length,
    ambiguous_match: lines.filter((line) => line.status === "AMBIGUOUS_MATCH").length,
    date_out_of_range: lines.filter((line) => line.status === "DATE_OUT_OF_RANGE").length,
    low_confidence: lines.filter((line) => line.status === "LOW_CONFIDENCE").length,
  };
}

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toFileSlug(value: string | null | undefined): string {
  return (value ?? "reviewed")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "reviewed";
}

function buildValidationCsv(
  validationRows: BillValidationLineResult[],
  rawLineItems: BillLineItem[],
): string {
  const header = [
    "line_no",
    "page_no",
    "section",
    "service_description",
    "service_code_raw",
    "qty",
    "billed_amount",
    "expected_line_amount",
    "amount_difference",
    "percentage_deviation",
    "status",
    "reason",
    "matched_service_code",
    "matched_service_description",
  ];

  const rows = validationRows.length
    ? validationRows.map((row) => [
        row.line_no,
        row.page_no,
        row.section,
        row.service_description,
        row.service_code_raw,
        row.qty,
        row.billed_amount,
        row.expected_line_amount,
        row.amount_difference,
        row.percentage_deviation,
        row.status,
        row.reason,
        row.matched_service_code,
        row.matched_service_description,
      ])
    : rawLineItems.map((row) => [
        row.line_no,
        row.page_no,
        row.section,
        row.service_description,
        row.service_code_raw,
        row.qty,
        row.line_amount,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

function buildExceptionsCsv(exceptions: ExtractionException[]): string {
  const header = ["type", "page_no", "section", "note"];
  const rows = exceptions.map((entry) => [
    entry.type,
    entry.page_no,
    entry.section,
    entry.note,
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

export default function BillsValidationPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BillsExtractionResponse | null>(null);
  const [processingMs, setProcessingMs] = useState<number | null>(null);
  const [remapDraft, setRemapDraft] = useState<Record<number, string>>({});
  const [remapTrace, setRemapTrace] = useState<RemapTraceEntry[]>([]);

  const [sectionFilter, setSectionFilter] = useState<"ALL" | BillSection>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | BillValidationStatus>("ALL");
  const [lineSearch, setLineSearch] = useState("");

  const [exceptionTypeFilter, setExceptionTypeFilter] = useState<string>("ALL");
  const [exceptionSearch, setExceptionSearch] = useState("");

  const validationRows = result?.validation_results?.line_results ?? [];

  const unresolvedRows = useMemo(
    () =>
      validationRows.filter(
        (row) =>
          row.status === "NOT_IN_RATE_LIST" || row.status === "AMBIGUOUS_MATCH",
      ),
    [validationRows],
  );

  const selectedRemapsCount = useMemo(
    () =>
      Object.values(remapDraft).filter((value) => value.trim().length > 0).length,
    [remapDraft],
  );

  const displayedRows = useMemo(() => {
    const query = lineSearch.trim().toLowerCase();

    return validationRows.filter((row) => {
      if (sectionFilter !== "ALL" && row.section !== sectionFilter) {
        return false;
      }

      if (statusFilter !== "ALL" && row.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        row.service_description.toLowerCase().includes(query) ||
        (row.service_code_raw ?? "").toLowerCase().includes(query) ||
        (row.reference_no ?? "").toLowerCase().includes(query) ||
        row.status.toLowerCase().includes(query)
      );
    });
  }, [lineSearch, sectionFilter, statusFilter, validationRows]);

  const exceptionTypeOptions = useMemo(() => {
    const source = result?.exceptions ?? [];
    const unique = Array.from(new Set(source.map((entry) => entry.type))).sort();
    return ["ALL", ...unique];
  }, [result?.exceptions]);

  const displayedExceptions = useMemo(() => {
    const source = result?.exceptions ?? [];
    const query = exceptionSearch.trim().toLowerCase();

    return source.filter((entry) => {
      if (exceptionTypeFilter !== "ALL" && entry.type !== exceptionTypeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        entry.type.toLowerCase().includes(query) ||
        entry.note.toLowerCase().includes(query) ||
        (entry.section ?? "").toLowerCase().includes(query)
      );
    });
  }, [exceptionSearch, exceptionTypeFilter, result?.exceptions]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File size must be less than ${MAX_FILE_SIZE_MB}MB.`);
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setProcessingMs(null);
    setRemapDraft({});
    setRemapTrace([]);
    setLineSearch("");
    setSectionFilter("ALL");
    setStatusFilter("ALL");
    setExceptionSearch("");
    setExceptionTypeFilter("ALL");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleProcess = async () => {
    if (!selectedFile || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setRemapDraft({});
    setRemapTrace([]);
    const startedAt = Date.now();

    try {
      const pages = await extractAllPagesFromPDF(selectedFile);

      const formData = new FormData();
      for (const page of pages) {
        const pageFile = new File(
          [page.imageBlob],
          `page-${String(page.pageNumber).padStart(3, "0")}.png`,
          { type: page.imageBlob.type || "image/png" },
        );
        formData.append("page_images", pageFile);
      }

      const response = await fetch("/api/extract/bills", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as BillsExtractionResponse | ApiErrorPayload;

      if (!response.ok) {
        const message =
          payload && "error" in payload && payload.error
            ? payload.error
            : "Bills extraction failed.";
        const details = payload && "details" in payload ? payload.details : null;
        const retryHint =
          payload && "retryable" in payload && payload.retryable
            ? ` Retry after ${payload.retry_after_seconds ?? 3}s.`
            : payload && "support_hint" in payload && payload.support_hint
              ? ` ${payload.support_hint}`
              : "";
        throw new Error(`${details ? `${message} ${details}` : message}${retryHint}`.trim());
      }

      setResult(payload as BillsExtractionResponse);
      setProcessingMs(Date.now() - startedAt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to process bill document.",
      );
      setProcessingMs(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportJson = () => {
    if (!result) {
      return;
    }

    const exportedAt = new Date().toISOString();
    const fileName = `bills-reviewed-${toFileSlug(result.metadata.patient_name)}-${exportedAt.slice(0, 10)}.json`;

    const payload = {
      exported_at: exportedAt,
      metadata: result.metadata,
      summary_totals_printed: result.summary_totals_printed,
      summary_totals_computed: result.summary_totals_computed,
      validation_results: result.validation_results,
      line_items: result.line_items,
      exceptions: result.exceptions,
      reconciliation: result.reconciliation,
      remap_trace: remapTrace,
    };

    downloadTextFile(fileName, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  };

  const handleExportCsv = () => {
    if (!result) {
      return;
    }

    const exportedAt = new Date().toISOString();
    const fileName = `bills-reviewed-${toFileSlug(result.metadata.patient_name)}-${exportedAt.slice(0, 10)}.csv`;

    const validationCsv = buildValidationCsv(
      result.validation_results?.line_results ?? [],
      result.line_items,
    );
    const exceptionsCsv = buildExceptionsCsv(result.exceptions);
    const traceCsv = [
      ["line_no", "page_no", "selected_service_code", "previous_status", "next_status", "changed", "timestamp"].map(escapeCsvCell).join(","),
      ...remapTrace.map((entry) =>
        [
          entry.line_no,
          entry.page_no,
          entry.selected_service_code,
          entry.previous_status,
          entry.next_status,
          entry.changed,
          entry.timestamp,
        ]
          .map(escapeCsvCell)
          .join(","),
      ),
    ].join("\n");

    const fullCsv = [
      "VALIDATED_LINE_ITEMS",
      validationCsv,
      "",
      "EXCEPTIONS",
      exceptionsCsv,
      "",
      "REVALIDATION_TRACE",
      traceCsv,
    ].join("\n");

    downloadTextFile(fileName, fullCsv, "text/csv;charset=utf-8");
  };

  const handleRemapChange = (lineNo: number, value: string) => {
    setRemapDraft((prev) => ({
      ...prev,
      [lineNo]: value,
    }));
  };

  const handleRevalidateRemaps = async () => {
    if (!result || !result.validation_results || !selectedRemapsCount || isRevalidating) {
      return;
    }

    const remaps = Object.entries(remapDraft)
      .map(([lineNo, serviceCode]) => ({
        line_no: Number(lineNo),
        service_code: serviceCode.trim(),
      }))
      .filter((entry) => Number.isFinite(entry.line_no) && entry.line_no > 0 && entry.service_code);

    if (!remaps.length) {
      return;
    }

    setIsRevalidating(true);
    setError(null);

    try {
      const response = await fetch("/api/extract/bills/revalidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: result.metadata,
          summary_totals_printed: result.summary_totals_printed,
          summary_totals_computed: result.summary_totals_computed,
          line_items: result.line_items,
          existing_line_results: result.validation_results.line_results,
          remaps,
        }),
      });

      const payload = (await response.json()) as
        | RevalidateResponse
        | { error?: string; details?: string };

      if (!response.ok) {
        const message =
          payload && "error" in payload && payload.error
            ? payload.error
            : "Targeted revalidation failed.";
        const details = payload && "details" in payload ? payload.details : null;
        throw new Error(details ? `${message} ${details}` : message);
      }

      const resolvedPayload = payload as RevalidateResponse;
      const updatedByLineNo = new Map(
        resolvedPayload.updated_line_results.map((line) => [line.line_no, line]),
      );

      setResult((previous) => {
        if (!previous?.validation_results) {
          return previous;
        }

        const mergedLines = previous.validation_results.line_results.map((line) =>
          updatedByLineNo.get(line.line_no) ?? line,
        );

        return {
          ...previous,
          validation_results: {
            ...previous.validation_results,
            line_results: mergedLines,
            summary: computeValidationSummary(mergedLines),
          },
        };
      });

      setRemapTrace((previous) => [...resolvedPayload.remap_trace, ...previous].slice(0, 60));

      setRemapDraft((previous) => {
        const next = { ...previous };
        for (const entry of remaps) {
          delete next[entry.line_no];
        }
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to revalidate remapped rows.",
      );
    } finally {
      setIsRevalidating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Bills Validation</h1>
        <p className="text-slate-400 text-sm mt-1">
          Upload a bills PDF, run extraction and validation, then review exceptions and mismatches.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {result?.extraction_health?.partial_success && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl p-4 text-sm">
          Partial extraction success: {result.extraction_health.failed_pages_count} page(s) had OCR issues.
          Failed pages: {result.extraction_health.failed_pages.join(", ") || "-"}.
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-2">Bills PDF</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              disabled={isLoading}
              className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded-lg px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-100"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleProcess}
              disabled={!selectedFile || isLoading}
              className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
            >
              {isLoading ? "Processing..." : "Extract + Validate"}
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-100 text-sm rounded-lg px-4 py-2 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap gap-x-5 gap-y-1">
          <span>PDF max size: {MAX_FILE_SIZE_MB}MB</span>
          {selectedFile && <span>Selected: {selectedFile.name}</span>}
          {processingMs !== null && (
            <span>Processed in {(processingMs / 1000).toFixed(2)}s</span>
          )}
          {result?.metadata?.source_pages_count && (
            <span>Pages: {result.metadata.source_pages_count}</span>
          )}
        </div>
      </div>

      {result && (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-200">Export Reviewed Output</p>
              <p className="text-xs text-slate-500 mt-1">
                Exports include latest in-memory remap and revalidation updates.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportJson}
                className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
              >
                Export JSON
              </button>
              <button
                onClick={handleExportCsv}
                className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Hospital</p>
              <p className="text-sm text-slate-100">
                {result.metadata.hospital_name || "-"}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Patient</p>
              <p className="text-sm text-slate-100">
                {result.metadata.patient_name || "-"}
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Encounter Date</p>
              <p className="text-sm text-slate-100">
                {result.metadata.encounter_datetime || "-"}
              </p>
            </div>
          </div>

          {result.validation_results && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: "Total", value: result.validation_results.summary.total_lines },
                { label: "Match", value: result.validation_results.summary.match },
                { label: "Over", value: result.validation_results.summary.overcharged },
                { label: "Under", value: result.validation_results.summary.undercharged },
                {
                  label: "Not In List",
                  value: result.validation_results.summary.not_in_rate_list,
                },
                {
                  label: "Ambiguous",
                  value: result.validation_results.summary.ambiguous_match,
                },
                {
                  label: "Date Range",
                  value: result.validation_results.summary.date_out_of_range,
                },
                {
                  label: "Low Conf",
                  value: result.validation_results.summary.low_confidence,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3"
                >
                  <p className="text-[11px] text-slate-500">{item.label}</p>
                  <p className="text-xl font-bold text-slate-100 mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200 mb-4">
                Reconciliation Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {TOTAL_KEYS.map((entry) => {
                  const printed = result.summary_totals_printed[entry.key];
                  const computed = result.summary_totals_computed[entry.key];
                  const recon = result.reconciliation.sections.find(
                    (item) => item.key === entry.key,
                  );

                  return (
                    <div
                      key={entry.key}
                      className="border border-slate-800 rounded-lg p-3 bg-slate-900/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-400">{entry.label}</p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border ${reconciliationBadgeClass(recon?.status || "NOT_AVAILABLE")}`}
                        >
                          {recon?.status || "NOT_AVAILABLE"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Printed: <span className="text-slate-200">{formatCurrency(printed)}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Computed: <span className="text-slate-200">{formatCurrency(computed)}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Diff: <span className="text-slate-200">{formatCurrency(recon?.difference ?? null)}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-200">
                  Manual Remap + Revalidate
                </h2>
                <button
                  onClick={handleRevalidateRemaps}
                  disabled={!selectedRemapsCount || isRevalidating}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
                >
                  {isRevalidating
                    ? "Revalidating..."
                    : `Revalidate Selected (${selectedRemapsCount})`}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Map unresolved rows to service codes. Revalidation only recalculates selected lines in-memory.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="text-xs text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3">Line</th>
                    <th className="text-left px-4 py-3">Service</th>
                    <th className="text-left px-4 py-3">Current Status</th>
                    <th className="text-left px-4 py-3">Candidate Codes</th>
                    <th className="text-left px-4 py-3">Selected Code</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolvedRows.length ? (
                    unresolvedRows.map((row) => {
                      const candidateCodes = Array.from(
                        new Set(
                          row.candidates
                            .map((candidate) => candidate.service_code)
                            .filter((value) => value && value.trim().length > 0),
                        ),
                      );

                      return (
                        <tr
                          key={`remap-${row.line_no}`}
                          className="border-b border-slate-800/60 hover:bg-slate-800/30 align-top"
                        >
                          <td className="px-4 py-3 text-slate-300">
                            #{row.line_no} (p{row.page_no})
                          </td>
                          <td className="px-4 py-3 text-slate-200 max-w-[320px]">
                            {row.service_description || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] px-2 py-1 rounded border ${validationBadgeClass(row.status)}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[220px]">
                            {candidateCodes.length ? candidateCodes.join(", ") : "No suggestions"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <select
                                value={remapDraft[row.line_no] ?? ""}
                                onChange={(event) =>
                                  handleRemapChange(row.line_no, event.target.value)
                                }
                                className="bg-slate-800 border border-slate-700 text-xs text-slate-100 rounded-lg px-2 py-1.5 min-w-[180px]"
                              >
                                <option value="">Select code</option>
                                {candidateCodes.map((code) => (
                                  <option key={`${row.line_no}-${code}`} value={code}>
                                    {code}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={remapDraft[row.line_no] ?? ""}
                                onChange={(event) =>
                                  handleRemapChange(row.line_no, event.target.value)
                                }
                                placeholder="Custom service code"
                                className="bg-slate-800 border border-slate-700 text-xs text-slate-100 rounded-lg px-2 py-1.5 w-[180px]"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No unresolved rows (NOT_IN_RATE_LIST / AMBIGUOUS_MATCH) to remap.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200">Revalidation Trace</h2>
              <p className="text-xs text-slate-500 mt-1">
                Session-only change log for manual remaps and status transitions.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="text-xs text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3">Time</th>
                    <th className="text-left px-4 py-3">Line</th>
                    <th className="text-left px-4 py-3">Selected Code</th>
                    <th className="text-left px-4 py-3">Status Transition</th>
                    <th className="text-left px-4 py-3">Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {remapTrace.length ? (
                    remapTrace.map((entry, index) => (
                      <tr
                        key={`trace-${entry.line_no}-${entry.timestamp}-${index}`}
                        className="border-b border-slate-800/60 hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {new Date(entry.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          #{entry.line_no} (p{entry.page_no})
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {entry.selected_service_code || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {entry.previous_status || "-"} → {entry.next_status}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className={`px-2 py-1 rounded border ${
                              entry.changed
                                ? "bg-green-500/20 text-green-300 border-green-500/30"
                                : "bg-slate-600/30 text-slate-200 border-slate-500/40"
                            }`}
                          >
                            {entry.changed ? "Yes" : "No"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No revalidation trace yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Validated Line Items</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  value={lineSearch}
                  onChange={(event) => setLineSearch(event.target.value)}
                  placeholder="Search by service, code, reference..."
                  className="md:col-span-2 bg-slate-800 border border-slate-700 text-sm text-slate-100 rounded-lg px-3 py-2"
                />
                <select
                  value={sectionFilter}
                  onChange={(event) =>
                    setSectionFilter(event.target.value as "ALL" | BillSection)
                  }
                  className="bg-slate-800 border border-slate-700 text-sm text-slate-100 rounded-lg px-3 py-2"
                >
                  {SECTION_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "ALL" | BillValidationStatus)
                  }
                  className="bg-slate-800 border border-slate-700 text-sm text-slate-100 rounded-lg px-3 py-2"
                >
                  {STATUS_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                Showing {displayedRows.length} of {validationRows.length} validated lines.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[1200px]">
                <thead className="text-xs text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3">Page</th>
                    <th className="text-left px-4 py-3">Section</th>
                    <th className="text-left px-4 py-3">Service</th>
                    <th className="text-left px-4 py-3">Code</th>
                    <th className="text-left px-4 py-3">Qty</th>
                    <th className="text-left px-4 py-3">Billed</th>
                    <th className="text-left px-4 py-3">Expected</th>
                    <th className="text-left px-4 py-3">Diff</th>
                    <th className="text-left px-4 py-3">Deviation</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length ? (
                    displayedRows.map((row) => (
                      <tr
                        key={`${row.page_no}-${row.line_no}-${row.service_description}`}
                        className="border-b border-slate-800/60 hover:bg-slate-800/30 align-top"
                      >
                        <td className="px-4 py-3 text-slate-300">{row.page_no}</td>
                        <td className="px-4 py-3 text-slate-300 capitalize">
                          {row.section.replaceAll("_", " ")}
                        </td>
                        <td className="px-4 py-3 text-slate-200 max-w-[320px]">
                          <p>{row.service_description || "-"}</p>
                          {row.matched_service_description && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Matched: {row.matched_service_description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{row.service_code_raw || "-"}</td>
                        <td className="px-4 py-3 text-slate-300">{formatNumber(row.qty)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatCurrency(row.billed_amount)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatCurrency(row.expected_line_amount)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatCurrency(row.amount_difference)}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {row.percentage_deviation !== null
                            ? `${row.percentage_deviation.toFixed(2)}%`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] px-2 py-1 rounded border ${validationBadgeClass(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 max-w-[360px]">
                          <p>{row.reason}</p>
                          {row.candidates.length > 0 && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Candidates: {row.candidates.map((item) => item.service_code).join(", ")}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No lines match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Exception Panel</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  value={exceptionSearch}
                  onChange={(event) => setExceptionSearch(event.target.value)}
                  placeholder="Search note/type/section..."
                  className="md:col-span-3 bg-slate-800 border border-slate-700 text-sm text-slate-100 rounded-lg px-3 py-2"
                />
                <select
                  value={exceptionTypeFilter}
                  onChange={(event) => setExceptionTypeFilter(event.target.value)}
                  className="bg-slate-800 border border-slate-700 text-sm text-slate-100 rounded-lg px-3 py-2"
                >
                  {exceptionTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type === "ALL" ? "All Exception Types" : type}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                Showing {displayedExceptions.length} of {(result.exceptions || []).length} exceptions.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="text-xs text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Page</th>
                    <th className="text-left px-4 py-3">Section</th>
                    <th className="text-left px-4 py-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedExceptions.length ? (
                    displayedExceptions.map((entry, index) => (
                      <tr
                        key={`${entry.type}-${entry.page_no}-${index}`}
                        className="border-b border-slate-800/60 hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3 text-slate-200">{entry.type}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {entry.page_no === null ? "-" : entry.page_no}
                        </td>
                        <td className="px-4 py-3 text-slate-300 capitalize">
                          {(entry.section || "-").replaceAll("_", " ")}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{entry.note}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No exceptions match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
