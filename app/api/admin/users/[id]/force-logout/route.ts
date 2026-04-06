import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { id } = await params;

  // Verify user belongs to same org
  const user = await prisma.user.findFirst({
    where: { id, orgId },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: { currentSessionToken: null },
  });

  await writeAuditLog({
    orgId,
    actorUserId: session.user.id,
    actionType: "FORCE_LOGOUT",
    targetEntity: id,
  });

  return NextResponse.json({ success: true });
}
