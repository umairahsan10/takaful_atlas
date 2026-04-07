import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  const { searchParams } = new URL(req.url);
  const hospitalId = searchParams.get("hospitalId");
  const partyId = searchParams.get("partyId");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));

  const where: Record<string, unknown> = {
    hospital: { orgId },
  };
  if (hospitalId) where.hospitalId = hospitalId;
  if (partyId) where.partyId = partyId;
  if (search) {
    where.OR = [
      { service: { description: { contains: search, mode: "insensitive" } } },
      { service: { code: { contains: search, mode: "insensitive" } } },
      { hospital: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [cards, total, hospitals, parties] = await Promise.all([
    prisma.rateCard.findMany({
      where,
      include: {
        hospital: { select: { name: true } },
        party: { select: { name: true } },
        service: { select: { code: true, description: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.rateCard.count({ where }),
    prisma.hospital.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.party.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cards: cards.map((c: any) => ({
      id: c.id,
      hospitalName: c.hospital.name,
      partyName: c.party.name,
      serviceCode: c.service.code,
      serviceDescription: c.service.description,
      rate: Number(c.rate),
      revisedRate: c.revisedRate ? Number(c.revisedRate) : null,
      effectiveStartDate: c.effectiveStartDate,
      effectiveEndDate: c.effectiveEndDate,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    filters: { hospitals, parties },
  });
}
