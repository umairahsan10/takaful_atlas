import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  type BillLineInput,
  type BillValidationLineResult,
  type SummaryTotals,
  validateBillAgainstRateList,
} from "@/lib/bill-validator";

type RemapEntry = {
  line_no: number;
  service_code: string;
};

type RevalidatePayload = {
  metadata: Record<string, string | number | null>;
  summary_totals_printed: SummaryTotals;
  summary_totals_computed: SummaryTotals;
  line_items: BillLineInput[];
  existing_line_results?: BillValidationLineResult[];
  remaps: RemapEntry[];
};

function normalizeServiceCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9\-]/g, "").trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

    const body = (await request.json()) as RevalidatePayload;

    if (!isObject(body) || !Array.isArray(body.line_items) || !Array.isArray(body.remaps)) {
      return NextResponse.json(
        { error: "Invalid payload", request_id: requestId },
        { status: 400 },
      );
    }

    const remapByLineNo = new Map<number, string>();
    for (const remap of body.remaps) {
      const lineNo = Number(remap?.line_no);
      const code = normalizeServiceCode(String(remap?.service_code ?? ""));

      if (!Number.isFinite(lineNo) || lineNo <= 0 || !code) {
        continue;
      }

      remapByLineNo.set(lineNo, code);
    }

    if (!remapByLineNo.size) {
      return NextResponse.json(
        { error: "No valid remaps provided", request_id: requestId },
        { status: 400 },
      );
    }

    const targetLineItems = body.line_items
      .filter((line) => remapByLineNo.has(line.line_no))
      .map((line) => ({
        ...line,
        service_code_raw: remapByLineNo.get(line.line_no) ?? line.service_code_raw,
      }));

    if (!targetLineItems.length) {
      return NextResponse.json(
        { error: "No target lines found for revalidation", request_id: requestId },
        { status: 400 },
      );
    }

    const validation = await validateBillAgainstRateList({
      orgId: session.user.orgId,
      metadata: body.metadata ?? {},
      lineItems: targetLineItems,
      summaryTotalsPrinted: body.summary_totals_printed,
      summaryTotalsComputed: body.summary_totals_computed,
    });

    const previousResults = Array.isArray(body.existing_line_results)
      ? body.existing_line_results
      : [];

    const remapTrace = validation.line_results.map((nextLine) => {
      const previousLine = previousResults.find((line) => line.line_no === nextLine.line_no);
      const selectedCode = remapByLineNo.get(nextLine.line_no) ?? nextLine.service_code_raw;

      return {
        line_no: nextLine.line_no,
        page_no: nextLine.page_no,
        section: nextLine.section,
        service_description: nextLine.service_description,
        selected_service_code: selectedCode,
        previous_status: previousLine?.status ?? null,
        next_status: nextLine.status,
        previous_matched_service_code: previousLine?.matched_service_code ?? null,
        next_matched_service_code: nextLine.matched_service_code,
        changed:
          previousLine?.status !== nextLine.status ||
          previousLine?.matched_service_code !== nextLine.matched_service_code,
        reason: nextLine.reason,
        timestamp: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      request_id: requestId,
      updated_line_results: validation.line_results,
      remap_trace: remapTrace,
      updated_count: validation.line_results.length,
      persistence: {
        enabled: false,
        reason: "Phase D no-persistence mode",
      },
    });
  } catch (error) {
    console.error(`[extract/bills/revalidate][${requestId}] error`, error);

    return NextResponse.json(
      {
        error: "Failed to revalidate remapped lines",
        request_id: requestId,
      },
      { status: 500 },
    );
  }
}
