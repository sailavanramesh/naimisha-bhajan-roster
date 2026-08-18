/**
 * lib/rosterGrid.ts — the roster grid's column budget, in one place.
 *
 * Pure. No Prisma, no React.
 *
 * WHY THIS IS A MODULE AND NOT SIX NUMBERS IN A className.
 *
 * The grid is `table-fixed`, which honours declared column widths and hands
 * whatever is left to the one column that declares none — the bhajan, which is
 * the column with a long name in it and the one that can use the room. That is
 * a good arrangement and it is why the widths are declared at all.
 *
 * Its failure mode is silent. The declared widths and the table's minimum width
 * are two numbers that have to agree, and nothing made them: the columns added
 * up to 760px against a 720px floor, so the bhajan was allotted MINUS forty
 * pixels, collapsed to zero, and its contents painted straight over the pitch
 * column. Invisible on a desktop, where the table is far wider than its floor
 * and the bhajan gets hundreds of pixels of slack — and the first thing you see
 * on a phone held sideways, which is wide enough to miss the stacked-card
 * breakpoint at 767px and too narrow to give the table more than its minimum.
 *
 * So the floor is DERIVED from the widths rather than written next to them, and
 * `rosterGrid.test.ts` holds the invariant that the bhajan always has room.
 * Adding a column now moves the floor on its own.
 */

/** Declared widths, in px. Every column except the bhajan, which takes the rest. */
export const ROSTER_COLUMNS = {
  singer: 190,
  pitch: 168,
  chorus: 158,
  recommended: 108,
  tabla: 52,
  /** The delete button. Only rendered for somebody who may edit. */
  actions: 84,
} as const;

/**
 * The narrowest the bhajan column may ever be.
 *
 * A bhajan name is the longest text in the grid — "Om Namah Shivaya Shivaya
 * Namah (Vakulabharanam / Basant Mukhari)" — and under it sit the shruti
 * stepper and the link to the words. Below about this it stops being a column
 * and starts being a place where text wraps one word at a time.
 */
export const BHAJAN_MIN_WIDTH = 220;

/**
 * How wide the table must be before the bhajan starts to suffer.
 *
 * Below this the browser has nothing left to give it. Above it, `table-fixed`
 * spends every extra pixel on the bhajan, which is the whole point.
 */
export function rosterTableMinWidth(canEdit: boolean): number {
  const { singer, pitch, chorus, recommended, tabla, actions } = ROSTER_COLUMNS;
  const declared = singer + pitch + chorus + recommended + tabla + (canEdit ? actions : 0);
  return declared + BHAJAN_MIN_WIDTH;
}
