/**
 * lib/rosterEligibility.ts — who can be put on a session.
 *
 * Pure. No Prisma import.
 *
 * Sailavan: somebody with no voice recorded is not a singer, and must not be
 * rostered as one. The rule is not cosmetic — the whole pitch model hangs off
 * it. A slot's recommended pitch IS the bhajan's reference for that singer's
 * voice (CLAUDE.md rule 5), so a singer with no voice has no reference, no
 * recommendation, and no offset profile. Rostering them produces a row the
 * rest of the app cannot reason about.
 *
 * They are still a real person with real access: they can sign in, read the
 * roster, and keep a learning list. They just cannot be given a slot.
 */

export type RosterableSinger = { gender?: string | null };

/** True when this person can be put on a session slot. */
export function canBeRostered(singer: RosterableSinger | null | undefined): boolean {
  return Boolean(singer && singer.gender);
}

/** Everyone who can be put on a session, preserving order. */
export function rosterable<T extends RosterableSinger>(singers: readonly T[]): T[] {
  return singers.filter((s) => canBeRostered(s));
}

/**
 * Why a person cannot be rostered, for a message a coordinator can act on.
 * Null when they can be.
 */
export function rosterBlockReason(
  singer: (RosterableSinger & { name?: string }) | null | undefined,
): string | null {
  if (!singer) return "That person is not on the list.";
  if (!singer.gender) {
    return `${singer.name ?? "That person"} has no voice recorded, so they are not a singer. Set Gents or Ladies in Admin → Access first — the recommended pitch depends on it.`;
  }
  return null;
}
