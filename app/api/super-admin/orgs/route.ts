import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgs = await prisma.organization.findMany({
    include: {
      quota: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Attach admin email for each org
  const orgsWithAdmin = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orgs.map(async (org: any) => {
      const admin = await prisma.user.findFirst({
        where: { orgId: org.id, role: "ADMIN" },
        select: { email: true, name: true },
      });
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        isActive: org.isActive,
        createdAt: org.createdAt,
        adminEmail: admin?.email ?? null,
        adminName: admin?.name ?? null,
        userCount: org._count.users,
        quota: org.quota
          ? {
              maxUsers: org.quota.maxUsers,
              maxExtractionsPerMonth: org.quota.maxExtractionsPerMonth,
              bonusExtractions: org.quota.bonusExtractions,
              enforcementMode: org.quota.enforcementMode,
              currentMonthExtractions: org.quota.currentMonthExtractions,
            }
          : null,
      };
    })
  );

  return NextResponse.json(orgsWithAdmin);
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    orgName,
    orgSlug,
    adminEmail,
    adminPassword,
    adminName,
    maxUsers = 5,
    maxExtractionsPerMonth = 100,
    enforcementMode = "HARD_BLOCK",
  } = body;

  if (!orgName || !orgSlug || !adminEmail || !adminPassword || !adminName) {
    return NextResponse.json(
      { error: "Missing required fields: orgName, orgSlug, adminEmail, adminPassword, adminName" },
      { status: 400 }
    );
  }

  // Check slug uniqueness
  const existingOrg = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (existingOrg) {
    return NextResponse.json(
      { error: "Organization slug already exists" },
      { status: 409 }
    );
  }

  // Check email uniqueness
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: "Email already in use" },
      { status: 409 }
    );
  }

  const { hashSync } = await import("bcryptjs");

  // Create org + quota + admin in a transaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await prisma.$transaction(async (tx: any) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
      },
    });

    await tx.orgQuota.create({
      data: {
        orgId: org.id,
        maxUsers,
        maxExtractionsPerMonth,
        enforcementMode,
      },
    });

    const admin = await tx.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashSync(adminPassword, 12),
        name: adminName,
        role: "ADMIN",
        orgId: org.id,
      },
    });

    return { orgId: org.id, adminId: admin.id };
  });

  // Audit log
  const { writeAuditLog } = await import("@/lib/audit");
  await writeAuditLog({
    actorUserId: session.user.id,
    actionType: "CREATE_ORG",
    targetEntity: result.orgId,
    metadata: { orgName, orgSlug, adminEmail },
  });

  return NextResponse.json(result, { status: 201 });
}
