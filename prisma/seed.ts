import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (existing) {
    console.log("Super Admin already exists:", existing.email);
    return;
  }

  const superAdmin = await prisma.user.create({
    data: {
      email: "superadmin@gmail.com",
      passwordHash: hashSync("superadmin123", 12),
      name: "Super Admin",
      role: "SUPER_ADMIN",
      orgId: null,
      isActive: true,
    },
  });

  console.log("Super Admin created:", superAdmin.email);
  console.log("⚠️  Change the default password immediately after first login!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
