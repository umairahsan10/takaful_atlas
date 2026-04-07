import { prisma } from "@/lib/db";

export interface ClaimLineItem {
  service_description?: string;
  service_code?: string;
  amount?: number | string;
}

export interface ExtractedClaim {
  hospital_or_clinic_name?: string;
  total_claim_amount_pkr?: number | string;
  date_of_admission?: string;
  items?: ClaimLineItem[];
  // The OCR may return these at the top level
  [key: string]: unknown;
}

export interface CrossCheckLineResult {
  service: string;
  serviceCode: string | null;
  billedAmount: number;
  expectedRate: number | null;
  revisedRate: number | null;
  difference: number | null;
  percentageDeviation: number | null;
  status: "MATCH" | "OVERCHARGED" | "UNDERCHARGED" | "NOT_FOUND";
}

export interface CrossCheckResult {
  hospitalMatched: boolean;
  hospitalName: string | null;
  hospitalConfidence: number;
  matchedHospitalId: string | null;
  partyName: string | null;
  claimDate: string | null;
  totalBilled: number;
  totalExpected: number | null;
  lineResults: CrossCheckLineResult[];
  overallStatus:
    | "ALL_MATCH"
    | "DISCREPANCIES_FOUND"
    | "NO_RATES_FOUND"
    | "NO_HOSPITAL_MATCH";
  discrepancyCount: number;
  tolerancePercent: number;
}

const DEFAULT_TOLERANCE = 5; // 5% deviation considered acceptable

/**
 * Cross-check extracted claim data against org's rate cards.
 *
 * Steps:
 * 1. Fuzzy-match hospital name from OCR against Hospital table (org-scoped)
 * 2. For each line item, look up rate via composite index
 * 3. Compare billed vs expected, flag deviations beyond tolerance
 */
