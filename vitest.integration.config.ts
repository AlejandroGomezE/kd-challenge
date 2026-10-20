import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must point at a database whose name ends in _test");
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: testDatabaseUrl, DATABASE_URL_UNPOOLED: testDatabaseUrl, BETTER_AUTH_URL: "http://localhost:3000" },
    testTimeout: 20_000,
  },
});
