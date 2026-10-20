import type { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  displayNameSchema,
  RESERVED_USERNAMES,
  usernameSchema,
} from '../user-schemas'

const messagesOf = (result: z.ZodSafeParseResult<unknown>) =>
  (result.error?.issues ?? []).map((issue) => issue.message)

describe('usernameSchema', () => {
  it('trims and lowercases before validating', () => {
    expect(usernameSchema.parse('  Ada_Lovelace ')).toBe('ada_lovelace')
  })

  it('accepts letters, numbers and underscores', () => {
    expect(usernameSchema.parse('ada_99')).toBe('ada_99')
  })

  it.each([
    ['abc', true],
    ['ab', false],
    ['a'.repeat(20), true],
    ['a'.repeat(21), false],
  ])('length boundary: %s → valid %s', (value, valid) => {
    expect(usernameSchema.safeParse(value).success).toBe(valid)
  })

  it('measures length after trimming', () => {
    const result = usernameSchema.safeParse('  ab  ')

    expect(result.success).toBe(false)
    expect(messagesOf(result)).toContain('Username must be at least 3 characters')
  })

  it('reports the too-long message', () => {
    expect(messagesOf(usernameSchema.safeParse('a'.repeat(21)))).toContain(
      'Username must be at most 20 characters',
    )
  })

  it.each(['ada lovelace', 'ada-lovelace', 'adá_l', 'ada.l', 'ada!'])(
    'rejects %j (outside a-z, 0-9, _)',
    (value) => {
      const result = usernameSchema.safeParse(value)

      expect(result.success).toBe(false)
      expect(messagesOf(result)).toContain('Only letters, numbers and underscores')
    },
  )

  it.each(RESERVED_USERNAMES.flatMap((word) => [word, word.toUpperCase(), ` ${word} `]))(
    'rejects the reserved word %j',
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false)
    },
  )

  // Reserved words that pass every other rule fail specifically on the reserved check.
  it.each(['settings', 'AUTH', 'Users', 'api', 'Admin', 'root'])(
    'reports %j as not available',
    (value) => {
      expect(messagesOf(usernameSchema.safeParse(value))).toEqual(["This username isn't available"])
    },
  )

  // Guard: this list MUST stay identical to the authoritative backend copy in
  // `backend/src/modules/users/username.rules.ts` (RESERVED_USERNAMES). Update both together.
  it('keeps the reserved list in sync with the backend', () => {
    expect(RESERVED_USERNAMES).toEqual([
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
    ])
  })
})

describe('displayNameSchema', () => {
  it('trims', () => {
    expect(displayNameSchema.parse('  Ada Lovelace ')).toBe('Ada Lovelace')
  })

  it.each(['', '   '])('requires a name (%j)', (value) => {
    expect(messagesOf(displayNameSchema.safeParse(value))).toEqual(['Name is required'])
  })

  it.each([
    ['a', true],
    ['a'.repeat(50), true],
    ['a'.repeat(51), false],
    [`  ${'a'.repeat(50)}  `, true],
  ])('length boundary: %j → valid %s', (value, valid) => {
    expect(displayNameSchema.safeParse(value).success).toBe(valid)
  })

  it('counts code points, so an emoji counts as 1 (like the backend)', () => {
    expect(displayNameSchema.safeParse('😀'.repeat(50)).success).toBe(true)
    expect(messagesOf(displayNameSchema.safeParse('😀'.repeat(51)))).toEqual([
      'Name must be at most 50 characters',
    ])
  })

  it.each(['Ada\nLovelace', 'Ada\rLovelace'])('rejects line breaks (%j)', (value) => {
    expect(messagesOf(displayNameSchema.safeParse(value))).toEqual([
      "Name can't contain line breaks",
    ])
  })
})
