"use client";

import { useMemo, useRef, useState } from "react";
import {
  type PDFPageImageResult,
  extractAllPagesFromPDF,
} from "@/app/utils/pdf-extractor";

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
    failed_pages_detail?: Array<{
      page_no: number;
      failure_type: string | null;
      attempts: number;
      retryable: boolean;
      reasons: string[];
    }>;
    page_attempts?: Array<{
      page_no: number;
      final_status: "SUCCESS" | "FAILED";
      recovered_by_retry: boolean;
      failure_type: string | null;
      attempts: Array<{
        attempt_no: number;
        prompt_version: string;
        status: "SUCCESS" | "FAILED";
        retryable: boolean;
        failure_reason: string | null;
      }>;
    }>;
  };
  chunk?: {
    chunk_index: number;
    total_chunks: number;
    page_offset: number;
    page_count: number;
    is_chunked: boolean;
  };
  reconciliation: {
    mismatch_tolerance_pkr: number;
    sections: ReconciliationEntry[];
    has_major_mismatch: boolean;
    has_minor_mismatch: boolean;
  };
  runtime_metrics?: {
    processing_time_ms?: number;
    ocr_concurrency?: number;
    adaptive_retry_pages_count?: number;
    page_retry_attempts_count?: number;
    failed_pages_count?: number;
    attempted_pages_count?: number;
  };
};

type ApiErrorPayload = {
  error?: string;
  details?: string;
  retryable?: boolean;
  retry_after_seconds?: number;
  support_hint?: string;
  request_id?: string;
};

type UploadDiagnostics = {
  estimatedPages: number;
  estimatedBytes: number;
  originalEstimatedBytes: number;
  warnLargePayload: boolean;
  transportFallbackApplied: boolean;
  chunkSize: number;
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

type ValidateMergedResponse = {
  request_id: string;
  validation_results: BillValidationResult;
  reconciliation: BillsExtractionResponse["reconciliation"];
};

type ChunkProgress = {
  totalChunks: number;
  currentChunk: number;
  attempt: number;
  isRetrying: boolean;
};

type ClientRunMetrics = {
  totalChunks: number;
  chunkSize: number;
  chunkRetries: number;
  chunkRetryRate: number;
  transportFallbackApplied: boolean;
  originalUploadBytes: number;
  finalUploadBytes: number;
  totalDurationMs: number;
  serverAdaptiveRetryPages: number;
  serverPageRetryAttempts: number;
  serverFailedPages: number;
  serverOcrConcurrency: number | null;
};

const MAX_FILE_SIZE_MB = 20;
const SINGLE_REQUEST_WARN_BYTES = 18 * 1024 * 1024;
const UPLOAD_CHUNK_PAGE_SIZE_MIN = 1;
const UPLOAD_CHUNK_PAGE_SIZE_MAX = 2;
const CHUNK_MAX_RETRIES = 2;
const CHUNK_RETRY_FALLBACK_SECONDS = 3;
const CHUNK_RETRY_JITTER_MS = 400;
const TRANSPORT_FALLBACK_TRIGGER_BYTES = 26 * 1024 * 1024;
const TRANSPORT_TARGET_MAX_PAGE_BYTES = 10 * 1024 * 1024;
const TRANSPORT_JPEG_QUALITY = 0.88;
const TRANSPORT_MAX_DIMENSION_PX = 2800;
const TRANSPORT_MIN_SCALE = 0.72;
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, unitIndex);
  const decimals = unitIndex === 0 ? 0 : unitIndex === 1 ? 1 : 2;

  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function sanitizeResponsePreview(rawText: string, maxLength = 180): string {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function hasObjectShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return hasObjectShape(value) && (typeof value.error === "string" || typeof value.details === "string");
}

function isBillsExtractionResponse(value: unknown): value is BillsExtractionResponse {
  return (
    hasObjectShape(value) &&
    typeof value.request_id === "string" &&
    Array.isArray(value.line_items) &&
    hasObjectShape(value.metadata)
  );
}

function isRevalidateResponse(value: unknown): value is RevalidateResponse {
  return (
    hasObjectShape(value) &&
    typeof value.request_id === "string" &&
    Array.isArray(value.updated_line_results) &&
    Array.isArray(value.remap_trace)
  );
}

