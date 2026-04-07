import { prisma } from "@/lib/db";

export type BillSection =
  | "pharmacy"
  | "laboratory"
  | "radiology"
  | "direct_services"
  | "consultations"
  | "opd_services"
  | "other";

export type SummaryTotals = {
  consultations: number | null;
  pharmacy: number | null;
  laboratory: number | null;
  radiology: number | null;
  direct_services: number | null;
  opd_services: number | null;
  grand_total: number | null;
};

export type BillValidationStatus =
  | "MATCH"
  | "OVERCHARGED"
  | "UNDERCHARGED"
  | "NOT_IN_RATE_LIST"
  | "AMBIGUOUS_MATCH"
  | "DATE_OUT_OF_RANGE"
  | "LOW_CONFIDENCE";

export type BillLineInput = {
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

export type BillValidationLineResult = {
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
  candidates: Array<{
    service_code: string;
    service_description: string;
    score: number;
  }>;
};

export type ReconciliationEntry = {
  key: keyof SummaryTotals;
  printed: number | null;
  computed: number | null;
  difference: number | null;
  status: "MATCH" | "MINOR_RECONCILIATION_DIFFERENCE" | "TOTAL_MISMATCH" | "NOT_AVAILABLE";
};

export type ReconciliationResult = {
  mismatch_tolerance_pkr: number;
  sections: ReconciliationEntry[];
  has_major_mismatch: boolean;
  has_minor_mismatch: boolean;
};

export type BillValidationResult = {
  context: {
    org_id: string;
    hospital_name_input: string | null;
    matched_hospital_id: string | null;
    matched_hospital_name: string | null;
    hospital_match_confidence: number;
    party_name_input: string | null;
    matched_party_id: string | null;
    matched_party_name: string | null;
    strict_single_hospital_mode: boolean;
    bill_date: string | null;
    tolerance_percent: number;
    low_confidence_threshold: number;
  };
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
  reconciliation: ReconciliationResult;
};

type RateCandidate = {
  serviceId: string;
  serviceCode: string;
  serviceDescription: string;
  rate: number;
  revisedRate: number | null;
  effectiveStartDate: Date;
  effectiveEndDate: Date | null;
};

type ValidationInput = {
  orgId: string;
  metadata: Record<string, string | number | null>;
  lineItems: BillLineInput[];
  summaryTotalsPrinted: SummaryTotals;
  summaryTotalsComputed: SummaryTotals;
};

const DEFAULT_TOLERANCE_PERCENT = parsePositiveFloat(
  process.env.BILL_VALIDATION_TOLERANCE_PERCENT,
  5,
);
const LOW_CONFIDENCE_THRESHOLD = parsePositiveFloat(
  process.env.BILL_LOW_CONFIDENCE_THRESHOLD,
  0.6,
);
const RECONCILIATION_TOLERANCE_PKR = parsePositiveFloat(
  process.env.BILL_RECONCILIATION_TOLERANCE_PKR,
  1,
);
const FUZZY_MATCH_THRESHOLD = parsePositiveFloat(
  process.env.BILL_FUZZY_MATCH_THRESHOLD,
  0.55,
);
const STRICT_SINGLE_HOSPITAL_MODE =
  process.env.BILL_STRICT_SINGLE_HOSPITAL_MODE !== "false";

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function tokenize(value: string): Set<string> {
  const normalized = normalizeText(value);
  if (!normalized) {
    return new Set<string>();
  }
  return new Set(normalized.split(" ").filter(Boolean));
}

function tokenOverlapScore(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (setA.size + setB.size - intersection);
}

function trigramSimilarity(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (left === right && left.length > 0) return 1;
  if (left.length < 3 || right.length < 3) return 0;

  const trigramsA = new Set<string>();
  const trigramsB = new Set<string>();

  for (let i = 0; i <= left.length - 3; i += 1) {
    trigramsA.add(left.slice(i, i + 3));
  }
  for (let i = 0; i <= right.length - 3; i += 1) {
    trigramsB.add(right.slice(i, i + 3));
  }

  let intersection = 0;
  for (const trigram of trigramsA) {
    if (trigramsB.has(trigram)) {
      intersection += 1;
    }
  }

  return intersection / (trigramsA.size + trigramsB.size - intersection);
}

function combinedSimilarity(a: string, b: string): number {
  const overlap = tokenOverlapScore(a, b);
  const tri = trigramSimilarity(a, b);
  return Number((overlap * 0.65 + tri * 0.35).toFixed(4));
}

function parseBillDate(rawValue: string | null): Date | null {
  if (!rawValue) {
    return null;
  }

  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  // Prefer explicit day/month/year parsing for common bill timestamp formats.
  const dmyMatch = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\D.*)?$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);

    if (year < 100) {
      year += 2000;
    }

    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      Number.isFinite(year) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      const explicitDate = new Date(Date.UTC(year, month - 1, day));
      if (Number.isFinite(explicitDate.getTime())) {
        return explicitDate;
      }
    }
  }

  const isoParsed = new Date(value);
  if (Number.isFinite(isoParsed.getTime())) {
    return isoParsed;
  }

  const digits = value.split(/[^\d]/).filter(Boolean);
  if (digits.length < 3) {
    return null;
  }

  let day = Number(digits[0]);
  let month = Number(digits[1]);
  let year = Number(digits[2]);

  if (digits[0].length === 4) {
    year = Number(digits[0]);
    month = Number(digits[1]);
    day = Number(digits[2]);
  }

  if (year < 100) {
    year += 2000;
  }

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) ? date : null;
}

