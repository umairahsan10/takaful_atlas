import { prisma } from "@/lib/db";

export type QuotaCheckResult = {
  allowed: boolean;
  enforcement: "HARD_BLOCK" | "SOFT_WARN";
  used: number;
  limit: number;
  remaining: number;
  message?: string;
};

/**
 * Check whether the org has extraction quota remaining.
 * Also handles monthly reset if the reset day has passed.
 */
export async function checkExtractionQuota(
  orgId: string
): Promise<QuotaCheckResult> {
  const quota = await prisma.orgQuota.findUnique({ where: { orgId } });

  if (!quota) {
    return {
      allowed: false,
      enforcement: "HARD_BLOCK",
      used: 0,
      limit: 0,
      remaining: 0,
      message: "No quota configured for this organization.",
    };
  }

  // Check if monthly reset is due
  await maybeResetMonthly(orgId, quota.quotaResetDay, quota.lastResetAt);

  // Re-fetch after potential reset
  const current = await prisma.orgQuota.findUnique({ where: { orgId } });
  if (!current) {
    return {
      allowed: false,
      enforcement: "HARD_BLOCK",
      used: 0,
      limit: 0,
      remaining: 0,
      message: "Quota not found.",
    };
  }

  const totalLimit =
    current.maxExtractionsPerMonth + current.bonusExtractions;
  const used = current.currentMonthExtractions;
  const remaining = Math.max(0, totalLimit - used);
  const exceeded = used >= totalLimit;

  if (exceeded) {
    return {
      allowed: current.enforcementMode === "SOFT_WARN",
      enforcement: current.enforcementMode,
      used,
      limit: totalLimit,
      remaining: 0,
      message:
        current.enforcementMode === "HARD_BLOCK"
          ? "Extraction quota exceeded. Contact your administrator."
          : "Extraction quota exceeded. Processing allowed with warning.",
    };
  }

  return {
    allowed: true,
    enforcement: current.enforcementMode,
    used,
    limit: totalLimit,
    remaining,
  };
}

/**
 * Increment the org's monthly extraction counter by 1.
 */
export async function incrementExtractionCount(orgId: string): Promise<void> {
  await prisma.orgQuota.update({
    where: { orgId },
    data: { currentMonthExtractions: { increment: 1 } },
  });
}

/**
 * Check if the org can still create new users (against max_users quota).
 */
export async function checkUserQuota(
  orgId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const quota = await prisma.orgQuota.findUnique({ where: { orgId } });
  if (!quota) {
    return { allowed: false, used: 0, limit: 0 };
  }

  const userCount = await prisma.user.count({
    where: { orgId, role: "STAFF" },
  });

  return {
    allowed: userCount < quota.maxUsers,
    used: userCount,
    limit: quota.maxUsers,
  };
}

/**
 * Reset monthly extraction counter if the reset day has passed
 * since the last reset.
 */
async function maybeResetMonthly(
  orgId: string,
  resetDay: number,
  lastResetAt: Date
): Promise<void> {
  const now = new Date();
  const currentDay = now.getDate();
  const lastResetMonth =
    lastResetAt.getFullYear() * 12 + lastResetAt.getMonth();
  const currentMonth = now.getFullYear() * 12 + now.getMonth();

  // Reset if we're in a new month (or later) and past the reset day
  if (currentMonth > lastResetMonth && currentDay >= resetDay) {
    await prisma.orgQuota.update({
      where: { orgId },
      data: {
        currentMonthExtractions: 0,
        bonusExtractions: 0, // bonus is one-time, reset each cycle
        lastResetAt: now,
      },
    });
  }
}
