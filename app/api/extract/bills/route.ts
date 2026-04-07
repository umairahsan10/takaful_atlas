import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateBillAgainstRateList } from "@/lib/bill-validator";

const ATLASCLOUD_API_KEY = process.env.ATLASCLOUD_API_KEY;
const ATLASCLOUD_API_URL = "https://api.atlascloud.ai/v1/chat/completions";
const MODEL_ID = "qwen/qwen3-vl-8b-instruct";
const MODEL_NAME = "Qwen3 VL 8B Instruct";
const MODEL_CONTEXT_WINDOW_TOKENS = 128_000;
const INPUT_USD_PER_1M_TOKENS = 0.08;
const OUTPUT_USD_PER_1M_TOKENS = 0.5;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_NETWORK_RETRIES = 2;
const RETRY_AFTER_SECONDS = 3;
const MAX_PAGE_IMAGES = 15;
const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PROMPT_VERSION = "2026-04-07.bills.phase-e.v1";
const OCR_CONCURRENCY_DEFAULT = 1;
const OCR_CONCURRENCY_MAX = 4;

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

type AtlasUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type AtlasContentPart = {
  type: string;
  text?: string;
  image_url?: {
    url: string;
  };
};

type AtlasContent = string | AtlasContentPart[];

type AtlasResponse = {
  choices?: Array<{
    message?: {
      content?: AtlasContent;
    };
  }>;
  usage?: AtlasUsage;
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type AtlasVisionResult = {
  content: string;
  usage: TokenUsage;
};

type PerPageUsageBreakdown = {
  page_no: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
};

type SummaryTotals = {
  consultations: number | null;
  pharmacy: number | null;
  laboratory: number | null;
  radiology: number | null;
  direct_services: number | null;
  opd_services: number | null;
  grand_total: number | null;
};

type BillSection =
  | "pharmacy"
  | "laboratory"
  | "radiology"
  | "direct_services"
  | "consultations"
  | "opd_services"
  | "other";

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
  currency: "PKR";
  confidence: number | null;
  raw_text_snippet: string | null;
};

type ExtractionException = {
  type: string;
  page_no: number | null;
  section: BillSection | null;
  note: string;
};

type PageExtractionResult = {
  pageNo: number;
  metadata: Record<string, string | null>;
  summaryTotalsPrinted: SummaryTotals;
  sections: Record<BillSection, BillLineItem[]>;
  exceptions: ExtractionException[];
};

