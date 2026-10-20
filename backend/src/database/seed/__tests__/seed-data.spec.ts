import {
  DEMO_USERNAME,
  SEED_EMAIL_DOMAIN,
  buildSeedData,
  validateSeedData,
  type SeedData,
} from '../seed-data.js';

describe('seed data', () => {
  const data = buildSeedData();

  it('includes the demo account', () => {
    expect(data.users.map((user) => user.username)).toContain(DEMO_USERNAME);
  });

  it('derives every email from the username', () => {
    for (const user of data.users) {
      expect(user.email).toBe(`${user.username}@${SEED_EMAIL_DOMAIN}`);
    }
  });

  it('passes its own validation', () => {
    expect(() => validateSeedData(data)).not.toThrow();
  });

  it('is deterministic', () => {
    expect(buildSeedData()).toEqual(data);
  });
});

describe('validateSeedData', () => {
  const user = {
    username: 'valid_user',
    email: 'v@example.com',
    displayName: 'Valid',
  };
  const withUsers = (users: SeedData['users']): SeedData => ({ users });

  it.each([
    ['uppercase', 'Valid'],
    ['too short', 'ab'],
    ['a disallowed character', 'some-one'],
    ['a reserved word', 'admin'],
  ])('rejects a username with %s', (_label, username) => {
    expect(() => validateSeedData(withUsers([{ ...user, username }]))).toThrow(
      /invalid username/,
    );
  });

  it('rejects an invalid display name', () => {
    expect(() =>
      validateSeedData(withUsers([{ ...user, displayName: '' }])),
    ).toThrow(/invalid display name/);
  });

  it('rejects a duplicated username', () => {
    expect(() => validateSeedData(withUsers([user, user]))).toThrow(
      /duplicated/,
    );
  });
});
