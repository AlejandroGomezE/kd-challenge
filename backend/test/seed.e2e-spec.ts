import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Response } from 'supertest';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { SESSION_COOKIE } from './../src/auth/session.constants.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { runSeed, type SeedSummary } from './../src/database/seed/run-seed.js';
import {
  SEED_PASSWORD,
  buildSeedData,
} from './../src/database/seed/seed-data.js';

// E2e coverage of the seed: runSeed writes the demo accounts, and they can
// then sign in.
//
// runSeed wipes every user and session. The other e2e files run in parallel against the shared
// backend/prisma/e2e.db (test/global-setup.ts), so seeding THAT file would
// delete their rows mid-test. This file therefore uses its own SQLite file,
// backend/prisma/e2e-seed.db (git-ignored by `/prisma/*.db*`): built fresh in
// beforeAll the same way global-setup builds e2e.db, pointed at via
// DATABASE_URL for this worker only (before PrismaService is constructed),
// and deleted in afterAll.

const BACKEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SEED_DATABASE_URL = 'file:./e2e-seed.db';
const SEED_DB_FILE = path.join(BACKEND_DIR, 'prisma', 'e2e-seed.db');

const FRONTEND_ORIGIN = 'http://localhost:5173';
const DEMO_EMAIL = 'demo@example.com';

function removeDatabaseFiles(): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(`${SEED_DB_FILE}${suffix}`, { force: true });
  }
}

function pushSchema(): void {
  execFileSync(
    process.execPath,
    [
      path.join(BACKEND_DIR, 'node_modules', 'prisma', 'build', 'index.js'),
      'db',
      'push',
    ],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: SEED_DATABASE_URL },
      stdio: 'pipe',
    },
  );
}

describe('Seed (e2e)', () => {
  const data = buildSeedData();
  const expectedCounts = { users: data.users.length };

  let app: INestApplication;
  let prisma: PrismaService;
  let firstSummary: SeedSummary;

  beforeAll(async () => {
    removeDatabaseFiles();
    pushSchema();
    vi.stubEnv('DATABASE_URL', SEED_DATABASE_URL);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    firstSummary = await runSeed(prisma);
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      vi.unstubAllEnvs();
      removeDatabaseFiles();
    }
  });

  async function tableCounts(): Promise<typeof expectedCounts> {
    return { users: await prisma.user.count() };
  }

  async function signInAsDemo(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ email: DEMO_EMAIL, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return sessionToken(res);
  }

  // POST /auth/sign-in is rate limited (5 per minute per app), so the read
  // test shares one session; only the reseed test (which wipes sessions)
  // signs in again.
  let demoToken: string | undefined;
  async function demoSession(): Promise<string> {
    demoToken ??= await signInAsDemo();
    return demoToken;
  }

  function sessionToken(res: Response): string {
    const header: string[] | string | undefined = res.headers['set-cookie'];
    const cookies = Array.isArray(header) ? header : header ? [header] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) {
      throw new Error('No session cookie set');
    }
    return cookie.split(';')[0].slice(SESSION_COOKIE.length + 1);
  }

  function get(url: string, token: string): request.Test {
    return request(app.getHttpServer())
      .get(url)
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', `${SESSION_COOKIE}=${token}`);
  }

  // Guard: this file must never seed the shared e2e.db (or the dev DB).
  it('runs against its own e2e-seed.db', async () => {
    const [main] = await prisma.$queryRawUnsafe<{ file: string }[]>(
      'PRAGMA database_list',
    );
    expect(path.basename(main.file)).toBe('e2e-seed.db');
  });

  it('writes the whole data set and reports matching counts', async () => {
    expect(firstSummary).toEqual({ skipped: false, ...expectedCounts });
    expect(expectedCounts.users).toBeGreaterThan(0);
    expect(await tableCounts()).toEqual(expectedCounts);
    expect(await prisma.session.count()).toBe(0);
  });

  it('lets demo sign in and read their account', async () => {
    const token = await demoSession();

    const res = await get('/auth/me', token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: DEMO_EMAIL, username: 'demo' });
  });

  it('re-running resets to the same data set, dropping extra rows and sessions', async () => {
    await demoSession();
    expect(await prisma.session.count()).toBeGreaterThan(0);
    await prisma.user.create({
      data: {
        email: 'extra@example.test',
        username: 'extra_user',
        displayName: 'Extra',
        passwordHash: 'x',
      },
    });

    const summary = await runSeed(prisma);

    expect(summary).toEqual({ skipped: false, ...expectedCounts });
    expect(await tableCounts()).toEqual(expectedCounts);
    expect(await prisma.session.count()).toBe(0);
    expect(
      await prisma.user.findUnique({ where: { username: 'extra_user' } }),
    ).toBeNull();
    // The documented credentials still work after a reseed.
    await signInAsDemo();
  });

  it('with ifEmpty, skips a database that already has users', async () => {
    const before = await prisma.user.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const summary = await runSeed(prisma, { ifEmpty: true });

    expect(summary).toEqual({ skipped: true, users: 0 });
    // Same rows (ids are regenerated on every real seed, so this proves no reseed).
    expect(
      await prisma.user.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
    expect(await tableCounts()).toEqual(expectedCounts);
  });

  it('with ifEmpty, seeds an empty database', async () => {
    await prisma.$transaction([
      prisma.session.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    const summary = await runSeed(prisma, { ifEmpty: true });

    expect(summary).toEqual({ skipped: false, ...expectedCounts });
    expect(await tableCounts()).toEqual(expectedCounts);
  });
});
