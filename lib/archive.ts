/**
 * lib/archive.ts — archived sessions, and the one filter that hides them.
 *
 * Sailavan, 2026-08-18: a deleted session or programme "should be removed from
 * all views but kept as an archived session or program that the Owner can
 * review and either restore or permanently delete, to have as a fallback in
 * case some accidental mistakes have been made."
 *
 * So `Session.archivedAt` is the whole mechanism, and the risk it creates is
 * obvious: a query that forgets the filter shows a session somebody thinks they
 * deleted. Naming the filter once means every call site reads as a deliberate
 * choice — `where: { ...NOT_ARCHIVED, … }` — and the exceptions stand out,
 * because there are only two kinds and both are correct:
 *
 *   1. /admin/archive, which exists to list exactly what everything else hides;
 *   2. a lookup BY ID of a session somebody already holds — restoring one, or
 *      permanently deleting it.
 *
 * Deliberately not a Prisma client extension. A global filter would cover the
 * top-level queries and silently miss every nested `include: { session: … }`,
 * which is the half most likely to be wrong — and it would hide the rule from
 * the place it applies.
 */

/** Sessions that are actually there. Spread into a `where`. */
export const NOT_ARCHIVED = { archivedAt: null } as const;

/** The same, for filtering through a relation: `where: { session: LIVE_SESSION }`. */
export const LIVE_SESSION = { archivedAt: null } as const;

/** Only the archived ones — /admin/archive, and nothing else. */
export const ONLY_ARCHIVED = { archivedAt: { not: null } } as const;