type MergedBillExtraction = {
  metadata: Record<string, string | number | null>;
  summary_totals_printed: SummaryTotals;
  summary_totals_computed: SummaryTotals;
  sections: Record<BillSection, BillLineItem[]>;
  line_items: BillLineItem[];
  exceptions: ExtractionException[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSafeTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function parseUsage(usage: AtlasUsage | undefined): TokenUsage {
  const inputTokens =
    toSafeTokenCount(usage?.input_tokens) ||
    toSafeTokenCount(usage?.prompt_tokens) ||
    toSafeTokenCount(usage?.inputTokens) ||
    toSafeTokenCount(usage?.promptTokens);

  const outputTokens =
    toSafeTokenCount(usage?.output_tokens) ||
    toSafeTokenCount(usage?.completion_tokens) ||
    toSafeTokenCount(usage?.outputTokens) ||
    toSafeTokenCount(usage?.completionTokens);

  const explicitTotal =
    toSafeTokenCount(usage?.total_tokens) || toSafeTokenCount(usage?.totalTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens: explicitTotal || inputTokens + outputTokens,
  };
}

function tokenCostUsd(tokens: number, usdPer1M: number): number {
  return Number(((tokens / 1_000_000) * usdPer1M).toFixed(8));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("eai_again") ||
    message.includes("socket hang up")
  ) {
    return true;
  }

  const causeCode = (error as Error & { cause?: { code?: string } }).cause?.code;
  return typeof causeCode === "string" && RETRYABLE_NETWORK_CODES.has(causeCode);
}

function extractMessageText(content: AtlasContent | undefined): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fencedMatch = text.match(/```json\n?([\s\S]*?)\n?```/i);
  const candidate = fencedMatch?.[1] ?? text;

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/\b(rs\.?|pkr|amount|total)\b/gi, "")
    .replace(/[,\s]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function normalizeSectionName(value: unknown): BillSection {
  const raw = asString(value)?.toLowerCase() ?? "";

  if (raw.includes("pharmacy")) return "pharmacy";
  if (raw.includes("laboratory") || raw === "lab") return "laboratory";
  if (raw.includes("radiology")) return "radiology";
  if (raw.includes("direct")) return "direct_services";
  if (raw.includes("consult")) return "consultations";
  if (raw.includes("opd")) return "opd_services";
  return "other";
}

function emptySections(): Record<BillSection, BillLineItem[]> {
  return {
    pharmacy: [],
    laboratory: [],
    radiology: [],
    direct_services: [],
    consultations: [],
    opd_services: [],
    other: [],
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

function mapSummaryKeyToCanonical(key: string): keyof SummaryTotals | null {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");

  if (normalized.includes("consult")) return "consultations";
  if (normalized.includes("pharmacy")) return "pharmacy";
  if (normalized.includes("laboratory") || normalized === "lab") return "laboratory";
  if (normalized.includes("radiology")) return "radiology";
  if (normalized.includes("direct")) return "direct_services";
  if (normalized.includes("opd")) return "opd_services";
  if (normalized === "total" || normalized === "grandtotal") return "grand_total";

  return null;
}

function normalizeSummaryTotals(rawSummary: unknown): SummaryTotals {
  const summary = emptySummaryTotals();

  const rawRecord = asRecord(rawSummary);
  if (!rawRecord) {
    return summary;
  }

  for (const [rawKey, rawValue] of Object.entries(rawRecord)) {
    const canonical = mapSummaryKeyToCanonical(rawKey);
    if (!canonical) {
      continue;
    }

    const numeric = parseNumber(rawValue);
    if (numeric !== null) {
      summary[canonical] = numeric;
    }
  }

  return summary;
}

function firstNonNull<T>(current: T | null, incoming: T | null): T | null {
  return current ?? incoming;
}

function normalizeException(
  rawException: unknown,
  fallbackPageNo: number,
): ExtractionException | null {
  const rec = asRecord(rawException);
  if (!rec) {
    return null;
  }

  const type = asString(rec.type) ?? "EXTRACTION_NOTE";
  const note = asString(rec.note) ?? asString(rec.message) ?? "No details provided.";
  const pageNo = parseNumber(rec.page_no) ?? fallbackPageNo;
  const section = normalizeSectionName(rec.section ?? null);

  return {
    type,
    page_no: Number.isFinite(pageNo) ? pageNo : fallbackPageNo,
    section: section === "other" ? null : section,
    note,
  };
}

function normalizeLineItem(
  rawRow: unknown,
  pageNo: number,
  section: BillSection,
  lineNo: number,
): BillLineItem | null {
  const row = asRecord(rawRow);
  if (!row) {
    return null;
  }

  const serviceDescription =
    asString(row.service_description) ||
    asString(row.name) ||
    asString(row.item_name) ||
    asString(row.test_name) ||
    asString(row.study_name) ||
    asString(row.particular) ||
    asString(row.description) ||
    "";

  const lineAmount = parseNumber(row.line_amount ?? row.amount ?? row.total ?? row.amt);
  const qty = parseNumber(row.qty ?? row.quantity);
  let unitPrice = parseNumber(row.unit_price ?? row.unitrate ?? row.rate);

  if (unitPrice === null && qty !== null && qty > 0 && lineAmount !== null) {
    unitPrice = Number((lineAmount / qty).toFixed(2));
  }

  if (!serviceDescription && lineAmount === null) {
    return null;
  }

  const confidence = parseNumber(row.confidence);

  return {
    page_no: pageNo,
    section,
    line_no: lineNo,
    reference_no:
      asString(row.reference_no) ||
      asString(row.issuance_no) ||
      asString(row.laboratory_no) ||
      asString(row.radiology_no) ||
      asString(row.requisition_no) ||
      asString(row.ref_no),
    line_datetime:
      asString(row.line_datetime) || asString(row.date_time) || asString(row.date),
    consultant: asString(row.consultant) || asString(row.doctor),
    service_description: serviceDescription,
    service_code_raw:
      asString(row.service_code_raw) ||
      asString(row.service_code) ||
      asString(row.code),
    qty,
    unit_price: unitPrice,
    line_amount: lineAmount,
    currency: "PKR",
    confidence,
    raw_text_snippet: asString(row.raw_text_snippet) || asString(row.raw),
  };
}

function normalizePageExtraction(
  raw: Record<string, unknown>,
  pageNo: number,
): PageExtractionResult {
  const sections = emptySections();
  const exceptions: ExtractionException[] = [];

  const metadataSource = asRecord(raw.metadata) ?? {};
  const metadata: Record<string, string | null> = {
    hospital_name: asString(metadataSource.hospital_name),
    report_type: asString(metadataSource.report_type),
    patient_name: asString(metadataSource.patient_name),
    patient_identifier:
      asString(metadataSource.patient_identifier) ||
      asString(metadataSource.mr_no) ||
      asString(metadataSource["m.r._no"]),
    party_name: asString(metadataSource.party_name),
    encounter_datetime:
      asString(metadataSource.encounter_datetime) ||
      asString(metadataSource.report_date_time) ||
      asString(metadataSource.date),
    corporate_no: asString(metadataSource.corporate_no),
    employee_no: asString(metadataSource.employee_no),
    letter_ref: asString(metadataSource.letter_ref),
  };

  const summaryTotalsPrinted = normalizeSummaryTotals(
    raw.summary_totals_printed ?? raw.summary_totals ?? raw.summary,
  );

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  for (const rawSection of rawSections) {
    const sectionObj = asRecord(rawSection);
    if (!sectionObj) {
      continue;
    }

    const sectionName = normalizeSectionName(sectionObj.name ?? sectionObj.section);
    const rows = Array.isArray(sectionObj.rows)
      ? sectionObj.rows
      : Array.isArray(sectionObj.items)
        ? sectionObj.items
        : [];

    let lineNoBase = sections[sectionName].length;
    for (const row of rows) {
      lineNoBase += 1;
      const normalized = normalizeLineItem(row, pageNo, sectionName, lineNoBase);
      if (normalized) {
        sections[sectionName].push(normalized);
      }
    }
  }

  const topLevelLineItems = Array.isArray(raw.line_items) ? raw.line_items : [];
  for (const item of topLevelLineItems) {
    const itemRecord = asRecord(item);
    if (!itemRecord) {
      continue;
    }
    const sectionName = normalizeSectionName(itemRecord.section);
    const lineNo = sections[sectionName].length + 1;
    const normalized = normalizeLineItem(itemRecord, pageNo, sectionName, lineNo);
    if (normalized) {
      sections[sectionName].push(normalized);
    }
  }

  const rawExceptions = Array.isArray(raw.extraction_exceptions)
    ? raw.extraction_exceptions
    : [];
  for (const rawException of rawExceptions) {
    const normalized = normalizeException(rawException, pageNo);
    if (normalized) {
      exceptions.push(normalized);
    }
  }

  return {
    pageNo,
    metadata,
    summaryTotalsPrinted,
    sections,
    exceptions,
  };
}

function mergePages(pageResults: PageExtractionResult[]): MergedBillExtraction {
  const sections = emptySections();
  const exceptions: ExtractionException[] = [];
  const summaryTotalsPrinted = emptySummaryTotals();

  const metadata: Record<string, string | number | null> = {
    document_type: "BILLS",
    hospital_name: null,
    report_type: null,
    patient_name: null,
    patient_identifier: null,
    party_name: null,
    encounter_datetime: null,
    corporate_no: null,
    employee_no: null,
    letter_ref: null,
    source_pages_count: pageResults.length,
  };

  for (const page of pageResults) {
    metadata.hospital_name = firstNonNull(
      metadata.hospital_name as string | null,
      page.metadata.hospital_name,
    );
    metadata.report_type = firstNonNull(
      metadata.report_type as string | null,
      page.metadata.report_type,
    );
    metadata.patient_name = firstNonNull(
      metadata.patient_name as string | null,
      page.metadata.patient_name,
    );
    metadata.patient_identifier = firstNonNull(
      metadata.patient_identifier as string | null,
      page.metadata.patient_identifier,
    );
    metadata.party_name = firstNonNull(
      metadata.party_name as string | null,
      page.metadata.party_name,
    );
    metadata.encounter_datetime = firstNonNull(
      metadata.encounter_datetime as string | null,
      page.metadata.encounter_datetime,
    );
    metadata.corporate_no = firstNonNull(
      metadata.corporate_no as string | null,
      page.metadata.corporate_no,
    );
    metadata.employee_no = firstNonNull(
      metadata.employee_no as string | null,
      page.metadata.employee_no,
    );
    metadata.letter_ref = firstNonNull(
      metadata.letter_ref as string | null,
      page.metadata.letter_ref,
    );

    for (const key of Object.keys(summaryTotalsPrinted) as Array<keyof SummaryTotals>) {
      summaryTotalsPrinted[key] = firstNonNull(
        summaryTotalsPrinted[key],
        page.summaryTotalsPrinted[key],
      );
    }

    for (const sectionKey of Object.keys(sections) as BillSection[]) {
      const incoming = page.sections[sectionKey];
      for (const item of incoming) {
        sections[sectionKey].push({
          ...item,
          line_no: sections[sectionKey].length + 1,
        });
      }
    }

    exceptions.push(...page.exceptions);
  }

  const summaryTotalsComputed = emptySummaryTotals();
  summaryTotalsComputed.consultations = sections.consultations.reduce(
    (sum, row) => sum + (row.line_amount ?? 0),
    0,
  );
  summaryTotalsComputed.pharmacy = sections.pharmacy.reduce(
    (sum, row) => sum + (row.line_amount ?? 0),
    0,
  );
  summaryTotalsComputed.laboratory = sections.laboratory.reduce(
    (sum, row) => sum + (row.line_amount ?? 0),
    0,
  );
  summaryTotalsComputed.radiology = sections.radiology.reduce(
    (sum, row) => sum + (row.line_amount ?? 0),
    0,
  );
  summaryTotalsComputed.direct_services = sections.direct_services.reduce(
    (sum, row) => sum + (row.line_amount ?? 0),
    0,
  );
  summaryTotalsComputed.opd_services = sections.opd_services.reduce(
    (sum, row) => sum + (row.line_amount ?? 0),
    0,
  );

  const flattenedLineItems = (
    [
      ...sections.pharmacy,
      ...sections.laboratory,
      ...sections.radiology,
      ...sections.direct_services,
      ...sections.consultations,
      ...sections.opd_services,
      ...sections.other,
    ] as BillLineItem[]
  ).map((item, idx) => ({ ...item, line_no: idx + 1 }));

  summaryTotalsComputed.grand_total = Number(
    flattenedLineItems
      .reduce((sum, row) => sum + (row.line_amount ?? 0), 0)
      .toFixed(2),
  );

  for (const key of Object.keys(summaryTotalsComputed) as Array<keyof SummaryTotals>) {
    const value = summaryTotalsComputed[key];
    summaryTotalsComputed[key] = value === null ? null : Number(value.toFixed(2));
  }

  return {
    metadata,
    summary_totals_printed: summaryTotalsPrinted,
    summary_totals_computed: summaryTotalsComputed,
    sections,
    line_items: flattenedLineItems,
    exceptions,
  };
}

function buildBillsPrompt(pageNo: number, totalPages: number): string {
  return `You are extracting structured billing data from a hospital corporate report page.
Return ONLY valid JSON. Do not include markdown. Do not wrap in code fences.
Do not invent values. If a value is unreadable, set it to null.

Context:
- Current page: ${pageNo} of ${totalPages}
- Document can include sections: Summary, Pharmacy, Laboratory, Radiology, Direct Services, Consultations, OPD Services.

Output JSON schema:
{
  "metadata": {
    "hospital_name": string|null,
    "report_type": string|null,
    "patient_name": string|null,
    "mr_no": string|null,
    "party_name": string|null,
    "report_date_time": string|null,
    "corporate_no": string|null,
    "employee_no": string|null,
    "letter_ref": string|null
  },
  "summary_totals_printed": {
    "consultations": number|null,
    "pharmacy": number|null,
    "laboratory": number|null,
    "radiology": number|null,
    "direct_services": number|null,
    "opd_services": number|null,
    "grand_total": number|null
  },
  "sections": [
    {
      "name": string,
      "rows": [
        {
          "reference_no": string|null,
          "date_time": string|null,
          "consultant": string|null,
          "name": string|null,
          "service_code": string|null,
          "qty": number|null,
          "unit_price": number|null,
          "amount": number|null,
          "confidence": number|null,
          "raw_text_snippet": string|null
        }
      ]
    }
  ],
  "extraction_exceptions": [
    {
      "type": "LOW_CONFIDENCE_FIELD"|"TABLE_PARSE_GAP"|"UNREADABLE_SEGMENT"|string,
      "page_no": number,
      "section": string|null,
      "note": string
    }
  ]
}

Rules:
1) Keep one output row for each visible table row.
2) Preserve section names exactly as printed when possible.
3) Keep row order exactly as in the page.
4) Amounts and qty must be numeric when readable.
5) Do not merge rows.
6) If a section header exists but no rows are visible, include that section with an empty rows array.`;
}

async function callAtlasVision(
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<AtlasVisionResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt += 1) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(ATLASCLOUD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64}`,
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
          max_tokens: 4096,
          temperature: 0.1,
          stream: false,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Atlas Cloud API error (${response.status}): ${JSON.stringify(errorData)}`,
        );
      }

      const data = (await response.json()) as AtlasResponse;
      const content = extractMessageText(data.choices?.[0]?.message?.content);

      if (!content) {
        throw new Error("Atlas Cloud returned an empty response.");
      }

      return {
        content,
        usage: parseUsage(data.usage),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      const canRetry = isRetryableNetworkError(error);
      const hasAttemptsLeft = attempt < MAX_NETWORK_RETRIES;

      if (!canRetry || !hasAttemptsLeft) {
        throw error;
      }

      const backoffMs = 1000 * (attempt + 1);
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Atlas request failed after retries.");
}

function pickPageImages(formData: FormData): {
  files: File[];
  warnings: ExtractionException[];
} {
  const warnings: ExtractionException[] = [];
  const entries = formData.getAll("page_images");
  const imageFiles = entries.filter((entry): entry is File => entry instanceof File);

  if (imageFiles.length > 0) {
    return { files: imageFiles, warnings };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { files: [], warnings };
  }

  if (file.type === "application/pdf") {
    warnings.push({
      type: "PDF_INPUT_REQUIRES_PAGE_IMAGES",
      page_no: null,
      section: null,
      note: "Send page_images files (one image per PDF page). Direct PDF parsing is handled client-side in this phase.",
    });
    return { files: [], warnings };
  }

  if (file.type.startsWith("image/")) {
    return { files: [file], warnings };
  }

  warnings.push({
    type: "UNSUPPORTED_INPUT",
    page_no: null,
    section: null,
    note: "Supported input is image files or page_images extracted from a PDF.",
  });
  return { files: [], warnings };
}

function resolveOcrConcurrency(): number {
  const rawValue = Number.parseInt(process.env.BILL_OCR_CONCURRENCY ?? "", 10);
  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return OCR_CONCURRENCY_DEFAULT;
  }

  return Math.min(rawValue, OCR_CONCURRENCY_MAX);
}

