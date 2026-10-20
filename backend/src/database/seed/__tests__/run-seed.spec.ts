import * as argon2 from 'argon2';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { ARGON2_OPTIONS } from '../../../modules/users/users.service.js';
import { runSeed } from '../run-seed.js';
import { SEED_PASSWORD, buildSeedData } from '../seed-data.js';

// argon2.hash is wrapped (still the real implementation) so the test can
// count calls and check the options, then verify the produced hash for real.
vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return { ...actual, hash: vi.fn(actual.hash) };
});

const MODELS = ['session', 'user'] as const;
type Model = (typeof MODELS)[number];

// Row payloads passed to createMany, keyed by model.
type Rows = Record<string, unknown>[];

interface FakePrisma {
  client: PrismaClient;
  // Every tx call in order, e.g. "session.deleteMany".
  calls: string[];
  created: Partial<Record<Model, Rows>>;
  userCount: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  outsideWrites: ReturnType<typeof vi.fn>;
}

// A hand-rolled Prisma double: top-level `user.count` + `$transaction(fn)`;
// the transaction client records every deleteMany/createMany in order and
// answers createMany with `{ count: rows.length }`, like Prisma does.
function fakePrisma(existingUsers: number): FakePrisma {
  const calls: string[] = [];
  const created: Partial<Record<Model, Rows>> = {};

  const tx = Object.fromEntries(
    MODELS.map((model) => [
      model,
      {
        deleteMany: vi.fn(async () => {
          calls.push(`${model}.deleteMany`);
          return { count: 0 };
        }),
        createMany: vi.fn(async ({ data }: { data: Rows }) => {
          calls.push(`${model}.createMany`);
          created[model] = data;
          return { count: data.length };
        }),
      },
    ]),
  );

  const userCount = vi.fn(async () => existingUsers);
  const transaction = vi.fn(
    async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  );
  // Any write on the top-level client (outside the transaction) is a bug.
  const outsideWrites = vi.fn();
  const topLevel = Object.fromEntries(
    MODELS.map((model) => [
      model,
      {
        deleteMany: outsideWrites,
        createMany: outsideWrites,
        ...(model === 'user' ? { count: userCount } : {}),
      },
    ]),
  );

  return {
    client: {
      ...topLevel,
      $transaction: transaction,
    } as unknown as PrismaClient,
    calls,
    created,
    userCount,
    transaction,
    outsideWrites,
  };
}

describe('runSeed', () => {
  const data = buildSeedData();
  const hash = vi.mocked(argon2.hash);

  beforeEach(() => {
    hash.mockClear();
  });

  describe('with ifEmpty', () => {
    it('returns a skipped summary and writes nothing when users exist', async () => {
      const prisma = fakePrisma(3);

      const summary = await runSeed(prisma.client, { ifEmpty: true });

      expect(summary).toEqual({ skipped: true, users: 0 });
      expect(prisma.userCount).toHaveBeenCalledTimes(1);
      expect(prisma.transaction).not.toHaveBeenCalled();
      expect(prisma.outsideWrites).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
    });

    it('seeds normally when the database has no users', async () => {
      const prisma = fakePrisma(0);

      const summary = await runSeed(prisma.client, { ifEmpty: true });

      expect(summary).toEqual({ skipped: false, users: data.users.length });
      expect(prisma.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('a full run', () => {
    let prisma: FakePrisma;
    let summary: Awaited<ReturnType<typeof runSeed>>;
    // Captured here: the outer beforeEach clears the mock before each test.
    let hashCalls: unknown[][];

    beforeAll(async () => {
      hash.mockClear();
      prisma = fakePrisma(7);
      summary = await runSeed(prisma.client);
      hashCalls = [...hash.mock.calls];
    });

    it('does not check for existing users without ifEmpty', () => {
      expect(prisma.userCount).not.toHaveBeenCalled();
    });

    it('runs everything in one transaction, never on the top-level client', () => {
      expect(prisma.transaction).toHaveBeenCalledTimes(1);
      expect(prisma.outsideWrites).not.toHaveBeenCalled();
    });

    it('wipes sessions before users, then inserts the users', () => {
      expect(prisma.calls).toEqual([
        'session.deleteMany',
        'user.deleteMany',
        'user.createMany',
      ]);
    });

    it('hashes the seed password once, with the sign-up options, and gives every user that hash', async () => {
      expect(hashCalls).toEqual([[SEED_PASSWORD, ARGON2_OPTIONS]]);

      const users = prisma.created.user!;
      const hashes = new Set(users.map((user) => user.passwordHash));
      expect(hashes.size).toBe(1);
      const [passwordHash] = hashes as Set<string>;
      expect(passwordHash).toMatch(/^\$argon2id\$/);
      await expect(argon2.verify(passwordHash, SEED_PASSWORD)).resolves.toBe(
        true,
      );
    });

    it('writes user rows from the seed data and reports their count', () => {
      const users = prisma.created.user!;
      expect(users).toHaveLength(data.users.length);
      for (const [index, seedUser] of data.users.entries()) {
        expect(users[index]).toEqual({
          email: seedUser.email,
          username: seedUser.username,
          displayName: seedUser.displayName,
          passwordHash: expect.any(String),
        });
      }
      expect(summary).toEqual({ skipped: false, users: users.length });
    });
  });

  it('propagates a failure inside the transaction', async () => {
    const prisma = fakePrisma(0);
    prisma.transaction.mockRejectedValueOnce(new Error('disk full'));

    await expect(runSeed(prisma.client)).rejects.toThrow('disk full');
  });
});
