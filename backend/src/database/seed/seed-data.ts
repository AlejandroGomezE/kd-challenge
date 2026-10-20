import {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  isValidDisplayName,
  normalizeUsername,
} from '../../modules/users/username.rules.js';

// The seed data set: a few demo accounts that can sign in. Pure: no I/O, no
// Prisma, no randomness.

export const SEED_PASSWORD = 'password1234';
export const SEED_EMAIL_DOMAIN = 'example.com';
export const DEMO_USERNAME = 'demo';

export interface SeedUser {
  username: string;
  email: string;
  displayName: string;
}

export interface SeedData {
  users: SeedUser[];
}

const SEED_ACCOUNTS: readonly { username: string; displayName: string }[] = [
  { username: DEMO_USERNAME, displayName: 'Demo User' },
  { username: 'alice', displayName: 'Alice Example' },
  { username: 'bob', displayName: 'Bob Example' },
];

export function buildSeedData(): SeedData {
  return {
    users: SEED_ACCOUNTS.map((account) => ({
      username: account.username,
      email: `${account.username}@${SEED_EMAIL_DOMAIN}`,
      displayName: account.displayName,
    })),
  };
}

// Throws if the data set breaks a rule sign-up enforces, so the seed can
// never write an account the app itself would reject.
export function validateSeedData(data: SeedData): void {
  const seen = new Set<string>();
  for (const user of data.users) {
    const { username } = user;
    if (
      normalizeUsername(username) !== username ||
      username.length < USERNAME_MIN_LENGTH ||
      username.length > USERNAME_MAX_LENGTH ||
      !USERNAME_PATTERN.test(username) ||
      RESERVED_USERNAMES.includes(username)
    ) {
      throw new Error(`Seed user "${username}" has an invalid username`);
    }
    if (!isValidDisplayName(user.displayName)) {
      throw new Error(`Seed user "${username}" has an invalid display name`);
    }
    if (seen.has(username)) {
      throw new Error(`Seed user "${username}" is duplicated`);
    }
    seen.add(username);
  }
}
