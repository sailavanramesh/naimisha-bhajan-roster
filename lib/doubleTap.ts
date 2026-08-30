/**
 * lib/doubleTap.ts — telling a second tap from a first one.
 *
 * The roster calendar used to open a day's session on a single tap, which made
 * it useless for the thing a calendar is for. Sailavan, 2026-08-31: "i don't
 * want to open the session if i click on a day anymore, its hard to scan
 * through future rostered sessions in that view". One tap selects the day and
 * fills the panel below; two open it.
 *
 * Counted from ordinary `click`s rather than handed to `onDoubleClick`, because
 * `dblclick` is not dependable under a finger — iOS reserves the double tap for
 * zoom and delivers the event late or not at all. Two clicks are two clicks
 * everywhere.
 *
 * Pure and separate because the edges are the interesting part and none of them
 * are visible in a browser: a third tap, a tap that lands on a different day,
 * and a pair that straddles the window.
 */

/** How long the second tap has to arrive. Long enough for a thumb, short
 *  enough that two unrelated taps on the same day are not mistaken for one
 *  gesture. */
export const DOUBLE_TAP_MS = 400;

/** The tap being waited on: which day it was, and when. */
export type Tap = { date: string; at: number };

/**
 * What one tap means.
 *
 * `open` is true only for the second tap of a pair on the SAME day inside the
 * window. `next` is what to remember for the tap after this one — null once a
 * pair has completed, so a third tap begins a fresh pair instead of counting
 * as the second of another one and opening the session twice.
 */
export function countTap(
  prev: Tap | null,
  date: string,
  at: number,
): { open: boolean; next: Tap | null } {
  const open = prev !== null && prev.date === date && at - prev.at < DOUBLE_TAP_MS;
  return { open, next: open ? null : { date, at } };
}
