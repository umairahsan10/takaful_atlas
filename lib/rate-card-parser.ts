import * as XLSX from "xlsx";

export interface RateCardRow {
  hospitalName: string;
  partyName: string;
  categoryName: string;
  serviceCode: string;
  serviceDescription: string;
  rate: number;
  revisedRate: number | null;
  effectiveStartDate: string; // ISO date
  effectiveEndDate: string | null; // ISO date
}

export interface ParseResult {
  rows: RateCardRow[];
  errors: { row: number; message: string }[];
}

const REQUIRED_HEADERS = [
  "hospital_name",
  "party_name",
  "category_name",
  "service_code",
  "service_description",
  "rate",
];

// Normalize column header to snake_case
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  const s = String(value).trim();
  if (!s) return null;
  // Try ISO format
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

export function parseRateCardFile(
  buffer: Buffer,
  fileName: string,
): ParseResult {
  const ext = fileName.toLowerCase().split(".").pop();
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    ...(ext === "csv" ? { raw: false } : {}),
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      errors: [{ row: 0, message: "No sheets found in file" }],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (!json.length) {
    return { rows: [], errors: [{ row: 0, message: "Empty file" }] };
  }

  // Map headers
  const rawHeaders = Object.keys(json[0]);
  const headerMap = new Map<string, string>();
  for (const raw of rawHeaders) {
    headerMap.set(normalizeHeader(raw), raw);
  }

  // Check required headers
  const missing = REQUIRED_HEADERS.filter((h) => !headerMap.has(h));
  if (missing.length) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `Missing required columns: ${missing.join(", ")}. Found: ${rawHeaders.map(normalizeHeader).join(", ")}`,
        },
      ],
    };
  }

  const get = (row: Record<string, unknown>, key: string) => {
    const rawKey = headerMap.get(key);
    return rawKey ? row[rawKey] : undefined;
  };

  const rows: RateCardRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < json.length; i++) {
    const row = json[i];
    const rowNum = i + 2; // 1-indexed, +1 for header

    const hospitalName = String(get(row, "hospital_name") || "").trim();
    const partyName = String(get(row, "party_name") || "").trim();
    const categoryName = String(get(row, "category_name") || "").trim();
    const serviceCode = String(get(row, "service_code") || "").trim();
    const serviceDescription = String(
      get(row, "service_description") || "",
    ).trim();
    const rate = parseNumber(get(row, "rate"));
    const revisedRate = parseNumber(get(row, "revised_rate"));
    const effectiveStartDate = parseDate(get(row, "effective_start_date"));
    const effectiveEndDate = parseDate(get(row, "effective_end_date"));

    // Validate
    const rowErrors: string[] = [];
    if (!hospitalName) rowErrors.push("hospital_name is empty");
    if (!partyName) rowErrors.push("party_name is empty");
    if (!categoryName) rowErrors.push("category_name is empty");
    if (!serviceCode) rowErrors.push("service_code is empty");
    if (!serviceDescription) rowErrors.push("service_description is empty");
    if (rate === null) rowErrors.push("rate is not a valid number");

    if (rowErrors.length) {
      errors.push({ row: rowNum, message: rowErrors.join("; ") });
      continue;
    }

    rows.push({
      hospitalName,
      partyName,
      categoryName,
      serviceCode,
      serviceDescription,
      rate: rate!,
      revisedRate,
      effectiveStartDate:
        effectiveStartDate || new Date().toISOString().split("T")[0],
      effectiveEndDate,
    });
  }

  return { rows, errors };
}
