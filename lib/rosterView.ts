/**
 * Which view the roster opens in: the calendar, or the list.
 *
 * Three things can have an opinion, in this order:
 *
 *   1. an explicit `?view=` in the URL — so a link somebody shares shows what
 *      they meant it to show;
 *   2. what this person chose as their default;
 *   3. the calendar, for anybody who has never said.
 *
 * The order is the whole rule, and it was fine. What went wrong was upstream:
 * the "Roster" pill on a session page linked to `?view=calendar`, so Sailavan —
 * whose saved default is the list — got the calendar every time he came back
 * from a session, which is the normal way into the roster since the app opens
 * on the nearest session. His setting was never consulted, and from the outside
 * that reads as the setting being broken.
 *
 * So the rule lives here now, with tests, and a link only passes `view` when it
 * genuinely means to override somebody's choice.
 */
export type RosterView = "calendar" | "list";

export function resolveRosterView(
  /** `?view=` from the URL, if any. Anything unrecognised is ignored. */
  explicit: string | null | undefined,
  /** What this person saved as their default, or null if they never did. */
  saved: RosterView | null | undefined,
): RosterView {
  if (explicit === "list" || explicit === "calendar") return explicit;
  if (saved === "list" || saved === "calendar") return saved;
  return "calendar";
}
