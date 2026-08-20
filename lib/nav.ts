/**
 * lib/nav.ts — who sees which pages in the navigation.
 */

/**
 * What a member or a viewer sees in the nav.
 *
 * Filtered on the server, so a hidden page is not merely un-clicked — every
 * page checks for itself as well.
 *
 * It lives here rather than in components/Nav.tsx because it is a POLICY, not
 * presentation, and because a test cannot import it from a file full of JSX.
 * This list has now twice been the reason somebody could not reach a page that
 * was perfectly willing to admit them, so it is worth asserting.
 *
 * No Dashboard: it is a coordinator's overview — session counts, fairness
 * loads, what needs building — and none of it is a member's to act on. No
 * "Who is around" either: that is the planning board, and it is gated on
 * `assignSingers` in the page itself.
 *
 * PROGRAMS AND SONGS ARE PART OF THE READING SURFACE. Sailavan, 2026-08-17:
 * members "should see the programs and songs fields as well". Both pages had
 * always admitted a member — only the nav was hiding them — and they are what a
 * member wants on the night: the running order, who is singing what, and the
 * words with their meaning. Controls that are not theirs are gated where they
 * live.
 *
 * MY PITCH AND WHEN I CAN'T ARE THEIRS. Sailavan, 2026-08-20: they "should be
 * visible to member users too and they can enter data in those fields". Both
 * are about a member's OWN pitch and their OWN dates — a member is the main
 * user of each — and both already granted a member everything they need
 * (`manageOwnLearning`, `manageOwnAvailability`). Again only the nav was in the
 * way.
 */
export const MEMBER_NAV: readonly string[] = [
  "/roster",
  "/program",
  "/songs",
  "/bhajans",
  "/explore",
  "/my-list",
  "/find-my-pitch",
  "/availability",
  "/notifications",
  "/singers",
  "/guide",
];
