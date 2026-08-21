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

/* ------------------------------------------------------------------------- *
 * The shape of the menu.
 *
 * Sailavan, 2026-08-21: "let's organise the nav menu a bit more. Things like
 * roster should be visible without being buried in a sub menu, my list, my
 * pitch, guide, explore. the rest can be in sub menus."
 *
 * It was seventeen items in one flat column, in no particular order beyond the
 * order they were built in, so the roster and the admin screen were the same
 * size and the same distance away. Now the pages somebody opens the app FOR sit
 * at the top level and everything else is behind a heading you can expand.
 *
 * Programs is up there too, unasked: the running order is the other thing read
 * on the night, and it is one of the two pages a member lands on from a
 * notification.
 *
 * Guide stays LAST and visible to everybody — see app/guide/page.tsx. It is the
 * page you send somebody who has just been given the link, and it has been last
 * since it was written.
 *
 * It lives here rather than in components/Nav.tsx for the same reason MEMBER_NAV
 * does: it is policy about who sees what, and a test cannot import it from a
 * file full of JSX.
 * ------------------------------------------------------------------------- */

/** One link. `short` is the glyph shown when the sidebar is collapsed to a rail. */
export type NavLeaf = { href: string; label: string; short: string };

/** A heading with links under it. Never itself a destination. */
export type NavGroup = { label: string; short: string; children: readonly NavLeaf[] };

export type NavEntry = NavLeaf | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

export const NAV_TREE: readonly NavEntry[] = [
  { href: "/roster", label: "Roster", short: "R" },
  { href: "/program", label: "Programs", short: "♫" },
  { href: "/my-list", label: "My list", short: "♪" },
  { href: "/find-my-pitch", label: "My pitch", short: "♯" },
  { href: "/explore", label: "Explore", short: "?" },
  {
    label: "Words & music",
    short: "♬",
    children: [
      { href: "/songs", label: "Songs", short: "♬" },
      { href: "/bhajans", label: "Bhajans", short: "B" },
    ],
  },
  {
    label: "Me",
    short: "✓",
    children: [
      { href: "/availability", label: "When I can't", short: "✗" },
      { href: "/notifications", label: "Alerts", short: "!" },
    ],
  },
  {
    label: "People",
    short: "S",
    children: [
      { href: "/singers", label: "Singers", short: "S" },
      // Coordinators only, by omission from MEMBER_NAV. A planning view reached
      // solely by a link from another page is a planning view nobody finds.
      { href: "/availability/team", label: "Who's around", short: "◫" },
      { href: "/fairness", label: "Fairness", short: "≡" },
    ],
  },
  {
    label: "Coordinating",
    short: "⚙",
    children: [
      { href: "/build", label: "Build", short: "+" },
      /*
       * The dashboard is in here rather than at the top level, at Sailavan's
       * request: "Dashboard at this stage can be hidden from editors as well,
       * or put in a sub menu. its not being used too much." A sub menu rather
       * than deleted — the counts and the what-needs-building list are still
       * the only place some of that is answered.
       */
      { href: "/dashboard", label: "Dashboard", short: "D" },
      { href: "/admin", label: "Admin", short: "⚙" },
    ],
  },
  { href: "/guide", label: "Guide", short: "i" },
];

/**
 * The menu as one role sees it.
 *
 * Editors and owners see all of it. Everybody else sees the leaves in
 * MEMBER_NAV, and a group whose children have all been filtered out disappears
 * with them.
 *
 * A GROUP LEFT WITH ONE CHILD BECOMES THAT CHILD. Otherwise a member gets a
 * heading called "People" that expands to reveal a single link — a fold with
 * nothing folded into it, which is worse than the flat list this replaces.
 */
export function navFor(role: string): readonly NavEntry[] {
  const all = role === "editor" || role === "owner";
  const allowed = (leaf: NavLeaf) => all || MEMBER_NAV.includes(leaf.href);

  const out: NavEntry[] = [];
  for (const entry of NAV_TREE) {
    if (!isNavGroup(entry)) {
      if (allowed(entry)) out.push(entry);
      continue;
    }
    const children = entry.children.filter(allowed);
    if (children.length === 0) continue;
    if (children.length === 1) out.push(children[0]);
    else out.push({ ...entry, children });
  }
  return out;
}

/** Every link in a tree, groups flattened — what the collapsed rail shows. */
export function navLeaves(tree: readonly NavEntry[]): readonly NavLeaf[] {
  return tree.flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
}

/**
 * Which link is the current page.
 *
 * THE LONGEST MATCHING PREFIX WINS, not the first one listed. `/availability`
 * and `/availability/team` are both prefixes of the planning board's URL, so
 * whichever came first in the array used to light up — and the array's order is
 * about how the menu reads, which is no business of this.
 */
export function activeHrefIn(tree: readonly NavEntry[], pathname: string | null): string | null {
  const path = pathname ?? "";
  let best: string | null = null;
  for (const leaf of navLeaves(tree)) {
    if (leaf.href === path) return leaf.href;
    if (path.startsWith(`${leaf.href}/`) && (best === null || leaf.href.length > best.length)) {
      best = leaf.href;
    }
  }
  return best;
}

/** The group a link sits in, if any — used to open the right fold on arrival. */
export function groupContaining(tree: readonly NavEntry[], href: string | null): string | null {
  if (!href) return null;
  for (const entry of tree) {
    if (isNavGroup(entry) && entry.children.some((c) => c.href === href)) return entry.label;
  }
  return null;
}
