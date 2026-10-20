import { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuthService } from './../src/auth/auth.service.js';
import { SESSION_COOKIE } from './../src/auth/session.constants.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { UsersService } from './../src/modules/users/users.service.js';

describe('App (e2e)', () => {
  let app: INestApplication;
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    try {
      // Tests may touch Prisma directly for setup/teardown; sessions cascade.
      if (createdUserIds.length > 0) {
        await app
          .get(PrismaService)
          .user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } finally {
      createdUserIds.length = 0;
      await app.close();
    }
  });

  // A valid, unique username: `e2e_` + 12 hex chars (16 chars, within 3-20).
  function uniqueUsername(): string {
    return `e2e_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  }

  // Guard: e2e must never touch the dev DB. vitest.config.e2e.ts points DATABASE_URL at a fresh
  // backend/prisma/e2e.db built by test/global-setup.ts.
  it('runs against the dedicated e2e database, not the dev DB', async () => {
    const [main] = await app
      .get(PrismaService)
      .$queryRawUnsafe<{ file: string }[]>('PRAGMA database_list');
    expect(path.basename(main.file)).toBe('e2e.db');
  });

  const DISPLAY_NAME = 'E2E User';

  // `displayName: null` simulates an account created before display names
  // existed (sign-up now always sets one).
  async function createUserWithSession(
    displayName: string | null = DISPLAY_NAME,
  ): Promise<{
    userId: string;
    username: string;
    token: string;
  }> {
    const user = await app
      .get(UsersService)
      .create(
        `e2e-${randomUUID()}@example.test`,
        uniqueUsername(),
        displayName ?? DISPLAY_NAME,
        'correct-horse-battery',
      );
    createdUserIds.push(user.id);
    if (displayName === null) {
      await app
        .get(PrismaService)
        .user.update({ where: { id: user.id }, data: { displayName: null } });
    }
    const { token } = await app.get(AuthService).createSession(user.id);
    return { userId: user.id, username: user.username, token };
  }

  // GET /auth/me is the probe for the global guard: it's gated like every
  // non-@Public() endpoint.
  it('a gated endpoint without a session returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me').expect(401);
    expect(res.body).toEqual({
      statusCode: 401,
      message: 'Authentication required',
      timestamp: expect.any(String),
      path: '/auth/me',
    });
  });

  it('a gated endpoint with a valid session returns 200', async () => {
    const { userId, token } = await createUserWithSession();
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .expect(200);
    expect(res.body).toMatchObject({ id: userId });
  });

  it('a gated endpoint with an expired session returns 401', async () => {
    const { userId, token } = await createUserWithSession();
    await app.get(PrismaService).session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .expect(401);
  });

  describe('auth endpoints', () => {
    const PASSWORD = 'correct-horse-battery';
    const FRONTEND_ORIGIN = 'http://localhost:5173';

    function uniqueEmail(): string {
      return `e2e-${randomUUID()}@example.test`;
    }

    // Returns the raw Set-Cookie entry for the session cookie.
    function sessionSetCookie(res: Response): string {
      const header: string[] | string | undefined = res.headers['set-cookie'];
      const cookies = Array.isArray(header) ? header : header ? [header] : [];
      const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
      if (!cookie) {
        throw new Error('No session cookie set');
      }
      return cookie;
    }

    function sessionToken(res: Response): string {
      return sessionSetCookie(res)
        .split(';')[0]
        .slice(SESSION_COOKIE.length + 1);
    }

    // Raw sign-up with an arbitrary body; tracks created users for cleanup.
    async function signUpWith(
      body: Record<string, unknown>,
    ): Promise<Response> {
      const res = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .set('Origin', FRONTEND_ORIGIN)
        .send(body);
      if (res.status === 201) {
        createdUserIds.push((res.body as { id: string }).id);
      }
      return res;
    }

    function signUp(
      email: string,
      password = PASSWORD,
      username = uniqueUsername(),
      displayName = DISPLAY_NAME,
    ): Promise<Response> {
      return signUpWith({ email, username, displayName, password });
    }

    function signIn(email: string, password: string): request.Test {
      return request(app.getHttpServer())
        .post('/auth/sign-in')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ email, password });
    }

    it('POST /auth/sign-up creates the user, sets the session cookie and returns only { id, email, username, displayName }', async () => {
      const email = uniqueEmail();
      const username = uniqueUsername();
      const res = await signUp(email, PASSWORD, username);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        email,
        username,
        displayName: DISPLAY_NAME,
      });
      expect(Object.keys(res.body as object).sort()).toEqual([
        'displayName',
        'email',
        'id',
        'username',
      ]);

      const cookie = sessionSetCookie(res);
      expect(sessionToken(res).length).toBeGreaterThan(0);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
      expect(cookie).toMatch(/;\s*Path=\/(;|$)/);
      expect(cookie).toMatch(/;\s*Expires=/i);

      const row = await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { email } });
      expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    });

    it('POST /auth/sign-up hashes the same password differently for two users', async () => {
      const emailA = uniqueEmail();
      const emailB = uniqueEmail();
      expect((await signUp(emailA)).status).toBe(201);
      expect((await signUp(emailB)).status).toBe(201);

      const prisma = app.get(PrismaService);
      const a = await prisma.user.findUniqueOrThrow({
        where: { email: emailA },
      });
      const b = await prisma.user.findUniqueOrThrow({
        where: { email: emailB },
      });
      expect(a.passwordHash).not.toBe(b.passwordHash);
    });

    it('POST /auth/sign-up with an already registered email (any case/whitespace) returns 409', async () => {
      const email = uniqueEmail();
      expect((await signUp(email)).status).toBe(201);

      const res = await signUp(`  ${email.toUpperCase()}  `);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Email is already registered');
    });

    it('POST /auth/sign-up without a username returns 400', async () => {
      const res = await signUpWith({
        email: uniqueEmail(),
        displayName: DISPLAY_NAME,
        password: PASSWORD,
      });
      expect(res.status).toBe(400);
    });

    it('POST /auth/sign-up without a displayName returns 400 and creates no user', async () => {
      const email = uniqueEmail();
      const res = await signUpWith({
        email,
        username: uniqueUsername(),
        password: PASSWORD,
      });
      expect(res.status).toBe(400);
      await expect(
        app.get(PrismaService).user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it.each([
      ['empty', ''],
      ['whitespace-only', '   '],
      ['too long', 'a'.repeat(51)],
      ['multi-line', 'Ada\nLovelace'],
      ['a number', 42],
    ])(
      'POST /auth/sign-up rejects a displayName that is %s with 400',
      async (_label, displayName) => {
        const res = await signUpWith({
          email: uniqueEmail(),
          username: uniqueUsername(),
          displayName,
          password: PASSWORD,
        });
        expect(res.status).toBe(400);
      },
    );

    it('POST /auth/sign-up stores the displayName trimmed, counts code points, and GET /auth/me returns it', async () => {
      // 50 emoji: 100 UTF-16 code units but 50 characters, so it is accepted.
      const emojiName = '\u{1F600}'.repeat(50);
      const emoji = await signUp(
        uniqueEmail(),
        PASSWORD,
        uniqueUsername(),
        emojiName,
      );
      expect(emoji.status).toBe(201);
      expect(emoji.body.displayName).toBe(emojiName);

      const res = await signUp(
        uniqueEmail(),
        PASSWORD,
        uniqueUsername(),
        '  Ada Lovelace  ',
      );
      expect(res.status).toBe(201);
      expect(res.body.displayName).toBe('Ada Lovelace');

      const row = await app.get(PrismaService).user.findUniqueOrThrow({
        where: { id: (res.body as { id: string }).id },
      });
      expect(row.displayName).toBe('Ada Lovelace');

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=${sessionToken(res)}`)
        .expect(200);
      expect(me.body.displayName).toBe('Ada Lovelace');
    });

    it('GET /auth/me returns displayName: null for an account without one', async () => {
      const { token } = await createUserWithSession(null);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=${token}`)
        .expect(200);
      expect(me.body).toHaveProperty('displayName', null);
    });

    it.each([
      ['too short', 'ab'],
      ['too long', 'a'.repeat(21)],
      ['with a hyphen', 'bad-name'],
      ['with a space', 'Bad Name'],
      ['reserved', 'admin'],
      ['reserved after normalization', ' ME '],
    ])(
      'POST /auth/sign-up rejects a username %s with 400',
      async (_label, username) => {
        const res = await signUp(uniqueEmail(), PASSWORD, username);
        expect(res.status).toBe(400);
      },
    );

    it('POST /auth/sign-up with a taken username (any case/whitespace) returns 409', async () => {
      const username = uniqueUsername();
      expect((await signUp(uniqueEmail(), PASSWORD, username)).status).toBe(
        201,
      );

      const res = await signUp(
        uniqueEmail(),
        PASSWORD,
        `  ${username.toUpperCase()} `,
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Username is already taken');
    });

    it('POST /auth/sign-up stores the username trimmed and lowercased', async () => {
      // `  New_<HEX> ` -> `new_<hex>`; the hex suffix keeps it unique.
      const suffix = uniqueUsername().slice(4);
      const res = await signUp(
        uniqueEmail(),
        PASSWORD,
        `  New_${suffix.toUpperCase()} `,
      );

      expect(res.status).toBe(201);
      expect(res.body.username).toBe(`new_${suffix}`);
      const row = await app.get(PrismaService).user.findUniqueOrThrow({
        where: { id: (res.body as { id: string }).id },
      });
      expect(row.username).toBe(`new_${suffix}`);
    });

    it('POST /auth/sign-up rejects an invalid email and out-of-range passwords with 400', async () => {
      expect((await signUp('not-an-email')).status).toBe(400);
      expect((await signUp(uniqueEmail(), 'a'.repeat(11))).status).toBe(400);
      expect((await signUp(uniqueEmail(), 'a'.repeat(129))).status).toBe(400);
    });

    it('POST /auth/sign-in issues a fresh session; bad credentials fail identically', async () => {
      const email = uniqueEmail();
      const username = uniqueUsername();
      const signUpRes = await signUp(email, PASSWORD, username);
      expect(signUpRes.status).toBe(201);

      const ok = await signIn(email, PASSWORD).expect(200);
      expect(ok.body).toEqual({
        id: expect.any(String),
        email,
        username,
        displayName: DISPLAY_NAME,
      });
      expect(Object.keys(ok.body as object).sort()).toEqual([
        'displayName',
        'email',
        'id',
        'username',
      ]);
      expect(sessionToken(ok)).not.toBe(sessionToken(signUpRes));

      const wrongPassword = await signIn(email, 'wrong-password-123').expect(
        401,
      );
      const unknownEmail = await signIn(uniqueEmail(), PASSWORD).expect(401);
      const wrongMessage: unknown = wrongPassword.body.message;
      expect(wrongMessage).toBe('Invalid email or password');
      expect(unknownEmail.body.message).toBe(wrongMessage);
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it('GET /auth/me and POST /auth/sign-out manage the session lifecycle', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);

      const email = uniqueEmail();
      const username = uniqueUsername();
      const signUpRes = await signUp(email, PASSWORD, username);
      const cookie = `${SESSION_COOKIE}=${sessionToken(signUpRes)}`;

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body).toEqual({
        id: expect.any(String),
        email,
        username,
        displayName: DISPLAY_NAME,
      });
      expect(Object.keys(me.body as object).sort()).toEqual([
        'displayName',
        'email',
        'id',
        'username',
      ]);

      const signOut = await request(app.getHttpServer())
        .post('/auth/sign-out')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Cookie', cookie)
        .expect(204);
      const cleared = sessionSetCookie(signOut);
      expect(cleared.startsWith(`${SESSION_COOKIE}=;`)).toBe(true);
      const expires = /Expires=([^;]+)/i.exec(cleared)?.[1];
      expect(expires).toBeDefined();
      expect(new Date(expires ?? '').getTime()).toBeLessThan(Date.now());

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie)
        .expect(401);

      // Idempotent: signing out again with the stale cookie still succeeds.
      await request(app.getHttpServer())
        .post('/auth/sign-out')
        .set('Cookie', cookie)
        .expect(204);
    });

    it('GET /auth/me emits only UserResponseDto fields even if the resolved user carries more', async () => {
      // Simulates a service accidentally returning a full Prisma row.
      const leakyUser = {
        id: 'user-1',
        email: 'leaky@example.test',
        username: 'leaky',
        displayName: 'Leaky',
        passwordHash: '$argon2id$secret',
        createdAt: new Date(),
      };
      vi.spyOn(app.get(AuthService), 'validateSession').mockResolvedValue(
        leakyUser,
      );

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=any-token`)
        .expect(200);
      expect(res.body).toEqual({
        id: 'user-1',
        email: 'leaky@example.test',
        username: 'leaky',
        displayName: 'Leaky',
      });
      expect(Object.keys(res.body as object).sort()).toEqual([
        'displayName',
        'email',
        'id',
        'username',
      ]);
    });

    it('POST /auth/sign-in from a foreign Origin returns 403', async () => {
      await request(app.getHttpServer())
        .post('/auth/sign-in')
        .set('Origin', 'http://evil.test')
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(403);
    });

    // Throttler storage is in-memory per app instance and beforeEach builds a
    // fresh app, so this test cannot leak its counters into other tests.
    it('POST /auth/sign-in is rate limited to 5 attempts per minute', async () => {
      const email = uniqueEmail();
      for (let attempt = 0; attempt < 5; attempt++) {
        await signIn(email, PASSWORD).expect(401);
      }
      const res = await signIn(email, PASSWORD).expect(429);
      expect(res.body).toEqual({
        statusCode: 429,
        message: expect.any(String),
        timestamp: expect.any(String),
        path: '/auth/sign-in',
      });
    });
  });
});
