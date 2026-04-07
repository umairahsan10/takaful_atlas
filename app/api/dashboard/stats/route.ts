import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = session.user.id;
  const orgId = session.user.orgId;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalClaims,
    claimsToday,
    pendingReview,
    flagged,
    quota,
    recentClaims,
  ] = await Promise.all([
    prisma.claimExtraction.count({
      where: { userId, orgId },
    }),
    prisma.claimExtraction.count({
      where: { userId, orgId, createdAt: { gte: todayStart } },
    }),
    prisma.claimExtraction.count({
      where: { userId, orgId, status: "PENDING_REVIEW" },
    }),
    prisma.claimExtraction.count({
      where: { userId, orgId, status: "FLAGGED" },
    }),
    prisma.orgQuota.findUnique({ where: { orgId } }),
    prisma.claimExtraction.findMany({
      where: { userId, orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        requestId: true,
        fileNameHash: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    claimsToday,
    totalClaims,
    pendingReview,
    flagged,
    quotaUsed: quota?.currentMonthExtractions || 0,
    quotaLimit:
      (quota?.maxExtractionsPerMonth || 0) + (quota?.bonusExtractions || 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentClaims: recentClaims.map((c: any) => ({
      id: c.id,
      requestId: c.requestId,
      fileName: c.fileNameHash,
      status: c.status,
      createdAt: c.createdAt,
    })),
  });
}
