/**
 * The rules the live board notices things by.
 *
 * Pure and DOM-free on purpose: the board is a client component full of refs,
 * observers and timeouts, and the two decisions that actually matter — "did
 * this row move?" and "is there something under the bottom edge?" — should be
 * checkable without any of that. Everything here is a number in, a boolean out.
 */

/**
 * Which row positions differ between what was on screen and what is now.
 *
 * A position missing from `before` counts as moved: an ADDED bhajan is a change
 * to the running order, and the loudest kind. The caller is responsible for not
 * calling this on the very first render, where every row would look new —
 * that is the baseline, not a change.
 */
export function movedRows(
  before: ReadonlyMap<number, string>,
  now: ReadonlyMap<number, string>,
): number[] {
  return [...now.entries()]
    .filter(([position, signature]) => !before.has(position) || before.get(position) !== signature)
    .map(([position]) => position);
}

/**
 * How much slack before we admit there is more below.
 *
 * Sub-pixel rounding and the scroll container's own bottom padding both leave a
 * few pixels of overflow that nobody needs to scroll for. An arrow that shows
 * when everything already fits would teach the sound desk to ignore it, which
 * costs more than the arrow is worth.
 */
export const SCROLL_SLACK_PX = 24;

/** Is any content hidden under the bottom edge of the scrolling area? */
export function hasMoreBelow(metrics: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): boolean {
  const { scrollHeight, scrollTop, clientHeight } = metrics;
  return scrollHeight - scrollTop - clientHeight > SCROLL_SLACK_PX;
}

/**
 * Has a row been looked at?
 *
 * True once its TOP edge is inside the window — a card whose first line is on
 * screen is a card you have noticed, even if its singer is still cut off. Rows
 * scrolled up past the top count as seen too: the arrow only ever points down,
 * so there is nothing useful it could say about them.
 *
 * The 12px is the mirror of `SCROLL_SLACK_PX` at row level: a card whose first
 * few pixels are peeking above the fold has not been read.
 */
export function isRowSeen(rowTop: number, windowBottom: number): boolean {
  return rowTop < windowBottom - 12;
}