async function parseApiResponse<T>(response: Response): Promise<{
  payload: T | null;
  rawText: string;
  contentType: string;
}> {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    return {
      payload: null,
      rawText,
      contentType,
    };
  }

  const shouldParseJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!shouldParseJson) {
    return {
      payload: null,
      rawText,
      contentType,
    };
  }

  try {
    const payload = JSON.parse(trimmed) as T;
    return {
      payload,
      rawText,
      contentType,
    };
  } catch {
    return {
      payload: null,
      rawText,
      contentType,
    };
  }
}

function buildApiErrorMessage(
  response: Response,
  payload: ApiErrorPayload | null,
  rawText: string,
  fallback: string,
): string {
  const statusContext = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;

  if (payload) {
    const message = payload.error ?? fallback;
    const details = payload.details ? ` ${payload.details}` : "";
    const retryHint = payload.retryable
      ? ` Retry after ${payload.retry_after_seconds ?? 3}s.`
      : payload.support_hint
        ? ` ${payload.support_hint}`
        : "";
    const requestIdHint = payload.request_id ? ` Request ID: ${payload.request_id}.` : "";

    return `${message} (${statusContext}).${details}${retryHint}${requestIdHint}`.trim();
  }

  const preview = sanitizeResponsePreview(rawText);
  const largeRequestHint = response.status === 413
    ? " The upload payload is too large for a single request."
    : "";

  return `${fallback} (${statusContext}).${largeRequestHint}${preview ? ` Server response: ${preview}` : ""}`.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDynamicChunkSize(totalBytes: number, pageCount: number): number {
  if (pageCount >= 5) {
    return UPLOAD_CHUNK_PAGE_SIZE_MIN;
  }

  if (pageCount <= UPLOAD_CHUNK_PAGE_SIZE_MIN) {
    return UPLOAD_CHUNK_PAGE_SIZE_MIN;
  }

  const avgPageBytes = totalBytes / Math.max(pageCount, 1);
  if (totalBytes >= 34 * 1024 * 1024 || avgPageBytes >= 5 * 1024 * 1024) {
    return UPLOAD_CHUNK_PAGE_SIZE_MIN;
  }

  return UPLOAD_CHUNK_PAGE_SIZE_MAX;
}

function computeChunkRetryDelayMs(retryAfterSeconds: number, attempt: number): number {
  const baseMs = Math.max(1, retryAfterSeconds) * 1000;
  const exponentialFactor = Math.pow(2, Math.max(attempt, 0));
  const jitterMs = Math.floor(Math.random() * CHUNK_RETRY_JITTER_MS);
  return baseMs * exponentialFactor + jitterMs;
}

async function maybeCompressBlobForTransport(blob: Blob): Promise<Blob | null> {
  if (typeof window === "undefined") {
    return null;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const maxDimension = Math.max(bitmap.width, bitmap.height);
  const rawScale = Math.min(1, TRANSPORT_MAX_DIMENSION_PX / Math.max(maxDimension, 1));
  const guardedScale = Math.max(rawScale, TRANSPORT_MIN_SCALE);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * guardedScale));
  canvas.height = Math.max(1, Math.round(bitmap.height * guardedScale));

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const jpegBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (compressed) => resolve(compressed),
      "image/jpeg",
      TRANSPORT_JPEG_QUALITY,
    );
  });

  if (!jpegBlob) {
    return null;
  }

  // Keep quality guardrail: accept only if meaningful size reduction.
  if (jpegBlob.size >= blob.size * 0.98) {
    return null;
  }

  return jpegBlob;
}

