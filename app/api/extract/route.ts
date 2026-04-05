import { NextRequest, NextResponse } from "next/server";
import { access, appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { join } from "path";

function parsePositiveInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

const ATLASCLOUD_API_KEY = process.env.ATLASCLOUD_API_KEY;
const ATLASCLOUD_API_URL = "https://api.atlascloud.ai/v1/chat/completions";
const MODEL_ID = "qwen/qwen3-vl-8b-instruct";
const MODEL_NAME = "Qwen3 VL 8B Instruct";
const MODEL_CONTEXT_WINDOW_TOKENS = 128_000;
const INPUT_USD_PER_1M_TOKENS = 0.08;
const OUTPUT_USD_PER_1M_TOKENS = 0.5;
const COST_LOG_DIR = join(process.cwd(), "logs");
const COST_LOG_RELATIVE_PATH = "logs/claim-costs.csv";
const COST_LOG_PATH = join(COST_LOG_DIR, "claim-costs.csv");
const EXTRACTION_AUDIT_LOG_RELATIVE_PATH = "logs/extraction-audit.csv";
const EXTRACTION_AUDIT_LOG_PATH = join(COST_LOG_DIR, "extraction-audit.csv");
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_NETWORK_RETRIES = 2;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAIN_PROMPT_VERSION = "2026-04-04.main.v1";
const SPECIALIZED_PROMPT_BUNDLE_VERSION = "disabled.single-pass";
const CLAIM_COST_LOG_RETENTION_DAYS = parsePositiveInteger(
  process.env.CLAIM_COST_LOG_RETENTION_DAYS,
  90,
);
const EXTRACTION_AUDIT_LOG_RETENTION_DAYS = parsePositiveInteger(
  process.env.EXTRACTION_AUDIT_LOG_RETENTION_DAYS,
  365,
);

const CLAIM_TYPE_KEYS = [
  "claim_type_opd",
  "claim_type_hospitalization",
  "claim_type_pre_post_hospitalization",
  "claim_type_maternity",
  "claim_type_pre_post_natal",
] as const;

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

type ContentPart = {
  type: string;
  text?: string;
  image_url?: {
    url: string;
  };
};

type AtlasContent = string | ContentPart[];

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

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type AtlasVisionResult = {
  content: string;
  usage: TokenUsage;
};

type ClaimCostLogEntry = {
  timestamp: string;
  requestId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputAmountUsd: number;
  outputAmountUsd: number;
  totalAmountUsd: number;
};

type ExtractionAuditLogEntry = {
  timestamp: string;
  requestId: string;
  modelId: string;
  mainPromptVersion: string;
  specializedPromptVersion: string;
  extractionOutputSha256: string;
  humanReviewRequired: boolean;
  decisionStatus: "pending_human_review";
};

interface AtlasResponse {
  choices?: Array<{
    message?: {
      content?: AtlasContent;
    };
  }>;
  usage?: AtlasUsage;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^['"`]+|['"`]+$/g, "").trim();
}

function normalizeClaimTypeValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "";
  }

  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  const truthyPatterns = [
    "yes",
    "true",
    "checked",
    "check",
    "tick",
    "ticked",
    "selected",
    "mark",
    "marked",
    "x",
    "✓",
    "1",
  ];

  const falsyPatterns = [
    "no",
    "false",
    "unchecked",
    "uncheck",
    "not selected",
    "none",
    "0",
    "na",
    "n/a",
  ];

  if (truthyPatterns.some((token) => normalized === token || normalized.includes(token))) {
    return "Yes";
  }

  if (falsyPatterns.some((token) => normalized === token || normalized.includes(token))) {
    return "";
  }

  // Keep original value if model returned label text (e.g. "Hospitalization").
  return value;
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

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function parseCsvFirstColumn(line: string): string {
  const firstCommaIndex = line.indexOf(",");
  const firstColumn = firstCommaIndex === -1 ? line : line.slice(0, firstCommaIndex);
  const trimmed = firstColumn.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }

  return trimmed;
}

