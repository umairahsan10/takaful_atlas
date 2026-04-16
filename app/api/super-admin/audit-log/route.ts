import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed;
}

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || "").trim().toLowerCase();
  const action = searchParams.get("action");
  const orgId = searchParams.get("orgId");
  const actorUserId = searchParams.get("actorUserId");
  const fromDate = parseDate(searchParams.get("from"));
  const toDate = parseDate(searchParams.get("to"), true);
  const take = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  const where: Record<string, unknown> = {};
  if (action) {
    where.actionType = action;
  }
  if (orgId) {
    where.orgId = orgId;
  }
  if (actorUserId) {
    where.actorUserId = actorUserId;
  }
  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const [rawLogs, organizations] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { name: true, email: true } },
        org: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const logs = query
    ? rawLogs.filter((log) => {
        const searchFields = [
          log.actionType,
          log.targetEntity || "",
          log.ipAddress || "",
          log.actor.name || "",
          log.actor.email || "",
          log.org?.name || "",
        ];

        return searchFields.some((value) => value.toLowerCase().includes(query));
      })
    : rawLogs;

  const actions = Array.from(new Set(rawLogs.map((log) => log.actionType))).sort();

  return NextResponse.json({
    logs,
    filters: {
      actions,
      orgs: organizations,
    },
  });
}
