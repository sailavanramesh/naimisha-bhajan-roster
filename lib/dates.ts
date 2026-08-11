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

/** Today in Australia/Melbourne as `YYYY-MM-DD`. Session dates are Melbourne dates. */
export function melbourneTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The hour of the day in Melbourne, 0–23.
 *
 * Computed from the zone rather than from an offset because the group is in a
 * daylight-saving zone: Melbourne is UTC+10 for half the year and UTC+11 for
 * the other half, and "3pm" has to mean 3pm in the hall on both sides of the
 * change.
 */
export function melbourneHour(now: Date = new Date()): number {
  const hh = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  // en-GB renders midnight as "24" in some ICU versions.
  return Number(hh) % 24;
}

/**
 * The latest session date that counts as history.
 *
 * Session dates are stored at UTC midnight, so comparing `<=` against today's
 * midnight includes today and excludes tomorrow onwards.
 *
 * This exists because a pitch typed while PLANNING a future session is not
 * evidence of anything: nobody has sung it yet. Counting it inflates a
 * singer's sample and drags their median towards what was planned rather than
 * what happened — and the plan is itself produced from that median, so the
 * model would be learning from its own output.
 *
 * Today counts. A session is normally filled in during or just after the
 * evening, and treating it as future until midnight would be its own surprise.
 */
export function historyCutoff(now: Date = new Date()): Date {
  return new Date(`${melbourneTodayISO(now)}T00:00:00.000Z`);
}
