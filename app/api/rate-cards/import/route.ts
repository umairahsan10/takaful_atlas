import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { parseRateCardFile } from "@/lib/rate-card-parser";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId || !session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  const userId = session.user.id;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowedTypes = [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];
  const ext = file.name.toLowerCase().split(".").pop();
  if (!allowedTypes.includes(file.type) && !["csv", "xlsx", "xls"].includes(ext || "")) {
    return NextResponse.json(
      { error: "Only CSV and Excel files are supported" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, errors } = parseRateCardFile(buffer, file.name);

  if (!rows.length && errors.length) {
    return NextResponse.json(
      { error: "Parse failed", details: errors },
      { status: 400 }
    );
  }

  let inserted = 0;
  let updated = 0;
  const importErrors: { row: number; message: string }[] = [...errors];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // Find-or-create Hospital
      const hospital = await prisma.hospital.upsert({
        where: {
          orgId_name: { orgId, name: row.hospitalName },
        },
        update: {},
        create: { orgId, name: row.hospitalName, isActive: true },
      });

      // Find-or-create Party
      const party = await prisma.party.upsert({
        where: {
          orgId_name: { orgId, name: row.partyName },
        },
        update: {},
        create: { orgId, name: row.partyName },
      });

      // Find-or-create Category
      const category = await prisma.category.upsert({
        where: {
          orgId_name: { orgId, name: row.categoryName },
        },
        update: {},
        create: { orgId, name: row.categoryName },
      });

      // Find-or-create Service
      const service = await prisma.service.upsert({
        where: {
          code_categoryId: { code: row.serviceCode, categoryId: category.id },
        },
        update: { description: row.serviceDescription },
        create: {
          code: row.serviceCode,
          description: row.serviceDescription,
          categoryId: category.id,
        },
      });

      // Upsert RateCard
      const existing = await prisma.rateCard.findFirst({
        where: {
          hospitalId: hospital.id,
          partyId: party.id,
          serviceId: service.id,
          effectiveStartDate: new Date(row.effectiveStartDate),
        },
      });

      if (existing) {
        await prisma.rateCard.update({
          where: { id: existing.id },
          data: {
            rate: row.rate,
            revisedRate: row.revisedRate,
            effectiveEndDate: row.effectiveEndDate
              ? new Date(row.effectiveEndDate)
              : null,
          },
        });
        updated++;
      } else {
        await prisma.rateCard.create({
          data: {
            hospitalId: hospital.id,
            partyId: party.id,
            serviceId: service.id,
            rate: row.rate,
            revisedRate: row.revisedRate,
            effectiveStartDate: new Date(row.effectiveStartDate),
            effectiveEndDate: row.effectiveEndDate
              ? new Date(row.effectiveEndDate)
              : null,
            createdById: userId,
          },
        });
        inserted++;
      }
    } catch (err) {
      importErrors.push({
        row: i + 2,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  writeAuditLog({
    orgId,
    actorUserId: userId,
    actionType: "IMPORT_RATES",
    targetEntity: file.name,
    metadata: {
      totalRows: rows.length,
      inserted,
      updated,
      errors: importErrors.length,
    },
  });

  return NextResponse.json({
    success: true,
    summary: {
      totalParsed: rows.length,
      inserted,
      updated,
      failed: importErrors.length,
    },
    errors: importErrors.slice(0, 50), // limit error details
  });
}
