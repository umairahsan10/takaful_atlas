import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  type BillLineInput,
  type SummaryTotals,
  validateBillAgainstRateList,
} from "@/lib/bill-validator";

type ValidatePayload = {
  metadata: Record<string, string | number | null>;
  summary_totals_printed: SummaryTotals;
  summary_totals_computed: SummaryTotals;
  line_items: BillLineInput[];
};

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

    const body = (await request.json()) as ValidatePayload;

    if (!isObject(body) || !Array.isArray(body.line_items)) {
      return NextResponse.json(
        { error: "Invalid payload", request_id: requestId },
        { status: 400 },
      );
    }

    const validation = await validateBillAgainstRateList({
      orgId: session.user.orgId,
      metadata: body.metadata ?? {},
      lineItems: body.line_items,
      summaryTotalsPrinted: body.summary_totals_printed,
      summaryTotalsComputed: body.summary_totals_computed,
    });

    return NextResponse.json({
      request_id: requestId,
      validation_results: {
        summary: validation.summary,
        line_results: validation.line_results,
      },
      reconciliation: validation.reconciliation,
      persistence: {
        enabled: false,
        reason: "Phase 2 chunk-merge finalize validation no-persistence mode",
      },
    });
  } catch (error) {
    console.error(`[extract/bills/validate][${requestId}] error`, error);

    return NextResponse.json(
      {
        error: "Failed to validate merged bill lines",
        request_id: requestId,
      },
      { status: 500 },
    );
  }
}
