import { execSync } from "node:child_process";
import { Client } from "pg";

// Fresh, seeded test database before every run. vitest.integration.config.ts already refuses any
// TEST_DATABASE_URL whose database name doesn't end in _test; checked again here before wiping.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL!;
  if (!new URL(url).pathname.endsWith("_test")) throw new Error("Refusing to wipe a non-_test database");
  const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };

  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `TRUNCATE "AuditEntry", "Project", "Membership", "Tenant", "session", "account", "verification", "user" CASCADE`,
    );
  } finally {
    await client.end();
  }
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
