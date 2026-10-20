import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { normalizeDisplayName, normalizeUsername } from './username.rules.js';
import { UsersRepository } from './users.repository.js';

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  // null for accounts created before display names existed.
  displayName: string | null;
}

// OWASP-recommended argon2id parameters. argon2 generates a random salt per
// hash and encodes it (with these params) in the output string.
export const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const EMAIL_TAKEN_MESSAGE = 'Email is already registered';
const USERNAME_TAKEN_MESSAGE = 'Username is already taken';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

// Column(s) behind a P2002. With the better-sqlite3 driver adapter (Prisma 7)
// there is no `meta.target`; the fields are reported under
// `meta.driverAdapterError.cause.constraint.fields`. `meta.target` is still
// read for non-adapter engines. Empty when neither is present.
function uniqueViolationFields(
  error: Prisma.PrismaClientKnownRequestError,
): string[] {
  const meta = error.meta;
  const target = stringsOf(meta?.target);
  if (target.length > 0) {
    return target;
  }
  const adapterError = meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  const constraint = isRecord(cause) ? cause.constraint : undefined;
  return isRecord(constraint) ? stringsOf(constraint.fields) : [];
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  normalizeEmail(email: string): string {
    return normalizeEmail(email);
  }

  async create(
    email: string,
    username: string,
    displayName: string,
    password: string,
  ): Promise<PublicUser> {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    try {
      const user = await this.usersRepository.create({
        email: normalizedEmail,
        username: normalizeUsername(username),
        displayName: normalizeDisplayName(displayName),
        passwordHash,
      });
      return this.toPublicUser(user);
    } catch (error) {
      // Rely on the unique indexes instead of find-then-create, which would race.
      if (isPrismaError(error, UNIQUE_CONSTRAINT_VIOLATION)) {
        throw new ConflictException(
          await this.signUpConflictMessage(error, normalizedEmail),
        );
      }
      throw error;
    }
  }

  // Returns the full record (including passwordHash) — only for credential
  // verification by the auth module. Never return it to a client.
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(normalizeEmail(email));
  }

  async findById(id: string): Promise<PublicUser | null> {
    const user = await this.usersRepository.findById(id);
    return user ? this.toPublicUser(user) : null;
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
    };
  }

  // Which unique field a sign-up collided on. Uses the fields Prisma reports;
  // if they are missing, falls back to checking whether the email exists.
  private async signUpConflictMessage(
    error: Prisma.PrismaClientKnownRequestError,
    normalizedEmail: string,
  ): Promise<string> {
    const fields = uniqueViolationFields(error);
    if (fields.includes('email')) {
      return EMAIL_TAKEN_MESSAGE;
    }
    if (fields.includes('username')) {
      return USERNAME_TAKEN_MESSAGE;
    }
    const existing = await this.usersRepository.findByEmail(normalizedEmail);
    return existing ? EMAIL_TAKEN_MESSAGE : USERNAME_TAKEN_MESSAGE;
  }
}