async function optimizePagesForTransport(
  pages: PDFPageImageResult[],
): Promise<{
  pages: PDFPageImageResult[];
  originalBytes: number;
  finalBytes: number;
  applied: boolean;
}> {
  const originalBytes = pages.reduce((sum, page) => sum + page.imageBlob.size, 0);
  const hasOversizedPage = pages.some(
    (page) => page.imageBlob.size > TRANSPORT_TARGET_MAX_PAGE_BYTES,
  );

  const shouldOptimize =
    originalBytes >= TRANSPORT_FALLBACK_TRIGGER_BYTES || hasOversizedPage;

  if (!shouldOptimize) {
    return {
      pages,
      originalBytes,
      finalBytes: originalBytes,
      applied: false,
    };
  }

  let applied = false;
  const optimizedPages: PDFPageImageResult[] = [];

  for (const page of pages) {
    const shouldCompressPage =
      page.imageBlob.size > TRANSPORT_TARGET_MAX_PAGE_BYTES ||
      originalBytes >= TRANSPORT_FALLBACK_TRIGGER_BYTES;

    if (!shouldCompressPage) {
      optimizedPages.push(page);
      continue;
    }

    const compressedBlob = await maybeCompressBlobForTransport(page.imageBlob);
    if (!compressedBlob) {
      optimizedPages.push(page);
      continue;
    }

    applied = true;
    optimizedPages.push({
      ...page,
      imageBlob: compressedBlob,
      format: compressedBlob.type.includes("jpeg") ? "jpeg" : page.format,
    });
  }

  const finalBytes = optimizedPages.reduce((sum, page) => sum + page.imageBlob.size, 0);

  return {
    pages: optimizedPages,
    originalBytes,
    finalBytes,
    applied,
  };
}

function emptySummaryTotals(): SummaryTotals {
  return {
    consultations: null,
    pharmacy: null,
    laboratory: null,
    radiology: null,
    direct_services: null,
    opd_services: null,
    grand_total: null,
  };
}

function emptyReconciliation(): BillsExtractionResponse["reconciliation"] {
  return {
    mismatch_tolerance_pkr: 1,
    sections: [],
    has_major_mismatch: false,
    has_minor_mismatch: false,
  };
}

function isValidateMergedResponse(value: unknown): value is ValidateMergedResponse {
  return (
    hasObjectShape(value) &&
    typeof value.request_id === "string" &&
    hasObjectShape(value.validation_results) &&
    hasObjectShape(value.reconciliation)
  );
}

function pickFirstNonEmpty(
  ...values: Array<string | number | null | undefined>
): string | number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function mergePrintedTotals(chunks: BillsExtractionResponse[]): SummaryTotals {
  const merged = emptySummaryTotals();

  for (const key of TOTAL_KEYS.map((entry) => entry.key)) {
    for (const chunk of chunks) {
      const candidate = chunk.summary_totals_printed[key];
      if (candidate !== null && candidate !== undefined) {
        merged[key] = candidate;
        break;
      }
    }
  }

  return merged;
}

function computeSummaryFromLines(lineItems: BillLineItem[]): SummaryTotals {
  const summary = emptySummaryTotals();

  for (const line of lineItems) {
    const amount = line.line_amount ?? 0;
    if (line.section === "consultations") {
      summary.consultations = (summary.consultations ?? 0) + amount;
    } else if (line.section === "pharmacy") {
      summary.pharmacy = (summary.pharmacy ?? 0) + amount;
    } else if (line.section === "laboratory") {
      summary.laboratory = (summary.laboratory ?? 0) + amount;
    } else if (line.section === "radiology") {
      summary.radiology = (summary.radiology ?? 0) + amount;
    } else if (line.section === "direct_services") {
      summary.direct_services = (summary.direct_services ?? 0) + amount;
    } else if (line.section === "opd_services") {
      summary.opd_services = (summary.opd_services ?? 0) + amount;
    }
  }

  summary.grand_total = Number(
    lineItems.reduce((sum, line) => sum + (line.line_amount ?? 0), 0).toFixed(2),
  );

  for (const key of TOTAL_KEYS.map((entry) => entry.key)) {
    if (summary[key] !== null) {
      summary[key] = Number((summary[key] ?? 0).toFixed(2));
    }
  }

  return summary;
}