function isWithinRetentionWindow(isoTimestamp: string, retentionDays: number): boolean {
  const parsedTime = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsedTime)) {
    return false;
  }

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return parsedTime >= cutoffTime;
}

async function applyCsvRetention(filePath: string, retentionDays: number): Promise<void> {
  if (retentionDays <= 0) {
    return;
  }

  let existingContent = "";

  try {
    existingContent = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  const lines = existingContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return;
  }

  const [header, ...rows] = lines;
  const retainedRows = rows.filter((row) => {
    const timestamp = parseCsvFirstColumn(row);
    return isWithinRetentionWindow(timestamp, retentionDays);
  });

  const nextContent = `${[header, ...retainedRows].join("\n")}\n`;
  if (nextContent !== existingContent) {
    await writeFile(filePath, nextContent, "utf8");
  }
}

function hashExtractionOutput(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function appendClaimCostLog(entry: ClaimCostLogEntry): Promise<void> {
  await mkdir(COST_LOG_DIR, { recursive: true });

  try {
    await access(COST_LOG_PATH);
  } catch {
    const header =
      "timestamp,request_id,model_id,input_tokens,output_tokens,total_tokens,input_cost_usd,output_cost_usd,total_cost_usd\n";
    await appendFile(COST_LOG_PATH, header, "utf8");
  }

  await applyCsvRetention(COST_LOG_PATH, CLAIM_COST_LOG_RETENTION_DAYS);

  const csvRow = [
    entry.timestamp,
    entry.requestId,
    entry.modelId,
    String(entry.inputTokens),
    String(entry.outputTokens),
    String(entry.totalTokens),
    entry.inputAmountUsd.toFixed(8),
    entry.outputAmountUsd.toFixed(8),
    entry.totalAmountUsd.toFixed(8),
  ]
    .map(escapeCsvValue)
    .join(",");

  await appendFile(COST_LOG_PATH, `${csvRow}\n`, "utf8");
}

async function appendExtractionAuditLog(entry: ExtractionAuditLogEntry): Promise<void> {
  await mkdir(COST_LOG_DIR, { recursive: true });

  try {
    await access(EXTRACTION_AUDIT_LOG_PATH);
  } catch {
    const header =
      "timestamp,request_id,model_id,main_prompt_version,specialized_prompt_version,output_sha256,human_review_required,decision_status\n";
    await appendFile(EXTRACTION_AUDIT_LOG_PATH, header, "utf8");
  }

  await applyCsvRetention(EXTRACTION_AUDIT_LOG_PATH, EXTRACTION_AUDIT_LOG_RETENTION_DAYS);

  const csvRow = [
    entry.timestamp,
    entry.requestId,
    entry.modelId,
    entry.mainPromptVersion,
    entry.specializedPromptVersion,
    entry.extractionOutputSha256,
    String(entry.humanReviewRequired),
    entry.decisionStatus,
  ]
    .map(escapeCsvValue)
    .join(",");

  await appendFile(EXTRACTION_AUDIT_LOG_PATH, `${csvRow}\n`, "utf8");
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

function normalizeAmount(rawValue: string): string {
  if (!rawValue) return "";

  const cleaned = rawValue
    .replace(/\b(rs\.?|pkr|amount|total)\b/gi, "")
    .replace(/,/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();

  // Remove common OCR suffix artifacts like '/-', '/=', '/1', '/2', '/I', '/l'.
  const withoutSlashSuffixArtifact = cleaned
    .replace(/\/\s*[-=]/g, "")
    .replace(/\/\s*[1IiLl|2]{1,2}$/g, "");

  // Keep arithmetic expressions (e.g. 3440+2617=6057) but strip dots.
  const expressionLike = withoutSlashSuffixArtifact.replace(/[^\d+=-]/g, "");

  if (!/\d/.test(expressionLike)) {
    return "";
  }

  return expressionLike;
}

async function callAtlasVision(
  base64: string,
  mimeType: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
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
          max_tokens: maxTokens,
          temperature,
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
      console.warn(
        `Atlas request transient failure (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES + 1}). Retrying in ${backoffMs}ms...`,
      );
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Atlas request failed after retries.");
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
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
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided", request_id: requestId },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/png";

    const mainPrompt = `You are an expert at extracting information from insurance claim forms and medical documents. Extract all relevant information from the provided image and return ONLY a JSON object (no markdown, no triple backticks).

Return JSON with these snake_case keys (include only fields that are visible/clear in the document):
{
  "claimant_name": "",
  "employee_id": "",
  "employee_cnic": "",
  "participant_employer_name": "",
  "plan_number": "",
  "patient_name": "",
  "patient_gender": "",
  "patient_takaful_certificate_number": "",
  "patient_date_of_birth": "",
  "patient_cnic": "",
  "patient_relationship": "",
  "mobile": "",
  "claim_type_opd": "",
  "claim_type_hospitalization": "",
  "claim_type_pre_post_hospitalization": "",
  "claim_type_maternity": "",
  "claim_type_pre_post_natal": "",
  "nature_of_medical_condition": "",
  "symptoms_cause_duration": "",
  "hospital_or_clinic_name": "",
  "date_of_admission": "",
  "date_of_discharge": "",
  "total_number_of_days": "",
  "total_claim_amount_pkr": "",
  "title_of_cheque": "",
  "payable_to_employee": "",
  "payable_to_employer": ""
}`;

    const mainResult = await callAtlasVision(base64, mimeType, mainPrompt, 4096, 0.2);
    const mainJson = extractJsonObject(mainResult.content);

    if (!mainJson) {
      return NextResponse.json(
        { error: "Model response was not valid JSON", request_id: requestId },
        { status: 500 },
      );
    }

    const merged = { ...mainJson };

    for (const key of CLAIM_TYPE_KEYS) {
      if (key in merged) {
        merged[key] = normalizeClaimTypeValue(merged[key]);
      }
    }

    const rawAmount =
      typeof merged["total_claim_amount_pkr"] === "string"
        ? merged["total_claim_amount_pkr"]
        : "";
    const normalizedAmount = normalizeAmount(rawAmount);
    if (normalizedAmount) {
      merged.total_claim_amount_pkr = normalizedAmount;
    }

    const clinicName =
      typeof merged["hospital_or_clinic_name"] === "string"
        ? sanitizeText(merged["hospital_or_clinic_name"])
        : "";
    if (clinicName.length >= 2) {
      merged.hospital_or_clinic_name = clinicName;
    }

    for (const key of ["claimant_name", "patient_name"] as const) {
      const nameValue = typeof merged[key] === "string" ? sanitizeText(merged[key]) : "";
      if (nameValue.length >= 2) {
        merged[key] = nameValue;
      }
    }

    const usage = mainResult.usage;
    const tokenUsageBreakdown: Array<{
      stage: "main_extraction";
      usage: TokenUsage;
    }> = [{ stage: "main_extraction", usage }];
    const perCallTokenCostBreakdown = tokenUsageBreakdown.map((entry) => {
      const stageInputAmountUsd = tokenCostUsd(entry.usage.inputTokens, INPUT_USD_PER_1M_TOKENS);
      const stageOutputAmountUsd = tokenCostUsd(entry.usage.outputTokens, OUTPUT_USD_PER_1M_TOKENS);

      return {
        stage: entry.stage,
        tokens: {
          input: entry.usage.inputTokens,
          output: entry.usage.outputTokens,
          total: entry.usage.totalTokens,
        },
        amount_usd: {
          input: stageInputAmountUsd,
          output: stageOutputAmountUsd,
          total: Number((stageInputAmountUsd + stageOutputAmountUsd).toFixed(8)),
        },
      };
    });
    const inputAmountUsd = tokenCostUsd(usage.inputTokens, INPUT_USD_PER_1M_TOKENS);
    const outputAmountUsd = tokenCostUsd(usage.outputTokens, OUTPUT_USD_PER_1M_TOKENS);
    const totalAmountUsd = Number((inputAmountUsd + outputAmountUsd).toFixed(8));
    const extractionOutputSha256 = hashExtractionOutput(merged);
    const timestamp = new Date().toISOString();

    try {
      await appendClaimCostLog({
        timestamp,
        requestId,
        modelId: MODEL_ID,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        inputAmountUsd,
        outputAmountUsd,
        totalAmountUsd,
      });
    } catch (logError) {
      console.warn(`[extract][${requestId}] Failed to append claim cost log:`, logError);
    }

    try {
      await appendExtractionAuditLog({
        timestamp,
        requestId,
        modelId: MODEL_ID,
        mainPromptVersion: MAIN_PROMPT_VERSION,
        specializedPromptVersion: SPECIALIZED_PROMPT_BUNDLE_VERSION,
        extractionOutputSha256,
        humanReviewRequired: true,
        decisionStatus: "pending_human_review",
      });
    } catch (auditLogError) {
      console.warn(`[extract][${requestId}] Failed to append extraction audit log:`, auditLogError);
    }

    return NextResponse.json({
      request_id: requestId,
      text: `\`\`\`json\n${JSON.stringify(merged, null, 2)}\n\`\`\``,
      cost_log_file: COST_LOG_RELATIVE_PATH,
      audit_log_file: EXTRACTION_AUDIT_LOG_RELATIVE_PATH,
      governance: {
        human_review_required: true,
        decision_status: "pending_human_review",
        policy: "No final claim denial or payment decision should be made without human reviewer approval.",
        audit_trail: {
          request_id: requestId,
          model_id: MODEL_ID,
          prompt_versions: {
            main: MAIN_PROMPT_VERSION,
            specialized_bundle: SPECIALIZED_PROMPT_BUNDLE_VERSION,
          },
          extraction_output_sha256: extractionOutputSha256,
        },
      },
      retention_days: {
        cost_log: CLAIM_COST_LOG_RETENTION_DAYS,
        extraction_audit_log: EXTRACTION_AUDIT_LOG_RETENTION_DAYS,
      },
      token_usage: {
        model: MODEL_NAME,
        model_id: MODEL_ID,
        context_window_tokens: MODEL_CONTEXT_WINDOW_TOKENS,
        billing_unit: "tokens",
        billing_source: "Atlas usage.prompt_tokens/completion_tokens",
        character_count_used_for_billing: false,
        atlas_calls_count: tokenUsageBreakdown.length,
        formula_usd:
          "(input_tokens / 1_000_000 * input_rate_usd_per_1m) + (output_tokens / 1_000_000 * output_rate_usd_per_1m)",
        pricing_usd_per_1m_tokens: {
          input: INPUT_USD_PER_1M_TOKENS,
          output: OUTPUT_USD_PER_1M_TOKENS,
        },
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens,
          total: usage.totalTokens,
        },
        amount_usd: {
          input: inputAmountUsd,
          output: outputAmountUsd,
          total: totalAmountUsd,
        },
        per_call_breakdown: perCallTokenCostBreakdown,
      },
    });
  } catch (error) {
    console.error(`[extract][${requestId}] Extract API error:`, error);
    const networkError = isRetryableNetworkError(error);
    const responseBody: {
      error: string;
      request_id: string;
      details?: string;
    } = {
      error: networkError
        ? "Temporary network issue while contacting Atlas Cloud. Please retry."
        : "Failed to process image",
      request_id: requestId,
    };

    if (!IS_PRODUCTION) {
      responseBody.details = error instanceof Error ? error.message : String(error);
    }

    return NextResponse.json(responseBody, { status: networkError ? 503 : 500 });
  }
}
