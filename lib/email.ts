/**
 * lib/email.ts — the allowlist's notion of an email address.
 *
 * Its own module, not part of lib/auth.ts, because lib/auth.ts imports
 * next-auth and so cannot be loaded by a unit test. This is pure logic that
 * decides who gets in, which is exactly the kind of thing that should be
 * testable without a framework or a database.
 */

/**
 * Canonical form of an email for the allowlist: trimmed and lowercased.
 *
 * Postgres string comparison is case-sensitive, so an address typed into the
 * admin form as "Name@Gmail.com" would never match the "name@gmail.com" Google
 * sends, and that person would be locked out while appearing to be on the
 * list. Applied on every write AND on the lookup, so a row saved before this
 * existed still resolves.
 *
 * The local part is otherwise left alone. Gmail ignores dots and +suffixes,
 * but Google reports the address as registered, so "helpfully" rewriting it
 * here would stop it matching.
 *
 * Returns null for blank, because that is how "no access" is stored.
 */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "" ? null : value;
}
