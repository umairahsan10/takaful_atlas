import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "month"; // day, week, month

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

  // Per-org aggregations
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      quota: {
        select: {
          maxExtractionsPerMonth: true,
          bonusExtractions: true,
          currentMonthExtractions: true,
        },
      },
    },
  });

  const orgStats = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orgs.map(async (org: any) => {
      const [usageAgg, claimCount] = await Promise.all([
        prisma.ocrUsageLog.aggregate({
          where: { orgId: org.id, createdAt: { gte: startDate } },
          _sum: { totalCostUsd: true, totalTokens: true },
          _count: true,
        }),
        prisma.claimExtraction.count({
          where: { orgId: org.id, createdAt: { gte: startDate } },
        }),
      ]);

      return {
        orgId: org.id,
        orgName: org.name,
        totalCost: usageAgg._sum.totalCostUsd?.toNumber() ?? 0,
        totalTokens: usageAgg._sum.totalTokens ?? 0,
        extractionCount: usageAgg._count,
        claimCount,
        quotaUsed: org.quota?.currentMonthExtractions ?? 0,
        quotaLimit: org.quota
          ? org.quota.maxExtractionsPerMonth + org.quota.bonusExtractions
          : 0,
      };
    })
  );

  // Global totals
  const globalUsage = await prisma.ocrUsageLog.aggregate({
    where: { createdAt: { gte: startDate } },
    _sum: { totalCostUsd: true, totalTokens: true },
    _count: true,
  });

  const totalUsers = await prisma.user.count({
    where: { role: { not: "SUPER_ADMIN" } },
  });

  const totalOrgs = await prisma.organization.count();

  return NextResponse.json({
    period,
    global: {
      totalOrgs,
      totalUsers,
      totalCost: globalUsage._sum.totalCostUsd?.toNumber() ?? 0,
      totalTokens: globalUsage._sum.totalTokens ?? 0,
      totalExtractions: globalUsage._count,
    },
    orgs: orgStats,
  });
}
