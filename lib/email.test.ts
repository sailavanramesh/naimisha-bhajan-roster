import { describe, it, expect } from 'vitest';
import { normaliseEmail } from './email';

/*
 * The allowlist is the whole access model — an address that does not match
 * gets read-only, whoever it belongs to. Once the OAuth app is published,
 * anyone may attempt sign-in, so a coordinator typing an address with a
 * capital letter must not be able to lock somebody out by accident.
 */
describe('normaliseEmail', () => {
  it('lowercases, so a capitalised entry still matches what Google sends', () => {
    expect(normaliseEmail('Name@Gmail.com')).toBe('name@gmail.com');
    expect(normaliseEmail('SAILAVAN@EXAMPLE.COM')).toBe('sailavan@example.com');
  });

  it('trims stray whitespace from a paste', () => {
    expect(normaliseEmail('  name@gmail.com  ')).toBe('name@gmail.com');
    expect(normaliseEmail('\tname@gmail.com\n')).toBe('name@gmail.com');
  });

  it('treats blank as no access rather than as an empty string', () => {
    expect(normaliseEmail('')).toBeNull();
    expect(normaliseEmail('   ')).toBeNull();
    expect(normaliseEmail(null)).toBeNull();
    expect(normaliseEmail(undefined)).toBeNull();
  });

  it('is idempotent, so re-saving a row cannot drift', () => {
    const once = normaliseEmail(' Mixed@Case.COM ');
    expect(normaliseEmail(once)).toBe(once);
  });

  it('leaves the local part otherwise intact — no dot or plus stripping', () => {
    // Gmail ignores dots and +suffixes, but Google reports the address as
    // registered, so rewriting it here would stop it matching.
    expect(normaliseEmail('first.last+roster@gmail.com')).toBe('first.last+roster@gmail.com');
  });
});
