import * as argon2 from 'argon2';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ARGON2_OPTIONS } from '../../modules/users/users.service.js';
import { SEED_PASSWORD, buildSeedData, validateSeedData } from './seed-data.js';

export interface RunSeedOptions {
  // Leave the database untouched if it already has any user.
  ifEmpty?: boolean;
}

// Rows written by one run (zero when skipped).
export interface SeedSummary {
  skipped: boolean;
  users: number;
}

// Resets the seedable tables to the seed data set: in one transaction, wipes
// every session and user, then inserts the seed users. With `ifEmpty`,
// returns early (skipped) when any user exists, so an already-used database
// is never wiped.
export async function runSeed(
  prisma: PrismaClient,
  options: RunSeedOptions = {},
): Promise<SeedSummary> {
  const data = buildSeedData();
  validateSeedData(data);

  if (options.ifEmpty && (await prisma.user.count()) > 0) {
    return { skipped: true, users: 0 };
  }

  // Every seed user shares one password, hashed once, the same way sign-up
  // hashes it. Done before the transaction so it isn't held open meanwhile.
  const passwordHash = await argon2.hash(SEED_PASSWORD, ARGON2_OPTIONS);

  return prisma.$transaction(async (tx) => {
    // Children before parents, so no foreign key is ever left dangling.
    await tx.session.deleteMany();
    await tx.user.deleteMany();

    const users = await tx.user.createMany({
      data: data.users.map((user) => ({
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        passwordHash,
      })),
    });

    return { skipped: false, users: users.count };
  });
}
