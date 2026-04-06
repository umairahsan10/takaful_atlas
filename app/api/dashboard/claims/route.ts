import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, parseInt(searchParams.get("limit") || "20"));

  const where: Record<string, unknown> = {
    userId: session.user.id,
    orgId: session.user.orgId,
  };
  if (status) where.status = status;

  const [claims, total] = await Promise.all([
    prisma.claimExtraction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        requestId: true,
        fileNameHash: true,
        status: true,
        modelId: true,
        createdAt: true,
        crossCheckResult: true,
      },
    }),
    prisma.claimExtraction.count({ where }),
  ]);

  return NextResponse.json({
    claims,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