function toNumber(value: { toNumber: () => number } | number): number {
  if (typeof value === "number") {
    return value;
  }
  return value.toNumber();
}

function isRateActive(rate: RateCandidate, billDate: Date): boolean {
  const start = rate.effectiveStartDate.getTime();
  const target = billDate.getTime();
  const end = rate.effectiveEndDate?.getTime() ?? Number.POSITIVE_INFINITY;
  return start <= target && target <= end;
}

async function resolveHospitalAndParty(
  orgId: string,
  metadata: Record<string, string | number | null>,
): Promise<{
  hospitalId: string | null;
  hospitalName: string | null;
  hospitalConfidence: number;
  hospitalInput: string | null;
  partyId: string | null;
  partyName: string | null;
  partyInput: string | null;
}> {
  const hospitalInput =
    typeof metadata.hospital_name === "string" ? metadata.hospital_name : null;
  const partyInput = typeof metadata.party_name === "string" ? metadata.party_name : null;

  const [hospitals, parties] = await Promise.all([
    prisma.hospital.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.party.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  let hospitalId: string | null = null;
  let hospitalName: string | null = null;
  let hospitalConfidence = 0;

  if (hospitalInput) {
    const normalizedInput = normalizeText(hospitalInput);
    const exact = hospitals.find(
      (hospital) => normalizeText(hospital.name) === normalizedInput,
    );

    if (exact) {
      hospitalId = exact.id;
      hospitalName = exact.name;
      hospitalConfidence = 1;
    } else {
      const scored = hospitals
        .map((hospital) => ({
          hospital,
          score: combinedSimilarity(normalizedInput, hospital.name),
        }))
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0 && scored[0].score >= 0.35) {
        hospitalId = scored[0].hospital.id;
        hospitalName = scored[0].hospital.name;
        hospitalConfidence = scored[0].score;
      }
    }
  }

  if (!hospitalId && hospitals.length === 1) {
    hospitalId = hospitals[0].id;
    hospitalName = hospitals[0].name;
    hospitalConfidence = 0.8;
  } else if (!hospitalId && hospitals.length > 0 && STRICT_SINGLE_HOSPITAL_MODE) {
    hospitalId = hospitals[0].id;
    hospitalName = hospitals[0].name;
    hospitalConfidence = 0.7;
  }

  let partyId: string | null = null;
  let partyName: string | null = null;

  if (partyInput) {
    const normalizedInput = normalizeText(partyInput);
    const exact = parties.find((party) => normalizeText(party.name) === normalizedInput);

    if (exact) {
      partyId = exact.id;
      partyName = exact.name;
    }
  }

  if (!partyId && parties.length > 0) {
    partyId = parties[0].id;
    partyName = parties[0].name;
  }

  return {
    hospitalId,
    hospitalName,
    hospitalConfidence,
    hospitalInput,
    partyId,
    partyName,
    partyInput,
  };
}

function pickBestCandidateByDescription(
  candidates: RateCandidate[],
  description: string,
): {
  selected: RateCandidate | null;
  ambiguous: boolean;
  scoredCandidates: Array<{ candidate: RateCandidate; score: number }>;
} {
  if (!candidates.length) {
    return { selected: null, ambiguous: false, scoredCandidates: [] };
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: combinedSimilarity(description, candidate.serviceDescription),
    }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { selected: null, ambiguous: false, scoredCandidates: [] };
  }

  const top = scored[0];
  const second = scored[1];

  if (top.score < FUZZY_MATCH_THRESHOLD) {
    return { selected: null, ambiguous: false, scoredCandidates: scored.slice(0, 3) };
  }

  if (second && top.score - second.score < 0.06) {
    return { selected: null, ambiguous: true, scoredCandidates: scored.slice(0, 3) };
  }

  return { selected: top.candidate, ambiguous: false, scoredCandidates: scored.slice(0, 3) };
}

