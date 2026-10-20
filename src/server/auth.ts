import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  // No invitations or sign-up in scope: accounts come from prisma/seed.ts only.
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [nextCookies()],
});
