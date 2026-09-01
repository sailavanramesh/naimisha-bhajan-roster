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
 * EVERY FILTER IS MULTI-SELECT. Sailavan, 2026-09-01: "filters should be
 * multi-select, include/exclude bit like the fairness and main bhajan or build a
 * session page." One value at a time cannot ask the question somebody actually
 * has of a list this size — "the Krishna and Rama ones", or "everything that is
 * not Bhairavi" — and naming the other forty ragas is the same question asked
 * badly.
 *
 * The value filters (deity, raga, tempo) carry a MODE as well, exactly as
 * fairness does: the same set of choices read either way round, "only these" or
 * "everything except these". The two state filters — your shruti, last sung —
 * are multi-select but have NO mode, on the same reasoning that left fairness's
 * part-of-day alone: with three named buckets, "except this one" is just the
 * other two, and a control that adds nothing is a control to read.
 *
 * It runs in the browser over rows the server already sent. One person's list is
 * a few hundred rows at most and is already on the page, so a round trip per
 * keystroke would be slower and noisier for no benefit.
 */

/** Whether the chosen values are the ones kept, or the ones left out. */
export type FilterMode = "include" | "exclude";

/** A multi-select over values a bhajan carries: deity, raga, tempo. */
export type ValueFilter = { values: string[]; mode: FilterMode };

export type ShrutiState = "saved" | "missing" | "disagrees";
export type SungState = "never" | "recent" | "stale";
export type SortKey = "recent" | "title" | "lastSung" | "mostSung";

/** Inside this many days counts as "sung recently"; beyond the second, "a while ago". */
export const RECENT_DAYS = 90;
export const STALE_DAYS = 180;

export type ListFilter = {
  query: string;
  /** Empty means every stage, not none. */
  stages: RepertoireKind[];
  deity: ValueFilter;
  raga: ValueFilter;
  tempo: ValueFilter;
  /** Empty means any. Several read as "or". */
  shruti: ShrutiState[];
  sung: SungState[];
  unlinkedOnly: boolean;
  sort: SortKey;
};

export const ANY_VALUES: ValueFilter = { values: [], mode: "include" };

export const EMPTY_FILTER: ListFilter = {
  query: "",
  stages: [],
  deity: ANY_VALUES,
  raga: ANY_VALUES,
  tempo: ANY_VALUES,
  shruti: [],
  sung: [],
  unlinkedOnly: false,
  sort: "recent",
};

/**
 * Add or remove one value, keeping the order the chips are drawn in.
 *
 * What makes a row of chips behave like a set of checkboxes.
 */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((x) => x !== value) : [...values, value];
}

/**
 * Is anything narrowing the list?
 *
 * Sort is excluded on purpose: reordering is not filtering, and a "Clear" that
 * also threw away your chosen order would be a surprise. So is a MODE with no
 * values beside it — "exclude nothing" is what "include everything" already
 * means, and a filter that looks set and is not is worse than no filter.
 */
export function isFiltered(f: ListFilter): boolean {
  return (
    f.query.trim() !== "" ||
    f.stages.length > 0 ||
    f.deity.values.length > 0 ||
    f.raga.values.length > 0 ||
    f.tempo.values.length > 0 ||
    f.shruti.length > 0 ||
    f.sung.length > 0 ||
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

/**
 * Does a row's values pass a value filter?
 *
 * A row carrying NONE of the chosen values passes an exclusion — which is what
 * makes "everything except Bhairavi" keep the 565 bhajans with no raga recorded
 * at all. Under an inclusion the same row is dropped, because it does not have
 * what was asked for. Both are the honest reading, and they are not symmetric.
 */
export function matchesValues(rowValues: readonly string[], f: ValueFilter): boolean {
  if (f.values.length === 0) return true;
  const hit = rowValues.some((v) => f.values.includes(v));
  return f.mode === "include" ? hit : !hit;
}

function shrutiIs(row: ListRow, state: ShrutiState): boolean {
  switch (state) {
    case "saved":
      return Boolean(row.preferredPitch);
    case "missing":
      return !row.preferredPitch;
    /*
     * "Disagrees" is the one worth having. A saved shruti that no longer matches
     * the suggestion is usually either a voice that has moved since it was set,
     * or a value saved in a hurry — and there is no other way to find those
     * without opening every card. A row with no suggestion at all cannot
     * disagree with one, so it is not a match rather than being assumed to be.
     */
    case "disagrees":
      return disagrees(row);
  }
}

function sungIs(row: ListRow, state: SungState, now: number): boolean {
  const days = daysSince(row.lastSungISO, now);
  switch (state) {
    case "never":
      return days === null;
    /*
     * "Recently" and "a while ago" are both claims about a date. A bhajan never
     * sung has no date, so it answers neither — it belongs only to "never".
     */
    case "recent":
      return days !== null && days <= RECENT_DAYS;
    case "stale":
      return days !== null && days > STALE_DAYS;
  }
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

    if (!matchesValues(row.deities, f.deity)) return false;
    if (!matchesValues(row.raga ? [row.raga] : [], f.raga)) return false;
    if (!matchesValues(row.tempo ? [row.tempo] : [], f.tempo)) return false;

    if (f.unlinkedOnly && row.bhajanId) return false;

    // Several states read as "or" — "not set yet OR disagrees" is one question:
    // which shrutis need attention.
    if (f.shruti.length > 0 && !f.shruti.some((s) => shrutiIs(row, s))) return false;
    if (f.sung.length > 0 && !f.sung.some((s) => sungIs(row, s, now))) return false;

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
