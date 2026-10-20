import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameLength,
  IsDisplayName,
  IsUsername,
  isValidDisplayName,
  normalizeDisplayName,
  normalizeUsername,
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../username.rules.js';

class RequiredUsernameDto {
  @IsUsername()
  username: string;
}

class RequiredDisplayNameDto {
  @IsDisplayName()
  displayName: string;
}

// Same order the global ValidationPipe uses: transform, then validate.
function check<T extends object>(
  type: new () => T,
  body: object,
): { value: T; errors: string[] } {
  const value = plainToInstance(type, body);
  const errors = validateSync(value).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
  return { value, errors };
}

describe('normalizers', () => {
  it('normalizeUsername trims and lowercases', () => {
    expect(normalizeUsername('  Some_One ')).toBe('some_one');
  });

  it('normalizeDisplayName trims but keeps a blank name as an empty string', () => {
    expect(normalizeDisplayName('  Ada Lovelace ')).toBe('Ada Lovelace');
    expect(normalizeDisplayName('   ')).toBe('');
  });

  it('displayNameLength counts code points, not UTF-16 code units', () => {
    expect(displayNameLength('abc')).toBe(3);
    expect('\u{1F600}'.length).toBe(2);
    expect(displayNameLength('\u{1F600}')).toBe(1);
  });
});

describe('@IsUsername()', () => {
  it('normalizes before validating', () => {
    const { value, errors } = check(RequiredUsernameDto, {
      username: '  Some_One1 ',
    });

    expect(errors).toEqual([]);
    expect(value.username).toBe('some_one1');
  });

  it.each([
    ['too short', 'a'.repeat(USERNAME_MIN_LENGTH - 1)],
    ['too long', 'a'.repeat(USERNAME_MAX_LENGTH + 1)],
    ['a disallowed character', 'some-one'],
    ['a space inside', 'some one'],
    ['only whitespace', '   '],
    ['a reserved word', 'Settings'],
  ])('rejects %s', (_label, username) => {
    expect(check(RequiredUsernameDto, { username }).errors).not.toEqual([]);
  });

  it('rejects every reserved word', () => {
    for (const username of RESERVED_USERNAMES) {
      expect(check(RequiredUsernameDto, { username }).errors).toContain(
        'username is not available',
      );
    }
  });

  it('rejects a missing or non-string username', () => {
    expect(check(RequiredUsernameDto, {}).errors).not.toEqual([]);
    expect(check(RequiredUsernameDto, { username: 42 }).errors).not.toEqual([]);
  });

  it('accepts the length boundaries', () => {
    for (const length of [USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH]) {
      const username = 'a'.repeat(length);
      expect(check(RequiredUsernameDto, { username }).errors).toEqual([]);
    }
  });
});

describe('@IsDisplayName()', () => {
  const EMOJI = '\u{1F600}';

  it('trims before validating', () => {
    const { value, errors } = check(RequiredDisplayNameDto, {
      displayName: '  Ada Lovelace  ',
    });

    expect(errors).toEqual([]);
    expect(value.displayName).toBe('Ada Lovelace');
  });

  it('accepts inner spaces, punctuation and emoji', () => {
    expect(
      check(RequiredDisplayNameDto, { displayName: `Ada L. ${EMOJI}` }).errors,
    ).toEqual([]);
  });

  it(`accepts 1 and ${DISPLAY_NAME_MAX_LENGTH} characters and rejects ${DISPLAY_NAME_MAX_LENGTH + 1}`, () => {
    expect(check(RequiredDisplayNameDto, { displayName: 'a' }).errors).toEqual(
      [],
    );
    expect(
      check(RequiredDisplayNameDto, {
        displayName: 'a'.repeat(DISPLAY_NAME_MAX_LENGTH),
      }).errors,
    ).toEqual([]);
    expect(
      check(RequiredDisplayNameDto, {
        displayName: 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1),
      }).errors,
    ).toEqual([
      `displayName must be between 1 and ${DISPLAY_NAME_MAX_LENGTH} characters with no line breaks`,
    ]);
  });

  it('counts the length in code points, so 50 emoji fit but 51 do not', () => {
    // 50 emoji are 100 UTF-16 code units: @Length would wrongly reject them.
    expect(
      check(RequiredDisplayNameDto, {
        displayName: EMOJI.repeat(DISPLAY_NAME_MAX_LENGTH),
      }).errors,
    ).toEqual([]);
    expect(
      check(RequiredDisplayNameDto, {
        displayName: EMOJI.repeat(DISPLAY_NAME_MAX_LENGTH + 1),
      }).errors,
    ).not.toEqual([]);
  });

  it('checks the length after trimming', () => {
    const padded = `  ${'a'.repeat(DISPLAY_NAME_MAX_LENGTH)}  `;
    expect(
      check(RequiredDisplayNameDto, { displayName: padded }).errors,
    ).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['a line feed inside', 'Ada\nLovelace'],
    ['a carriage return inside', 'Ada\rLovelace'],
    ['a CRLF inside', 'Ada\r\nLovelace'],
  ])('rejects %s', (_label, displayName) => {
    expect(check(RequiredDisplayNameDto, { displayName }).errors).not.toEqual(
      [],
    );
  });

  it.each([
    ['missing', {}],
    ['null', { displayName: null }],
    ['a number', { displayName: 42 }],
    ['a boolean', { displayName: true }],
    ['an array', { displayName: ['Ada'] }],
  ])('rejects a %s display name', (_label, body) => {
    expect(check(RequiredDisplayNameDto, body).errors).not.toEqual([]);
  });

  it('isValidDisplayName rejects non-strings', () => {
    expect(isValidDisplayName(42)).toBe(false);
    expect(isValidDisplayName(undefined)).toBe(false);
    expect(isValidDisplayName('Ada')).toBe(true);
  });
});
