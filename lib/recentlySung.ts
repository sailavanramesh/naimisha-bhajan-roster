/**
 * lib/recentlySung.ts — "we sang this not long ago".
 *
 * Sailavan, 2026-09-10: when a bhajan is entered on a session, or is already
 * there, "if its been sung in the last 3 months, a soft thing to clearly
 * indicate its been sung recently and a link out to that bhajan and the section
 * where it lists the dates its been sung".
 *
 * The point is to catch a repeat while the roster is still being built, so the
 * marker has to appear the moment a bhajan is chosen — not after a save, and
 * not only on the pages that already know the history.
 *
 * Pure, as CLAUDE.md asks of everything in lib/: the database half is
 * lib/recentlySungQueries.ts. The maths here is all calendar dates at the
 * venue, never moments — a session date is a `@db.Date`, and reading one in the
 * reader's zone is what puts a Thursday session on Wednesday.
 *
 * ## What "recently" is measured against
 *
 * The SESSION's date, not today's. A roster is usually built for a Thursday
 * that has not happened yet, and the question being asked is "will this feel
 * like a repeat when we sing it", which is a question about that evening. For a
 * session already past it reads the same way — what had been sung in the three
 * months before it.
 */

import { parseISO, toISO } from "./dates";

/** How long "recently" lasts. Sailavan's number, 2026-09-10. */
export const RECENT_MONTHS = 3;

/** What the history says about one bhajan, inside the window. */
export type RecentSung = {
  /** The latest date it was sung, as a calendar date. */
  lastISO: string;
  /** How many times inside the window, that one included. Always ≥ 1. */
  count: number;
};

/**
 * The earliest date that still counts as recent.
 *
 * Month arithmetic clamps rather than rolling over: three months before 31 May
 * is the end of February, not the 2nd or 3rd of March. `setUTCMonth` alone
 * would roll, which would quietly widen the window by a couple of days for
 * exactly the dates where a month is short.
 */
export function recentCutoffISO(asOfISO: string, months = RECENT_MONTHS): string | null {
  const asOf = parseISO(asOfISO);
  if (!asOf) return null;

  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth() - months;
  const day = asOf.getUTCDate();

  // Day 0 of the following month is the last day of the month we want.
  const lastOfTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(y, m, Math.min(day, lastOfTarget))));
}

/** Is this date inside the window ending at `asOfISO`? */
export function isRecentlySung(
  lastISO: string | null,
  asOfISO: string,
  months = RECENT_MONTHS,
): boolean {
  if (!lastISO) return false;
  const cutoff = recentCutoffISO(asOfISO, months);
  if (!cutoff) return false;
  return lastISO >= cutoff && lastISO <= asOfISO;
}

/**
 * A session date, written the way the rest of the app writes one.
 *
 * Read back at midday UTC and formatted in UTC — the same treatment
 * `LearningListView` gives it, and for the same reason (CLAUDE.md: a session
 * date is a calendar date, so formatting it in the reader's zone slips it a day
 * west of UTC).
 */
export function formatSessionDate(
  iso: string,
  opts: { year?: boolean; long?: boolean } = {},
): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: opts.long ? "long" : "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/**
 * The words on the marker itself.
 *
 * Deliberately the same shape as the cards on a singer's list — "last sung
 * 23 Aug 2026 · 2×" — because it is the same fact, and two spellings of one
 * fact is how a group ends up arguing about which page is right. The year is
 * dropped here: the window is three months, so it is never in doubt, and the
 * cell is narrow.
 */
export function recentlySungLabel(r: RecentSung): string {
  const times = r.count > 1 ? ` · ${r.count}×` : "";
  return `sung recently · ${formatSessionDate(r.lastISO, { year: false })}${times}`;
}

/**
 * The long version, for the title attribute and for anyone using a screen
 * reader — where there is room to say what "recently" means and that the marker
 * is a way through to the history rather than only a warning.
 */
export function recentlySungTitle(r: RecentSung, months = RECENT_MONTHS): string {
  // Spelled out: there is room here, and "Aug" abbreviated is read aloud
  // as three letters by some screen readers.
  const when = formatSessionDate(r.lastISO, { long: true });
  const how =
    r.count === 1
      ? `Sung once in the last ${months} months, on ${when}.`
      : `Sung ${r.count} times in the last ${months} months, most recently on ${when}.`;
  return `${how} Opens the dates it has been sung.`;
}