function buildReconciliation(
  printed: SummaryTotals,
  computed: SummaryTotals,
): ReconciliationResult {
  const keys: Array<keyof SummaryTotals> = [
    "consultations",
    "pharmacy",
    "laboratory",
    "radiology",
    "direct_services",
    "opd_services",
    "grand_total",
  ];

  const sections: ReconciliationEntry[] = [];
  let hasMajorMismatch = false;
  let hasMinorMismatch = false;

  for (const key of keys) {
    const printedValue = printed[key];
    const computedValue = computed[key];

    if (printedValue === null || computedValue === null) {
      sections.push({
        key,
        printed: printedValue,
        computed: computedValue,
        difference: null,
        status: "NOT_AVAILABLE",
      });
      continue;
    }

    const diff = Number((printedValue - computedValue).toFixed(2));
    const absDiff = Math.abs(diff);

    if (absDiff === 0) {
      sections.push({
        key,
        printed: printedValue,
        computed: computedValue,
        difference: diff,
        status: "MATCH",
      });
      continue;
    }

    if (absDiff <= RECONCILIATION_TOLERANCE_PKR) {
      hasMinorMismatch = true;
      sections.push({
        key,
        printed: printedValue,
        computed: computedValue,
        difference: diff,
        status: "MINOR_RECONCILIATION_DIFFERENCE",
      });
      continue;
    }

    hasMajorMismatch = true;
    sections.push({
      key,
      printed: printedValue,
      computed: computedValue,
      difference: diff,
      status: "TOTAL_MISMATCH",
    });
  }

  return {
    mismatch_tolerance_pkr: RECONCILIATION_TOLERANCE_PKR,
    sections,
    has_major_mismatch: hasMajorMismatch,
    has_minor_mismatch: hasMinorMismatch,
  };
}