export async function crossCheckClaim(
  extractedData: ExtractedClaim,
  orgId: string,
  tolerancePercent: number = DEFAULT_TOLERANCE,
): Promise<CrossCheckResult> {
  const hospitalNameFromOcr =
    extractedData.hospital_or_clinic_name?.trim() || "";
  const claimDate =
    extractedData.date_of_admission || new Date().toISOString().split("T")[0];
  const totalBilled = Number(extractedData.total_claim_amount_pkr) || 0;

  // ── 1. Hospital matching ────────────────────────────────────────
  // Try exact (case-insensitive) first, then partial contains
  let matchedHospital: { id: string; name: string } | null = null;
  let confidence = 0;

  if (hospitalNameFromOcr) {
    // Exact match
    const exact = await prisma.hospital.findFirst({
      where: {
        orgId,
        name: { equals: hospitalNameFromOcr, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true, name: true },
    });

    if (exact) {
      matchedHospital = exact;
      confidence = 1.0;
    } else {
      // Partial contains — pick the best match
      const partials = await prisma.hospital.findMany({
        where: {
          orgId,
          isActive: true,
          name: {
            contains: hospitalNameFromOcr.split(" ")[0],
            mode: "insensitive",
          },
        },
        select: { id: true, name: true },
        take: 5,
      });

      if (partials.length === 1) {
        matchedHospital = partials[0];
        confidence = 0.7;
      } else if (partials.length > 1) {
        // Pick closest by substring overlap
        const scored = partials.map((h: { id: string; name: string }) => ({
          ...h,
          score: similarity(
            hospitalNameFromOcr.toLowerCase(),
            h.name.toLowerCase(),
          ),
        }));
        scored.sort(
          (a: { score: number }, b: { score: number }) => b.score - a.score,
        );
        if (scored[0].score > 0.3) {
          matchedHospital = scored[0];
          confidence = scored[0].score;
        }
      }
    }
  }

  if (!matchedHospital) {
    return {
      hospitalMatched: false,
      hospitalName: hospitalNameFromOcr || null,
      hospitalConfidence: 0,
      matchedHospitalId: null,
      partyName: null,
      claimDate,
      totalBilled,
      totalExpected: null,
      lineResults: [],
      overallStatus: "NO_HOSPITAL_MATCH",
      discrepancyCount: 0,
      tolerancePercent,
    };
  }

  // ── 2. Get first available party for this org (or all) ──────────
  const parties = await prisma.party.findMany({
    where: { orgId },
    select: { id: true, name: true },
    take: 1,
  });
  const partyId = parties[0]?.id;
  const partyName = parties[0]?.name || null;

  // ── 3. Line item matching ──────────────────────────────────────
  const items = extractedData.items || [];
  const lineResults: CrossCheckLineResult[] = [];
  let totalExpected = 0;
  let discrepancyCount = 0;

  for (const item of items) {
    const billedAmount = Number(item.amount) || 0;
    const serviceDesc = item.service_description || "";
    const serviceCode = item.service_code || "";

    // Try to find matching rate card
    let rateCard: {
      rate: { toNumber: () => number } | number;
      revisedRate: { toNumber: () => number } | number | null;
    } | null = null;

    if (serviceCode && partyId) {
      // Look up by service code
      const service = await prisma.service.findFirst({
        where: { code: serviceCode },
        select: { id: true },
      });

      if (service) {
        rateCard = await prisma.rateCard.findFirst({
          where: {
            hospitalId: matchedHospital.id,
            partyId,
            serviceId: service.id,
            effectiveStartDate: { lte: new Date(claimDate) },
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: new Date(claimDate) } },
            ],
          },
          orderBy: { effectiveStartDate: "desc" },
          select: { rate: true, revisedRate: true },
        });
      }
    }

    if (!rateCard && serviceDesc && partyId) {
      // Fallback: search by service description
      const service = await prisma.service.findFirst({
        where: {
          description: {
            contains: serviceDesc.split(" ")[0],
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (service) {
        rateCard = await prisma.rateCard.findFirst({
          where: {
            hospitalId: matchedHospital.id,
            partyId,
            serviceId: service.id,
            effectiveStartDate: { lte: new Date(claimDate) },
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: new Date(claimDate) } },
            ],
          },
          orderBy: { effectiveStartDate: "desc" },
          select: { rate: true, revisedRate: true },
        });
      }
    }

    if (!rateCard) {
      lineResults.push({
        service: serviceDesc || serviceCode || "Unknown",
        serviceCode: serviceCode || null,
        billedAmount,
        expectedRate: null,
        revisedRate: null,
        difference: null,
        percentageDeviation: null,
        status: "NOT_FOUND",
      });
      continue;
    }

    const expectedRate =
      typeof rateCard.rate === "number"
        ? rateCard.rate
        : (rateCard.rate as { toNumber: () => number }).toNumber();
    const revisedRate = rateCard.revisedRate
      ? typeof rateCard.revisedRate === "number"
        ? rateCard.revisedRate
        : (rateCard.revisedRate as { toNumber: () => number }).toNumber()
      : null;

    const compareRate = revisedRate ?? expectedRate;
    const difference = billedAmount - compareRate;
    const percentageDeviation =
      compareRate > 0 ? (difference / compareRate) * 100 : 0;

    let status: CrossCheckLineResult["status"] = "MATCH";
    if (Math.abs(percentageDeviation) > tolerancePercent) {
      status = difference > 0 ? "OVERCHARGED" : "UNDERCHARGED";
      discrepancyCount++;
    }

    totalExpected += compareRate;
    lineResults.push({
      service: serviceDesc || serviceCode || "Unknown",
      serviceCode: serviceCode || null,
      billedAmount,
      expectedRate,
      revisedRate,
      difference: Math.round(difference * 100) / 100,
      percentageDeviation: Math.round(percentageDeviation * 100) / 100,
      status,
    });
  }

  const hasRates = lineResults.some((r) => r.status !== "NOT_FOUND");
  let overallStatus: CrossCheckResult["overallStatus"];
  if (!hasRates) {
    overallStatus = "NO_RATES_FOUND";
  } else if (discrepancyCount === 0) {
    overallStatus = "ALL_MATCH";
  } else {
    overallStatus = "DISCREPANCIES_FOUND";
  }

  return {
    hospitalMatched: true,
    hospitalName: matchedHospital.name,
    hospitalConfidence: confidence,
    matchedHospitalId: matchedHospital.id,
    partyName,
    claimDate,
    totalBilled,
    totalExpected: hasRates ? totalExpected : null,
    lineResults,
    overallStatus,
    discrepancyCount,
    tolerancePercent,
  };
}

/**
 * Simple trigram-like similarity between two strings.
 * Returns [0, 1] where 1 is identical.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const trigramsA = new Set<string>();
  const trigramsB = new Set<string>();
  for (let i = 0; i <= a.length - 3; i++) trigramsA.add(a.substring(i, i + 3));
  for (let i = 0; i <= b.length - 3; i++) trigramsB.add(b.substring(i, i + 3));

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }
  return intersection / (trigramsA.size + trigramsB.size - intersection);
}
