/**
 * lib/dates.ts — session date helpers.
 *
 * Pure. Every function takes and returns an ISO `YYYY-MM-DD` string rather than
 * a Date, because session dates are Melbourne calendar dates, not instants
 * (CLAUDE.md: "Dates are session dates, not timestamps"). Doing the arithmetic
 * on the string keeps a UTC offset from ever shifting a session onto the wrong
 * day, which is the failure this codebase has to avoid.
 */

/** Days of the week as `getUTCDay` numbers it. */
export const THURSDAY = 4;

/** Parse `YYYY-MM-DD` into a UTC-anchored Date. Noon avoids any DST edge. */
function parseISO(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The coming occurrence of a weekday, on or after `fromISO`.
 *
 * "On or after" is deliberate: if it is already Thursday, the session being
 * planned is almost certainly tonight's, not one in eight days' time. Skipping
 * to next week would make the common case need a manual correction every time.
 *
 * Returns `fromISO` unchanged if it cannot be parsed, so a bad input degrades
 * to today rather than throwing inside a page render.
 */
export function nextWeekday(fromISO: string, weekday: number): string {
  const d = parseISO(fromISO);
  if (!d) return fromISO;
  const delta = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return toISO(d);
}

/** The coming Thursday, today included. The group's usual weekday session. */
export function nextThursday(fromISO: string): string {
  return nextWeekday(fromISO, THURSDAY);
}
