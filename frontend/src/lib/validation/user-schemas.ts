import { z } from 'zod'

// Client-side mirrors of the backend's user rules (username, display name). The backend stays the
// source of truth; this file is the single frontend home for these rules.

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
export const DISPLAY_NAME_MAX_LENGTH = 50

// MUST match the backend copy in `backend/src/modules/users/username.rules.ts`. These words would
// collide with app routes/API paths, so nobody can register them.
export const RESERVED_USERNAMES = [
  'me',
  'settings',
  'sign-in',
  'sign-up',
  'sign-out',
  'auth',
  'users',
  'u',
  'api',
  'admin',
  'root',
]

// Trimmed + lowercased before validation, like the backend stores it.
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(/^[a-z0-9_]+$/, 'Only letters, numbers and underscores')
  .refine((value) => !RESERVED_USERNAMES.includes(value), "This username isn't available")

// Length in Unicode code points, so an emoji (a surrogate pair) counts as 1, like the backend.
const countCodePoints = (value: string) => Array.from(value).length

// Display name ("Name"): trimmed, 1–50 characters counted in Unicode code points (an emoji counts
// as 1, like the backend), no line breaks. MUST match the backend rules in
// `backend/src/modules/users/username.rules.ts`.
const withDisplayNameRules = (schema: z.ZodString) =>
  schema
    .refine(
      (value) => countCodePoints(value) <= DISPLAY_NAME_MAX_LENGTH,
      `Name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`,
    )
    .refine((value) => !/[\r\n]/.test(value), "Name can't contain line breaks")

// Required at sign-up.
export const displayNameSchema = withDisplayNameRules(
  z.string().trim().min(1, 'Name is required'),
)
