// Creates the super-admin account, or resets its password if it already exists.
// Usage: SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run admin:create
import { emailSchema, newPasswordSchema } from "@siparis/shared";
import { z } from "zod";
import { createPrismaClient } from "../src/db";
import { Role } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    SUPERADMIN_EMAIL: emailSchema,
    SUPERADMIN_PASSWORD: newPasswordSchema,
  })
  .parse(process.env);

const prisma = createPrismaClient(env.DATABASE_URL);

try {
  const existing = await prisma.user.findUnique({ where: { email: env.SUPERADMIN_EMAIL } });
  if (existing && existing.role !== Role.SUPER_ADMIN) {
    throw new Error(`${env.SUPERADMIN_EMAIL} is a café login, not a super-admin.`);
  }

  const passwordHash = await hashPassword(env.SUPERADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { email: env.SUPERADMIN_EMAIL },
    update: { passwordHash, isActive: true },
    create: {
      email: env.SUPERADMIN_EMAIL,
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      passwordHash,
    },
  });
  if (existing) await prisma.session.deleteMany({ where: { userId: existing.id } });

  console.log(`Super-admin ${existing ? "password reset" : "created"}: ${env.SUPERADMIN_EMAIL}`);
} finally {
  await prisma.$disconnect();
}
