import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    await prisma.user
      .update({
        where: { id: userId },
        data: { currentSessionToken: null },
      })
      .catch(() => {
        /* ignore */
      });
  }

  return NextResponse.json({ ok: true });
}
