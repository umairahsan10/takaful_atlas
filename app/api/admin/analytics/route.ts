import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "month";

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "day":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Per-user usage in this org
  const users = await prisma.user.findMany({
    where: { orgId },
    select: { id: true, name: true, email: true },
  });

  const userStats = await Promise.all(
    users.map(async (user: { id: string; name: string; email: string }) => {
      const usage = await prisma.ocrUsageLog.aggregate({
        where: {
          orgId,
          userId: user.id,
          createdAt: { gte: startDate },
        },
        _sum: { totalCostUsd: true, totalTokens: true },
        _count: true,
      });

      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        totalCost: usage._sum.totalCostUsd?.toNumber() ?? 0,
        totalTokens: usage._sum.totalTokens ?? 0,
        extractionCount: usage._count,
      };
    })
  );

  // Org totals
  const orgUsage = await prisma.ocrUsageLog.aggregate({
    where: { orgId, createdAt: { gte: startDate } },
    _sum: { totalCostUsd: true, totalTokens: true },
    _count: true,
    _avg: { processingTimeMs: true },
  });

  const claimStats = await prisma.claimExtraction.groupBy({
    by: ["status"],
    where: { orgId, createdAt: { gte: startDate } },
    _count: true,
  });

  // Quota
  const quota = await prisma.orgQuota.findUnique({ where: { orgId } });

  return NextResponse.json({
    period,
    org: {
      totalCost: orgUsage._sum.totalCostUsd?.toNumber() ?? 0,
      totalTokens: orgUsage._sum.totalTokens ?? 0,
      totalExtractions: orgUsage._count,
      avgProcessingTimeMs: orgUsage._avg.processingTimeMs ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      claimsByStatus: claimStats.map((s: any) => ({
        status: s.status,
        count: s._count,
      })),
    },
    maxUsers: quota?.maxUsers ?? 0,
    maxExtractions: quota?.maxExtractionsPerMonth ?? 0,
    bonusExtractions: quota?.bonusExtractions ?? 0,
    enforcement: quota?.enforcementMode ?? "HARD_BLOCK",
    extractionsThisMonth: quota?.currentMonthExtractions ?? 0,
    quotaResetDay: quota?.quotaResetDay ?? 1,
    lastResetAt: quota?.lastResetAt ?? null,
    users: userStats,
  });
}