function emptyPageMetadata(): Record<string, string | null> {
  return {
    hospital_name: null,
    report_type: null,
    patient_name: null,
    patient_identifier: null,
    party_name: null,
    encounter_datetime: null,
    corporate_no: null,
    employee_no: null,
    letter_ref: null,
  };
}

function buildFailedPageResult(
  pageNo: number,
  type: string,
  note: string,
): PageExtractionResult {
  return {
    pageNo,
    metadata: emptyPageMetadata(),
    summaryTotalsPrinted: emptySummaryTotals(),
    sections: emptySections(),
    exceptions: [
      {
        type,
        page_no: pageNo,
        section: null,
        note,
      },
    ],
  };
}

async function processPageImage(
  file: File,
  pageNo: number,
  totalPages: number,
): Promise<{
  pageResult: PageExtractionResult;
  usageBreakdown: PerPageUsageBreakdown | null;
}> {
  if (!file.type.startsWith("image/")) {
    return {
      pageResult: buildFailedPageResult(
        pageNo,
        "UNSUPPORTED_PAGE_MIME",
        `Page ${pageNo} has unsupported mime type: ${file.type}`,
      ),
      usageBreakdown: null,
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      pageResult: buildFailedPageResult(
        pageNo,
        "PAGE_TOO_LARGE",
        `Page ${pageNo} exceeds ${(MAX_IMAGE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB limit.`,
      ),
      usageBreakdown: null,
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const prompt = buildBillsPrompt(pageNo, totalPages);
    const atlasResult = await callAtlasVision(base64, file.type, prompt);
    const extracted = extractJsonObject(atlasResult.content);

    const inputCostUsd = tokenCostUsd(
      atlasResult.usage.inputTokens,
      INPUT_USD_PER_1M_TOKENS,
    );
    const outputCostUsd = tokenCostUsd(
      atlasResult.usage.outputTokens,
      OUTPUT_USD_PER_1M_TOKENS,
    );

    const usageBreakdown: PerPageUsageBreakdown = {
      page_no: pageNo,
      input_tokens: atlasResult.usage.inputTokens,
      output_tokens: atlasResult.usage.outputTokens,
      total_tokens: atlasResult.usage.totalTokens,
      input_cost_usd: inputCostUsd,
      output_cost_usd: outputCostUsd,
      total_cost_usd: Number((inputCostUsd + outputCostUsd).toFixed(8)),
    };

    if (!extracted) {
      return {
        pageResult: buildFailedPageResult(
          pageNo,
          "PAGE_MODEL_JSON_INVALID",
          "Model response was not valid JSON for this page.",
        ),
        usageBreakdown,
      };
    }

    return {
      pageResult: normalizePageExtraction(extracted, pageNo),
      usageBreakdown,
    };
  } catch (error) {
    return {
      pageResult: buildFailedPageResult(
        pageNo,
        "PAGE_EXTRACTION_FAILED",
        error instanceof Error
          ? error.message
          : "Unexpected page extraction error.",
      ),
      usageBreakdown: null,
    };
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.orgId) {
      return NextResponse.json(
        { error: "Authentication required", request_id: requestId },
        { status: 401 },
      );
    }

    if (!ATLASCLOUD_API_KEY) {
      return NextResponse.json(
        {
          error: IS_PRODUCTION
            ? "Extraction service is temporarily unavailable."
            : "Atlas Cloud API key not configured",
          request_id: requestId,
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const { files, warnings } = pickPageImages(formData);

    if (!files.length) {
      return NextResponse.json(
        {
          error: "No page images provided",
          request_id: requestId,
          exceptions: warnings,
        },
        { status: 400 },
      );
    }

    if (files.length > MAX_PAGE_IMAGES) {
      return NextResponse.json(
        {
          error: `Too many pages. Maximum supported pages per request is ${MAX_PAGE_IMAGES}.`,
          request_id: requestId,
        },
        { status: 400 },
      );
    }

    const pageResults = new Array<PageExtractionResult>(files.length);
    const usageBreakdownByPage = new Map<number, PerPageUsageBreakdown>();
    const ocrConcurrency = resolveOcrConcurrency();

    for (let startIndex = 0; startIndex < files.length; startIndex += ocrConcurrency) {
      const batchFiles = files.slice(startIndex, startIndex + ocrConcurrency);

      const batchResults = await Promise.all(
        batchFiles.map((file, offset) => {
          const pageNo = startIndex + offset + 1;

          return processPageImage(file, pageNo, files.length);
        }),
      );

      for (let offset = 0; offset < batchResults.length; offset += 1) {
        const pageIndex = startIndex + offset;
        const pageResult = batchResults[offset];

        pageResults[pageIndex] = pageResult.pageResult;
        if (pageResult.usageBreakdown) {
          usageBreakdownByPage.set(pageResult.usageBreakdown.page_no, pageResult.usageBreakdown);
        }
      }
    }

    const perCallBreakdown = Array.from(usageBreakdownByPage.values()).sort(
      (left, right) => left.page_no - right.page_no,
    );

    const totalInputTokens = perCallBreakdown.reduce(
      (sum, item) => sum + item.input_tokens,
      0,
    );
    const totalOutputTokens = perCallBreakdown.reduce(
      (sum, item) => sum + item.output_tokens,
      0,
    );
    const totalTokens = perCallBreakdown.reduce(
      (sum, item) => sum + item.total_tokens,
      0,
    );

    const merged = mergePages(pageResults);
    merged.exceptions.unshift(...warnings);

    const pageFailures = merged.exceptions.filter((exception) =>
      [
        "PAGE_EXTRACTION_FAILED",
        "PAGE_MODEL_JSON_INVALID",
        "UNSUPPORTED_PAGE_MIME",
        "PAGE_TOO_LARGE",
      ].includes(exception.type),
    );

    let validationResults: Awaited<
      ReturnType<typeof validateBillAgainstRateList>
    > | null = null;

    try {
      validationResults = await validateBillAgainstRateList({
        orgId: session.user.orgId,
        metadata: merged.metadata,
        lineItems: merged.line_items,
        summaryTotalsPrinted: merged.summary_totals_printed,
        summaryTotalsComputed: merged.summary_totals_computed,
      });
    } catch (validationError) {
      merged.exceptions.push({
        type: "VALIDATION_FAILED",
        page_no: null,
        section: null,
        note:
          validationError instanceof Error
            ? validationError.message
            : "Unexpected validation error.",
      });
    }

    const totalInputCostUsd = tokenCostUsd(totalInputTokens, INPUT_USD_PER_1M_TOKENS);
    const totalOutputCostUsd = tokenCostUsd(totalOutputTokens, OUTPUT_USD_PER_1M_TOKENS);

    return NextResponse.json({
      request_id: requestId,
      metadata: {
        ...merged.metadata,
        prompt_version: PROMPT_VERSION,
        model_id: MODEL_ID,
      },
      summary_totals_printed: merged.summary_totals_printed,
      summary_totals_computed: merged.summary_totals_computed,
      sections: merged.sections,
      line_items: merged.line_items,
      validation_results: validationResults,
      exceptions: merged.exceptions,
      extraction_health: {
        total_pages: files.length,
        failed_pages: Array.from(
          new Set(pageFailures.map((failure) => failure.page_no).filter((value) => value !== null)),
        ),
        failed_pages_count: Array.from(
          new Set(pageFailures.map((failure) => failure.page_no).filter((value) => value !== null)),
        ).length,
        partial_success: pageFailures.length > 0,
      },
      reconciliation: validationResults?.reconciliation ?? {
        mismatch_tolerance_pkr: 1,
        sections: [],
        has_major_mismatch: false,
        has_minor_mismatch: false,
      },
      token_usage: {
        model: MODEL_NAME,
        model_id: MODEL_ID,
        context_window_tokens: MODEL_CONTEXT_WINDOW_TOKENS,
        pricing_usd_per_1m_tokens: {
          input: INPUT_USD_PER_1M_TOKENS,
          output: OUTPUT_USD_PER_1M_TOKENS,
        },
        tokens: {
          input: totalInputTokens,
          output: totalOutputTokens,
          total: totalTokens,
        },
        amount_usd: {
          input: totalInputCostUsd,
          output: totalOutputCostUsd,
          total: Number((totalInputCostUsd + totalOutputCostUsd).toFixed(8)),
        },
        per_page_breakdown: perCallBreakdown,
      },
      persistence: {
        enabled: false,
        reason: "Phase E no-persistence mode",
      },
    });
  } catch (error) {
    console.error(`[extract/bills][${requestId}] error`, error);

    const networkError = isRetryableNetworkError(error);
    const responseBody: {
      error: string;
      request_id: string;
      retryable: boolean;
      retry_after_seconds?: number;
      max_retry_attempts?: number;
      support_hint?: string;
      details?: string;
    } = {
      error: networkError
        ? "Temporary network issue while contacting Atlas Cloud. Please retry."
        : "Failed to process bill pages",
      request_id: requestId,
      retryable: networkError,
    };

    if (networkError) {
      responseBody.retry_after_seconds = RETRY_AFTER_SECONDS;
      responseBody.max_retry_attempts = MAX_NETWORK_RETRIES + 1;
    } else {
      responseBody.support_hint =
        "If this persists, try a smaller batch of pages or contact support with request_id.";
    }

    if (!IS_PRODUCTION) {
      responseBody.details = error instanceof Error ? error.message : String(error);
    }

    return NextResponse.json(responseBody, { status: networkError ? 503 : 500 });
  }
}
