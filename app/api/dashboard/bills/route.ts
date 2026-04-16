import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const PAGE_SIZE = 20;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = session.user.id;
  const orgId = session.user.orgId;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const statusFilter = searchParams.get("status") || undefined;

  const where = {
    userId,
    orgId,
    pipeline: "BILLS" as const,
    ...(statusFilter ? { status: statusFilter as "SUCCESS" | "FAILED" } : {}),
  };

  const [total, bills] = await Promise.all([
    prisma.ocrUsageLog.count({ where }),
    prisma.ocrUsageLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        requestId: true,
        status: true,
        totalCostUsd: true,
        totalTokens: true,
        processingTimeMs: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    bills: bills.map((b) => ({
      id: b.id,
      requestId: b.requestId,
      status: b.status,
      totalCostUsd: Number(b.totalCostUsd),
      totalTokens: b.totalTokens,
      processingTimeMs: b.processingTimeMs,
      createdAt: b.createdAt,
    })),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
  });
}