export async function validateBillAgainstRateList(
  input: ValidationInput,
): Promise<BillValidationResult> {
  const { orgId, metadata, lineItems, summaryTotalsPrinted, summaryTotalsComputed } = input;

  const context = await resolveHospitalAndParty(orgId, metadata);
  const billDate = parseBillDate(
    typeof metadata.encounter_datetime === "string"
      ? metadata.encounter_datetime
      : null,
  );

  let allRateCards: RateCandidate[] = [];

  if (context.hospitalId && context.partyId) {
    const cards = await prisma.rateCard.findMany({
      where: {
        hospitalId: context.hospitalId,
        partyId: context.partyId,
      },
      select: {
        effectiveStartDate: true,
        effectiveEndDate: true,
        rate: true,
        revisedRate: true,
        service: {
          select: {
            id: true,
            code: true,
            description: true,
          },
        },
      },
    });

    allRateCards = cards.map((card) => ({
      serviceId: card.service.id,
      serviceCode: card.service.code,
      serviceDescription: card.service.description,
      rate: toNumber(card.rate),
      revisedRate: card.revisedRate ? toNumber(card.revisedRate) : null,
      effectiveStartDate: card.effectiveStartDate,
      effectiveEndDate: card.effectiveEndDate,
    }));
  }

  const activeRateCards = billDate
    ? allRateCards.filter((card) => isRateActive(card, billDate))
    : allRateCards;

  const lineResults: BillValidationLineResult[] = [];

  for (const line of lineItems) {
    const qty = line.qty && line.qty > 0 ? line.qty : 1;
    const billedAmount = line.line_amount;
    const lowConfidence =
      (line.confidence !== null && line.confidence < LOW_CONFIDENCE_THRESHOLD) ||
      billedAmount === null ||
      !line.service_description;

    const normalizedCode = normalizeCode(line.service_code_raw);
    const normalizedDescription = normalizeText(line.service_description);

    let matched: RateCandidate | null = null;
    let status: BillValidationStatus = "NOT_IN_RATE_LIST";
    let reason = "No matching rate list entry found.";
    let candidates: Array<{ service_code: string; service_description: string; score: number }> = [];

    if (!context.hospitalId || !context.partyId || allRateCards.length === 0) {
      status = "NOT_IN_RATE_LIST";
      reason = "No rate cards available for selected hospital/party context.";
    } else {
      let codeAll = normalizedCode
        ? allRateCards.filter((rate) => normalizeCode(rate.serviceCode) === normalizedCode)
        : [];
      let codeActive = normalizedCode
        ? activeRateCards.filter((rate) => normalizeCode(rate.serviceCode) === normalizedCode)
        : [];

      if (codeActive.length === 1) {
        matched = codeActive[0];
        reason = "Matched by service code.";
      } else if (codeActive.length > 1) {
        const picked = pickBestCandidateByDescription(codeActive, line.service_description);
        candidates = picked.scoredCandidates.map((entry) => ({
          service_code: entry.candidate.serviceCode,
          service_description: entry.candidate.serviceDescription,
          score: entry.score,
        }));

        if (picked.selected) {
          matched = picked.selected;
          reason = "Matched by service code and description ranking.";
        } else if (picked.ambiguous) {
          status = "AMBIGUOUS_MATCH";
          reason = "Multiple active rate entries match this line with similar confidence.";
        }
      } else if (codeAll.length > 0) {
        status = "DATE_OUT_OF_RANGE";
        reason = "Service code exists in rate list but no active rate for bill date.";
      }

      if (!matched && status !== "AMBIGUOUS_MATCH" && status !== "DATE_OUT_OF_RANGE") {
        const exactDescriptionMatches = activeRateCards.filter(
          (rate) => normalizeText(rate.serviceDescription) === normalizedDescription,
        );

        if (exactDescriptionMatches.length === 1) {
          matched = exactDescriptionMatches[0];
          reason = "Matched by exact normalized description.";
        } else if (exactDescriptionMatches.length > 1) {
          status = "AMBIGUOUS_MATCH";
          reason = "Multiple active entries have identical normalized description.";
          candidates = exactDescriptionMatches.slice(0, 3).map((rate) => ({
            service_code: rate.serviceCode,
            service_description: rate.serviceDescription,
            score: 1,
          }));
        }
      }

      if (!matched && status === "NOT_IN_RATE_LIST" && normalizedDescription) {
        const picked = pickBestCandidateByDescription(
          activeRateCards,
          line.service_description,
        );

        candidates = picked.scoredCandidates.map((entry) => ({
          service_code: entry.candidate.serviceCode,
          service_description: entry.candidate.serviceDescription,
          score: entry.score,
        }));

        if (picked.selected) {
          matched = picked.selected;
          reason = "Matched by fuzzy description similarity.";
        } else if (picked.ambiguous) {
          status = "AMBIGUOUS_MATCH";
          reason = "Multiple fuzzy description candidates are too close.";
        } else {
          const allDescriptionPick = pickBestCandidateByDescription(
            allRateCards,
            line.service_description,
          );

          if (allDescriptionPick.selected) {
            status = "DATE_OUT_OF_RANGE";
            reason = "Description exists in rate list but no active rate for bill date.";
            candidates = allDescriptionPick.scoredCandidates.map((entry) => ({
              service_code: entry.candidate.serviceCode,
              service_description: entry.candidate.serviceDescription,
              score: entry.score,
            }));
          }
        }
      }
    }

    let expectedUnitRate: number | null = null;
    let expectedLineAmount: number | null = null;
    let amountDifference: number | null = null;
    let percentageDeviation: number | null = null;

    if (matched) {
      expectedUnitRate = matched.revisedRate ?? matched.rate;
      expectedLineAmount = Number((expectedUnitRate * qty).toFixed(2));

      if (billedAmount !== null && expectedLineAmount > 0) {
        amountDifference = Number((billedAmount - expectedLineAmount).toFixed(2));
        percentageDeviation = Number(
          (((billedAmount - expectedLineAmount) / expectedLineAmount) * 100).toFixed(2),
        );

        if (Math.abs(percentageDeviation) <= DEFAULT_TOLERANCE_PERCENT) {
          status = "MATCH";
        } else {
          status = percentageDeviation > 0 ? "OVERCHARGED" : "UNDERCHARGED";
        }
      } else {
        status = "LOW_CONFIDENCE";
        reason = "Line amount is missing or invalid; manual review required.";
      }
    }

    if (lowConfidence && (status === "MATCH" || status === "NOT_IN_RATE_LIST")) {
      status = "LOW_CONFIDENCE";
      reason = "OCR confidence is below threshold or key fields are missing.";
    }

    lineResults.push({
      page_no: line.page_no,
      section: line.section,
      line_no: line.line_no,
      reference_no: line.reference_no,
      service_description: line.service_description,
      service_code_raw: line.service_code_raw,
      qty,
      billed_amount: billedAmount,
      matched_service_code: matched?.serviceCode ?? null,
      matched_service_description: matched?.serviceDescription ?? null,
      expected_unit_rate: expectedUnitRate,
      expected_line_amount: expectedLineAmount,
      amount_difference: amountDifference,
      percentage_deviation: percentageDeviation,
      status,
      reason,
      confidence: line.confidence,
      candidates,
    });
  }

  const summary = {
    total_lines: lineResults.length,
    match: lineResults.filter((line) => line.status === "MATCH").length,
    overcharged: lineResults.filter((line) => line.status === "OVERCHARGED").length,
    undercharged: lineResults.filter((line) => line.status === "UNDERCHARGED").length,
    not_in_rate_list: lineResults.filter((line) => line.status === "NOT_IN_RATE_LIST").length,
    ambiguous_match: lineResults.filter((line) => line.status === "AMBIGUOUS_MATCH").length,
    date_out_of_range: lineResults.filter((line) => line.status === "DATE_OUT_OF_RANGE").length,
    low_confidence: lineResults.filter((line) => line.status === "LOW_CONFIDENCE").length,
  };

  const reconciliation = buildReconciliation(summaryTotalsPrinted, summaryTotalsComputed);

  return {
    context: {
      org_id: orgId,
      hospital_name_input: context.hospitalInput,
      matched_hospital_id: context.hospitalId,
      matched_hospital_name: context.hospitalName,
      hospital_match_confidence: Number(context.hospitalConfidence.toFixed(4)),
      party_name_input: context.partyInput,
      matched_party_id: context.partyId,
      matched_party_name: context.partyName,
      strict_single_hospital_mode: STRICT_SINGLE_HOSPITAL_MODE,
      bill_date: billDate ? billDate.toISOString() : null,
      tolerance_percent: DEFAULT_TOLERANCE_PERCENT,
      low_confidence_threshold: LOW_CONFIDENCE_THRESHOLD,
    },
    summary,
    line_results: lineResults,
    reconciliation,
  };
}
