import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { checkUserQuota } from "@/lib/quota";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const usersRaw = await prisma.user.findMany({
    where: { orgId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLogin: true,
      currentSessionToken: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Convert token to boolean — never expose the raw token to the client
  const users = usersRaw.map((u: typeof usersRaw[0]) => ({
    ...u,
    currentSessionToken: !!u.currentSessionToken,
  }));

  const quotaInfo = await checkUserQuota(orgId);

  return NextResponse.json({
    users,
    quota: quotaInfo,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const body = await req.json();
  const { email, password, name } = body;

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Missing required fields: email, password, name" },
      { status: 400 }
    );
  }

  // Check user quota
  const quotaCheck = await checkUserQuota(orgId);
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      {
        error: `User limit reached (${quotaCheck.used}/${quotaCheck.limit}). Contact your administrator.`,
      },
      { status: 429 }
    );
  }

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const { hashSync } = await import("bcryptjs");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashSync(password, 12),
      name,
      role: "STAFF",
      orgId,
    },
  });

  await writeAuditLog({
    orgId,
    actorUserId: session.user.id,
    actionType: "CREATE_USER",
    targetEntity: user.id,
    metadata: { email, name },
  });

  return NextResponse.json(
    { id: user.id, email: user.email, name: user.name },
    { status: 201 }
  );
}
