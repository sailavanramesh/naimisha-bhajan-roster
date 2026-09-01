import type { RepertoireKind } from "@prisma/client";
import type { ListRow } from "@/lib/learningList";

/**
 * lib/learningListFilter.ts — what the search box and the filters actually mean.
 *
 * Pure, and separate from the view for the usual reason: the interesting parts
 * are the edges, and none of them are visible in a browser. A bhajan with no
 * raga against a raga filter, one never sung against "not in 6 months", a saved
 * shruti with no suggestion to disagree with, a sort where half the rows have no
 * date to sort by. Every one of those is a row that must not silently vanish —
 * see CLAUDE.md: "Missing ≠ excluded. A filter must never silently drop bhajans
 * that simply lack that field."
 *
 * It runs in the browser over rows the server already sent. One person's list is
 * a few hundred rows at most and is already on the page, so a round trip per
 * keystroke would be slower and noisier for no benefit.
 */

export type ShrutiFilter = "any" | "saved" | "missing" | "disagrees";
export type SungFilter = "any" | "never" | "recent" | "stale";
export type SortKey = "recent" | "title" | "lastSung" | "mostSung";

/** Inside this many days counts as "sung recently"; beyond the second, "a while ago". */
export const RECENT_DAYS = 90;
export const STALE_DAYS = 180;

export type ListFilter = {
  query: string;
  /** Empty means every stage, not none — see `matchesStage`. */
  stages: RepertoireKind[];
  deity: string;
  raga: string;
  tempo: string;
  shruti: ShrutiFilter;
  sung: SungFilter;
  unlinkedOnly: boolean;
  sort: SortKey;
};

export const EMPTY_FILTER: ListFilter = {
  query: "",
  stages: [],
  deity: "",
  raga: "",
  tempo: "",
  shruti: "any",
  sung: "any",
  unlinkedOnly: false,
  sort: "recent",
};

/**
 * Is anything narrowing the list?
 *
 * Sort is excluded on purpose: reordering is not filtering, and a "Clear" that
 * also threw away your chosen order would be a surprise.
 */
export function isFiltered(f: ListFilter): boolean {
  return (
    f.query.trim() !== "" ||
    f.stages.length > 0 ||
    f.deity !== "" ||
    f.raga !== "" ||
    f.tempo !== "" ||
    f.shruti !== "any" ||
    f.sung !== "any" ||
    f.unlinkedOnly
  );
}

/**
 * Whole days since an ISO calendar date, or null if there is no date.
 *
 * Read at midday UTC so that a date is the same number of days ago from either
 * side of the international date line — the dates in question are calendar dates
 * at the venue, not moments (CLAUDE.md).
 */
export function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const then = Date.parse(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / 86_400_000);
}

/** A saved shruti that no longer matches what the app would suggest. */
export function disagrees(row: ListRow): boolean {
  return Boolean(row.preferredPitch && row.hintPitch && row.preferredPitch !== row.hintPitch);
}

/** Everything the search box looks at. The note is included: people write down
 *  where they heard a bhajan, and that is a real way to find it again. */
function haystack(row: ListRow): string {
  return [row.title, row.note ?? "", row.raga ?? "", row.tempo ?? "", ...row.deities]
    .join(" ")
    .toLowerCase();
}

export function applyListFilter(
  rows: readonly ListRow[],
  f: ListFilter,
  now: number = Date.now(),
): ListRow[] {
  const q = f.query.trim().toLowerCase();

  const kept = rows.filter((row) => {
    // No stages chosen means every stage. Chips widen as you add them.
    if (f.stages.length > 0 && !f.stages.includes(row.kind)) return false;
    if (f.deity && !row.deities.includes(f.deity)) return false;
    if (f.raga && row.raga !== f.raga) return false;
    if (f.tempo && row.tempo !== f.tempo) return false;
    if (f.unlinkedOnly && row.bhajanId) return false;

    if (f.shruti === "saved" && !row.preferredPitch) return false;
    if (f.shruti === "missing" && row.preferredPitch) return false;
    /*
     * "Disagrees" is the one worth having. A saved shruti that no longer matches
     * the suggestion is usually either a voice that has moved since it was set,
     * or a value saved in a hurry — and there is no other way to find those
     * without opening every card. A row with no suggestion at all cannot
     * disagree with one, so it is not a match rather than being assumed to be.
     */
    if (f.shruti === "disagrees" && !disagrees(row)) return false;

    if (f.sung !== "any") {
      const days = daysSince(row.lastSungISO, now);
      if (f.sung === "never" && days !== null) return false;
      // "Recently" and "a while ago" are both claims about a date. A bhajan
      // never sung has no date, so it answers neither — it belongs only to
      // "never", which is why both of these require a date.
      if (f.sung === "recent" && (days === null || days > RECENT_DAYS)) return false;
      if (f.sung === "stale" && (days === null || days <= STALE_DAYS)) return false;
    }

    if (q && !haystack(row).includes(q)) return false;
    return true;
  });

  const byTitle = (a: ListRow, b: ListRow) => a.title.localeCompare(b.title);

  return kept.sort((a, b) => {
    switch (f.sort) {
      case "title":
        return byTitle(a, b);
      case "lastSung":
        /*
         * Never sung sinks to the bottom rather than sorting as "very old". It
         * is a different answer, not an extreme value — and a list of things you
         * have not sung yet, ordered as though you sang them in 1970, is a list
         * that has lied about its own order.
         */
        if (!a.lastSungISO && !b.lastSungISO) return byTitle(a, b);
        if (!a.lastSungISO) return 1;
        if (!b.lastSungISO) return -1;
        return b.lastSungISO.localeCompare(a.lastSungISO) || byTitle(a, b);
      case "mostSung":
        return b.timesSung - a.timesSung || byTitle(a, b);
      default:
        // Recently changed. ISO strings compare correctly as strings.
        return b.updatedAtISO.localeCompare(a.updatedAtISO) || byTitle(a, b);
    }
  });
}