function mergeChunkResponses(chunks: BillsExtractionResponse[]): BillsExtractionResponse {
  const orderedChunks = [...chunks].sort((left, right) => {
    const leftIndex = left.chunk?.chunk_index ?? 0;
    const rightIndex = right.chunk?.chunk_index ?? 0;
    return leftIndex - rightIndex;
  });

  const mergedLineItems = orderedChunks
    .flatMap((chunk) => chunk.line_items)
    .sort((left, right) => {
      if (left.page_no !== right.page_no) {
        return left.page_no - right.page_no;
      }
      return left.line_no - right.line_no;
    })
    .map((line, index) => ({
      ...line,
      line_no: index + 1,
    }));

  const mergedExceptions = orderedChunks
    .flatMap((chunk) => chunk.exceptions)
    .sort((left, right) => {
      const leftPage = left.page_no ?? Number.MAX_SAFE_INTEGER;
      const rightPage = right.page_no ?? Number.MAX_SAFE_INTEGER;
      return leftPage - rightPage;
    });

  const failedPages = Array.from(
    new Set(
      orderedChunks.flatMap((chunk) =>
        chunk.extraction_health?.failed_pages ?? [],
      ),
    ),
  ).sort((left, right) => left - right);

  const firstChunk = orderedChunks[0];
  const lastChunk = orderedChunks[orderedChunks.length - 1];
  const totalPages = Math.max(
    ...orderedChunks.map((chunk) => chunk.extraction_health?.total_pages ?? 0),
    ...orderedChunks.map((chunk) => chunk.metadata.source_pages_count ?? 0),
    mergedLineItems.reduce((max, line) => Math.max(max, line.page_no), 0),
  );

  return {
    request_id: lastChunk.request_id,
    metadata: {
      hospital_name: pickFirstNonEmpty(
        firstChunk.metadata.hospital_name,
        ...orderedChunks.map((chunk) => chunk.metadata.hospital_name),
      ) as string | null,
      patient_name: pickFirstNonEmpty(
        firstChunk.metadata.patient_name,
        ...orderedChunks.map((chunk) => chunk.metadata.patient_name),
      ) as string | null,
      party_name: pickFirstNonEmpty(
        firstChunk.metadata.party_name,
        ...orderedChunks.map((chunk) => chunk.metadata.party_name),
      ) as string | null,
      encounter_datetime: pickFirstNonEmpty(
        firstChunk.metadata.encounter_datetime,
        ...orderedChunks.map((chunk) => chunk.metadata.encounter_datetime),
      ) as string | null,
      source_pages_count: totalPages || undefined,
      prompt_version: pickFirstNonEmpty(
        firstChunk.metadata.prompt_version,
        ...orderedChunks.map((chunk) => chunk.metadata.prompt_version),
      ) as string | null,
    },
    summary_totals_printed: mergePrintedTotals(orderedChunks),
    summary_totals_computed: computeSummaryFromLines(mergedLineItems),
    line_items: mergedLineItems,
    validation_results: null,
    exceptions: mergedExceptions,
    extraction_health: {
      total_pages: totalPages,
      failed_pages: failedPages,
      failed_pages_count: failedPages.length,
      partial_success: failedPages.length > 0,
    },
    reconciliation: emptyReconciliation(),
  };
}

function validationBadgeClass(status: BillValidationStatus): string {
  const classes: Record<BillValidationStatus, string> = {
    MATCH: "bg-emerald-50 text-emerald-700 border-emerald-200",
    OVERCHARGED: "bg-red-50 text-red-700 border-red-200",
    UNDERCHARGED: "bg-amber-50 text-amber-700 border-amber-200",
    NOT_IN_RATE_LIST: "bg-gray-100 text-gray-700 border-gray-200",
    AMBIGUOUS_MATCH: "bg-orange-50 text-orange-700 border-orange-200",
    DATE_OUT_OF_RANGE: "bg-violet-50 text-violet-700 border-violet-200",
    LOW_CONFIDENCE: "bg-cyan-50 text-cyan-700 border-cyan-200",
  };

  return classes[status];
}

