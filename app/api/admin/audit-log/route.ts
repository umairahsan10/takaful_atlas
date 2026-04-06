import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId || session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const take = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  const where: Record<string, unknown> = { orgId: session.user.orgId };
  if (action) {
    where.actionType = action;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      actor: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json(logs);
}
