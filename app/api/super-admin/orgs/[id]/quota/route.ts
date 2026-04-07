import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const quota = await prisma.orgQuota.findUnique({
    where: { orgId: id },
  });

  if (!quota) {
    return NextResponse.json({ error: "Quota not found" }, { status: 404 });
  }

  return NextResponse.json(quota);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "maxUsers",
    "maxExtractionsPerMonth",
    "bonusExtractions",
    "enforcementMode",
    "quotaResetDay",
  ];

  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const quota = await prisma.orgQuota.update({
    where: { orgId: id },
    data: updateData,
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actionType: "SET_QUOTA",
    targetEntity: id,
    metadata: updateData,
  });

  return NextResponse.json(quota);
}