function reconciliationBadgeClass(status: ReconciliationEntry["status"]): string {
  const classes: Record<ReconciliationEntry["status"], string> = {
    MATCH: "bg-emerald-50 text-emerald-700 border-emerald-200",
    MINOR_RECONCILIATION_DIFFERENCE:
      "bg-amber-50 text-amber-700 border-amber-200",
    TOTAL_MISMATCH: "bg-red-50 text-red-700 border-red-200",
    NOT_AVAILABLE: "bg-gray-100 text-gray-700 border-gray-200",
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
  const [uploadDiagnostics, setUploadDiagnostics] = useState<UploadDiagnostics | null>(null);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  const [runMetrics, setRunMetrics] = useState<ClientRunMetrics | null>(null);
  const [remapDraft, setRemapDraft] = useState<Record<number, string>>({});
  const [remapTrace, setRemapTrace] = useState<RemapTraceEntry[]>([]);

  const [sectionFilter, setSectionFilter] = useState<"ALL" | BillSection>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | BillValidationStatus>("ALL");
  const [lineSearch, setLineSearch] = useState("");

  const [exceptionTypeFilter, setExceptionTypeFilter] = useState<string>("ALL");
  const [exceptionSearch, setExceptionSearch] = useState("");

  const validationRows = useMemo(
    () => result?.validation_results?.line_results ?? [],
    [result?.validation_results?.line_results],
  );

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
    setUploadDiagnostics(null);
    setSelectedFile(file);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setProcessingMs(null);
    setUploadDiagnostics(null);
    setChunkProgress(null);
    setRunMetrics(null);
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
    setChunkProgress(null);
    setRunMetrics(null);
    const startedAt = Date.now();

    try {
      const extractedPages = await extractAllPagesFromPDF(selectedFile);
      const transportOptimized = await optimizePagesForTransport(extractedPages);
      const pages = transportOptimized.pages;
      const estimatedBytes = transportOptimized.finalBytes;
      const chunkSize = resolveDynamicChunkSize(estimatedBytes, pages.length);

      setUploadDiagnostics({
        estimatedPages: pages.length,
        estimatedBytes,
        originalEstimatedBytes: transportOptimized.originalBytes,
        warnLargePayload: estimatedBytes >= SINGLE_REQUEST_WARN_BYTES,
        transportFallbackApplied: transportOptimized.applied,
        chunkSize,
      });

      const totalChunks = Math.max(1, Math.ceil(pages.length / chunkSize));
      const chunkResponses: BillsExtractionResponse[] = [];
      let chunkRetryCount = 0;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const chunkStart = chunkIndex * chunkSize;
        const chunkPages = pages.slice(chunkStart, chunkStart + chunkSize);

        let chunkCompleted = false;
        for (let attempt = 0; attempt <= CHUNK_MAX_RETRIES; attempt += 1) {
          setChunkProgress({
            totalChunks,
            currentChunk: chunkIndex + 1,
            attempt: attempt + 1,
            isRetrying: attempt > 0,
          });

          const formData = new FormData();
          for (const page of chunkPages) {
            const pageFile = new File(
              [page.imageBlob],
              `page-${String(page.pageNumber).padStart(3, "0")}.png`,
              { type: page.imageBlob.type || "image/png" },
            );
            formData.append("page_images", pageFile);
          }

          formData.append("chunk_index", String(chunkIndex));
          formData.append("total_chunks", String(totalChunks));
          formData.append("page_offset", String(chunkStart));
          formData.append("total_pages", String(pages.length));

          const response = await fetch("/api/extract/bills", {
            method: "POST",
            body: formData,
          });

          const { payload, rawText } = await parseApiResponse<unknown>(response);
          const errorPayload = isApiErrorPayload(payload) ? payload : null;

          if (!response.ok) {
            const isRetryable = Boolean(errorPayload?.retryable);
            const hasAttemptsLeft = attempt < CHUNK_MAX_RETRIES;

            if (isRetryable && hasAttemptsLeft) {
              const retryAfterSeconds = errorPayload?.retry_after_seconds ?? CHUNK_RETRY_FALLBACK_SECONDS;
              const delayMs = computeChunkRetryDelayMs(retryAfterSeconds, attempt);
              chunkRetryCount += 1;
              await sleep(delayMs);
              continue;
            }

            throw new Error(
              buildApiErrorMessage(
                response,
                errorPayload,
                rawText,
                `Bills extraction failed on chunk ${chunkIndex + 1}/${totalChunks}.`,
              ),
            );
          }

          if (!isBillsExtractionResponse(payload)) {
            throw new Error(
              buildApiErrorMessage(
                response,
                errorPayload,
                rawText,
                `Chunk ${chunkIndex + 1}/${totalChunks} succeeded but returned an unexpected response shape.`,
              ),
            );
          }

          chunkResponses.push(payload);
          chunkCompleted = true;
          break;
        }

        if (!chunkCompleted) {
          throw new Error(`Failed to upload chunk ${chunkIndex + 1}/${totalChunks} after retries.`);
        }
      }

      let finalResult =
        chunkResponses.length === 1
          ? chunkResponses[0]
          : mergeChunkResponses(chunkResponses);

      if (chunkResponses.length > 1) {
        const validateResponse = await fetch("/api/extract/bills/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metadata: finalResult.metadata,
            summary_totals_printed: finalResult.summary_totals_printed,
            summary_totals_computed: finalResult.summary_totals_computed,
            line_items: finalResult.line_items,
          }),
        });

        const { payload: validatePayload, rawText: validateRawText } = await parseApiResponse<unknown>(validateResponse);
        const validateErrorPayload = isApiErrorPayload(validatePayload)
          ? validatePayload
          : null;

        if (!validateResponse.ok) {
          throw new Error(
            buildApiErrorMessage(
              validateResponse,
              validateErrorPayload,
              validateRawText,
              "Merged validation failed.",
            ),
          );
        }

        if (!isValidateMergedResponse(validatePayload)) {
          throw new Error(
            buildApiErrorMessage(
              validateResponse,
              validateErrorPayload,
              validateRawText,
              "Merged validation returned an unexpected response shape.",
            ),
          );
        }

        finalResult = {
          ...finalResult,
          validation_results: validatePayload.validation_results,
          reconciliation: validatePayload.reconciliation,
        };
      }

      setResult(finalResult);
      const totalDurationMs = Date.now() - startedAt;
      const serverAdaptiveRetryPages = chunkResponses.reduce(
        (sum, chunk) => sum + (chunk.runtime_metrics?.adaptive_retry_pages_count ?? 0),
        0,
      );
      const serverPageRetryAttempts = chunkResponses.reduce(
        (sum, chunk) => sum + (chunk.runtime_metrics?.page_retry_attempts_count ?? 0),
        0,
      );
      const serverOcrConcurrency =
        chunkResponses.find((chunk) => typeof chunk.runtime_metrics?.ocr_concurrency === "number")
          ?.runtime_metrics?.ocr_concurrency ?? null;

      setRunMetrics({
        totalChunks,
        chunkSize,
        chunkRetries: chunkRetryCount,
        chunkRetryRate: Number((chunkRetryCount / Math.max(totalChunks, 1)).toFixed(2)),
        transportFallbackApplied: transportOptimized.applied,
        originalUploadBytes: transportOptimized.originalBytes,
        finalUploadBytes: transportOptimized.finalBytes,
        totalDurationMs,
        serverAdaptiveRetryPages,
        serverPageRetryAttempts,
        serverFailedPages: finalResult.extraction_health?.failed_pages_count ?? 0,
        serverOcrConcurrency,
      });

      setProcessingMs(totalDurationMs);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to process bill document.",
      );
      setProcessingMs(null);
      setRunMetrics(null);
    } finally {
      setIsLoading(false);
      setChunkProgress(null);
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

      const { payload, rawText } = await parseApiResponse<unknown>(response);
      const errorPayload = isApiErrorPayload(payload) ? payload : null;

      if (!response.ok) {
        throw new Error(
          buildApiErrorMessage(
            response,
            errorPayload,
            rawText,
            "Targeted revalidation failed.",
          ),
        );
      }

      if (!isRevalidateResponse(payload)) {
        throw new Error(
          buildApiErrorMessage(
            response,
            errorPayload,
            rawText,
            "Revalidation succeeded but returned an unexpected response shape.",
          ),
        );
      }

      const resolvedPayload = payload;
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
        <h1 className="text-2xl font-bold text-gray-900">Bills Validation</h1>
        <p className="text-gray-600 text-sm mt-1">
          Upload a bills PDF, run extraction and validation, then review exceptions and mismatches.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {result?.extraction_health?.partial_success && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-4 text-sm">
          Partial extraction success: {result.extraction_health.failed_pages_count} page(s) had OCR issues.
          Failed pages: {result.extraction_health.failed_pages.join(", ") || "-"}.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-600 mb-2">Bills PDF</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              disabled={isLoading}
              className="w-full bg-gray-50 border border-gray-300 text-sm text-gray-800 rounded-lg px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-gray-900"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleProcess}
              disabled={!selectedFile || isLoading}
              className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-100 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
            >
              {isLoading ? "Processing..." : "Extract + Validate"}
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-900 text-sm rounded-lg px-4 py-2 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500 flex flex-wrap gap-x-5 gap-y-1">
          <span>PDF max size: {MAX_FILE_SIZE_MB}MB</span>
          {selectedFile && <span>Selected: {selectedFile.name}</span>}
          {uploadDiagnostics && (
            <span>
              Estimated upload: {formatBytes(uploadDiagnostics.estimatedBytes)} ({uploadDiagnostics.estimatedPages} page images)
            </span>
          )}
          {uploadDiagnostics?.transportFallbackApplied && (
            <span>
              Transport fallback applied: {formatBytes(uploadDiagnostics.originalEstimatedBytes)} to {formatBytes(uploadDiagnostics.estimatedBytes)}
            </span>
          )}
          {uploadDiagnostics && (
            <span>Chunk size: {uploadDiagnostics.chunkSize} page(s)</span>
          )}
          {processingMs !== null && (
            <span>Processed in {(processingMs / 1000).toFixed(2)}s</span>
          )}
          {chunkProgress && (
            <span>
              Chunk {chunkProgress.currentChunk}/{chunkProgress.totalChunks}
              {chunkProgress.isRetrying
                ? ` retry attempt ${chunkProgress.attempt}`
                : ` attempt ${chunkProgress.attempt}`}
            </span>
          )}
          {result?.metadata?.source_pages_count && (
            <span>Pages: {result.metadata.source_pages_count}</span>
          )}
          {uploadDiagnostics?.warnLargePayload && (
            <span className="text-amber-700">
              Upload estimate is large and may exceed single-request limits in production.
            </span>
          )}
          {runMetrics && (
            <span>
              Chunk retries: {runMetrics.chunkRetries} (rate {runMetrics.chunkRetryRate}), server page retries: {runMetrics.serverPageRetryAttempts}, OCR concurrency: {runMetrics.serverOcrConcurrency ?? "-"}, adaptive recoveries: {runMetrics.serverAdaptiveRetryPages}
            </span>
          )}
        </div>
      </div>

      {result && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Export Reviewed Output</p>
              <p className="text-xs text-gray-500 mt-1">
                Exports include latest in-memory remap and revalidation updates.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportJson}
                className="bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
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
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Hospital</p>
              <p className="text-sm text-gray-900">
                {result.metadata.hospital_name || "-"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Patient</p>
              <p className="text-sm text-gray-900">
                {result.metadata.patient_name || "-"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Encounter Date</p>
              <p className="text-sm text-gray-900">
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
                  className="bg-white border border-gray-200 rounded-xl p-3"
                >
                  <p className="text-[11px] text-gray-500">{item.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">
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
                      className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-600">{entry.label}</p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border ${reconciliationBadgeClass(recon?.status || "NOT_AVAILABLE")}`}
                        >
                          {recon?.status || "NOT_AVAILABLE"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Printed: <span className="text-gray-800">{formatCurrency(printed)}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Computed: <span className="text-gray-800">{formatCurrency(computed)}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Diff: <span className="text-gray-800">{formatCurrency(recon?.difference ?? null)}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-800">
                  Manual Remap + Revalidate
                </h2>
                <button
                  onClick={handleRevalidateRemaps}
                  disabled={!selectedRemapsCount || isRevalidating}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-gray-100 disabled:text-gray-400 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
                >
                  {isRevalidating
                    ? "Revalidating..."
                    : `Revalidate Selected (${selectedRemapsCount})`}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Map unresolved rows to service codes. Revalidation only recalculates selected lines in-memory.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="text-xs text-gray-600 border-b border-gray-200">
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
                          className="border-b border-gray-200 hover:bg-gray-50 align-top"
                        >
                          <td className="px-4 py-3 text-gray-700">
                            #{row.line_no} (p{row.page_no})
                          </td>
                          <td className="px-4 py-3 text-gray-800 max-w-[320px]">
                            {row.service_description || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] px-2 py-1 rounded border ${validationBadgeClass(row.status)}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px]">
                            {candidateCodes.length ? candidateCodes.join(", ") : "No suggestions"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <select
                                value={remapDraft[row.line_no] ?? ""}
                                onChange={(event) =>
                                  handleRemapChange(row.line_no, event.target.value)
                                }
                                className="bg-gray-50 border border-gray-300 text-xs text-gray-900 rounded-lg px-2 py-1.5 min-w-[180px]"
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
                                className="bg-gray-50 border border-gray-300 text-xs text-gray-900 rounded-lg px-2 py-1.5 w-[180px]"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No unresolved rows (NOT_IN_RATE_LIST / AMBIGUOUS_MATCH) to remap.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-800">Revalidation Trace</h2>
              <p className="text-xs text-gray-500 mt-1">
                Session-only change log for manual remaps and status transitions.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="text-xs text-gray-600 border-b border-gray-200">
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
                        className="border-b border-gray-200 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {new Date(entry.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">
                          #{entry.line_no} (p{entry.page_no})
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">
                          {entry.selected_service_code || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">
                          {entry.previous_status || "-"} â†’ {entry.next_status}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className={`px-2 py-1 rounded border ${
                              entry.changed
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-gray-100 text-gray-700 border-gray-200"
                            }`}
                          >
                            {entry.changed ? "Yes" : "No"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No revalidation trace yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800">Validated Line Items</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  value={lineSearch}
                  onChange={(event) => setLineSearch(event.target.value)}
                  placeholder="Search by service, code, reference..."
                  className="md:col-span-2 bg-gray-50 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2"
                />
                <select
                  value={sectionFilter}
                  onChange={(event) =>
                    setSectionFilter(event.target.value as "ALL" | BillSection)
                  }
                  className="bg-gray-50 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2"
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
                  className="bg-gray-50 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2"
                >
                  {STATUS_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500">
                Showing {displayedRows.length} of {validationRows.length} validated lines.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[1200px]">
                <thead className="text-xs text-gray-600 border-b border-gray-200">
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
                        className="border-b border-gray-200 hover:bg-gray-50 align-top"
                      >
                        <td className="px-4 py-3 text-gray-700">{row.page_no}</td>
                        <td className="px-4 py-3 text-gray-700 capitalize">
                          {row.section.replaceAll("_", " ")}
                        </td>
                        <td className="px-4 py-3 text-gray-800 max-w-[320px]">
                          <p>{row.service_description || "-"}</p>
                          {row.matched_service_description && (
                            <p className="text-[11px] text-gray-500 mt-1">
                              Matched: {row.matched_service_description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{row.service_code_raw || "-"}</td>
                        <td className="px-4 py-3 text-gray-700">{formatNumber(row.qty)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatCurrency(row.billed_amount)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatCurrency(row.expected_line_amount)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatCurrency(row.amount_difference)}</td>
                        <td className="px-4 py-3 text-gray-700">
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
                        <td className="px-4 py-3 text-gray-600 max-w-[360px]">
                          <p>{row.reason}</p>
                          {row.candidates.length > 0 && (
                            <p className="text-[11px] text-gray-500 mt-1">
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
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No lines match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800">Exception Panel</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  value={exceptionSearch}
                  onChange={(event) => setExceptionSearch(event.target.value)}
                  placeholder="Search note/type/section..."
                  className="md:col-span-3 bg-gray-50 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2"
                />
                <select
                  value={exceptionTypeFilter}
                  onChange={(event) => setExceptionTypeFilter(event.target.value)}
                  className="bg-gray-50 border border-gray-300 text-sm text-gray-900 rounded-lg px-3 py-2"
                >
                  {exceptionTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type === "ALL" ? "All Exception Types" : type}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500">
                Showing {displayedExceptions.length} of {(result.exceptions || []).length} exceptions.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="text-xs text-gray-600 border-b border-gray-200">
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
                        className="border-b border-gray-200 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 text-gray-800">{entry.type}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {entry.page_no === null ? "-" : entry.page_no}
                        </td>
                        <td className="px-4 py-3 text-gray-700 capitalize">
                          {(entry.section || "-").replaceAll("_", " ")}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{entry.note}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
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
