import { prisma } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";

type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "FORCE_LOGOUT"
  | "UPLOAD_CLAIM"
  | "CREATE_USER"
  | "DEACTIVATE_USER"
  | "CREATE_ORG"
  | "SET_QUOTA"
  | "IMPORT_RATES"
  | "EXPORT_CLAIM"
  | "QUOTA_EXCEEDED";

type AuditLogParams = {
  orgId?: string | null;
  actorUserId: string;
  actionType: AuditAction;
  targetEntity?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: params.orgId ?? null,
        actorUserId: params.actorUserId,
        actionType: params.actionType,
        targetEntity: params.targetEntity ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (error) {
    // Audit logging should never crash the main flow
    console.error("[audit] Failed to write audit log:", error);
  }
}
