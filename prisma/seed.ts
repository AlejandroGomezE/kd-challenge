import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { SEED_TENANTS, SEED_USERS } from "./seed-data";

// Idempotent: upserts by slug / email / (tenant, name). Re-running resets the seed users' passwords.
async function main() {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("SEED_USER_PASSWORD must be set (min 8 chars). It is never committed.");
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const passwordHash = await hashPassword(password);

    const tenantIds = new Map<string, string>();
    for (const t of SEED_TENANTS) {
      const tenant = await db.tenant.upsert({
        where: { slug: t.slug },
        update: { name: t.name },
        create: { slug: t.slug, name: t.name },
      });
      tenantIds.set(t.slug, tenant.id);
      const existing = await db.project.findFirst({
        where: { tenantId: tenant.id, name: { equals: t.project, mode: "insensitive" } },
      });
      if (!existing) await db.project.create({ data: { tenantId: tenant.id, name: t.project } });
    }

    for (const u of SEED_USERS) {
      const user = await db.user.upsert({
        where: { email: u.email },
        update: { name: u.name },
        create: { id: u.id, email: u.email, name: u.name, emailVerified: true },
      });
      // Better Auth's email+password credential row (same shape sign-up would write).
      const account = await db.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
      if (account) {
        await db.account.update({ where: { id: account.id }, data: { password: passwordHash } });
      } else {
        await db.account.create({
          data: { id: `${user.id}_credential`, accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash },
        });
      }
      for (const m of u.memberships) {
        const tenantId = tenantIds.get(m.tenant)!;
        await db.membership.upsert({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          update: { role: m.role },
          create: { tenantId, userId: user.id, role: m.role },
        });
      }
    }
    console.log(`Seeded ${SEED_TENANTS.length} tenants, ${SEED_USERS.length} users.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
