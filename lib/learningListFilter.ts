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

/* ── The filter, written down ──────────────────────────────────────────────
 *
 * Sailavan, 2026-09-13: "If I click a bhajan and return to that page filters
 * don't hold. They should."
 *
 * They did not hold because the whole filter lived in `useState` inside the
 * view, and opening a bhajan unmounts the view. Nine choices — a search, the
 * stage chips, three multi-selects with their Only/Except modes, two state
 * filters and a sort — all thrown away for the sake of checking one raga, and
 * the list you had cut down to eleven rows came back at ninety.
 *
 * So the filter goes in the URL, which is where this app already keeps the
 * answer to exactly this problem. components/BackLink.tsx says it plainly: the
 * bhajan list's "search and the deity filter ... were sitting in the URL a
 * moment before", and that is why Back works there. The same trick, the same
 * reasoning, and two things come free with it: a filtered list can be sent to
 * somebody or bookmarked, and components/KeepScroll.tsx — which keys on the url
 * INCLUDING the query — can tell one filtered list from another.
 *
 * Only what is set is written. A URL carrying every default is a URL nobody can
 * read, and "sort=recent&catmode=include" says nothing that the absence of it
 * does not already say. Same rule fairness follows.
 *
 * TWO ENCODINGS, on purpose:
 *
 *   - the fixed vocabularies (stage, shruti, sung) are comma-joined, as
 *     lib/fairnessFilters.ts joins category ids. Every value is a token we
 *     wrote ourselves, so a comma cannot appear inside one.
 *
 *   - deity, raga and tempo REPEAT the key instead, because their values come
 *     out of the catalogue rather than out of this file. A raga called
 *     "Shankarabharanam, Hamsadhwani" would split into two ragas that match
 *     nothing, and silently — the worst way for a filter to fail.
 *
 * Anything unrecognised is dropped rather than honoured: a hand-edited or
 * half-truncated URL should give you the list, not an empty page.
 */

/** The three stages this list shows. `festival` is not one; see the schema. */
const STAGE_KEYS = ["wantToLearn", "learning", "known"] as const;
const SHRUTI_KEYS: readonly ShrutiState[] = ["saved", "missing", "disagrees"];
const SUNG_KEYS: readonly SungState[] = ["never", "recent", "stale"];
const SORT_KEYS: readonly SortKey[] = ["recent", "title", "lastSung", "mostSung"];

/**
 * Every key this filter owns, so the view can rewrite its own and leave
 * anything else in the URL alone.
 */
export const FILTER_PARAM_KEYS = [
  "q",
  "stage",
  "deity",
  "deitymode",
  "raga",
  "ragamode",
  "tempo",
  "tempomode",
  "shruti",
  "sung",
  "unlinked",
  "sort",
  "filters",
] as const;

/**
 * What we need off a query string — `URLSearchParams`, and Next's readonly
 * version of it, both satisfy this without the lib importing either.
 */
export type ReadableParams = {
  get(name: string): string | null;
  getAll(name: string): string[];
};

/** Keep only the values from a known vocabulary, in the order given, no repeats. */
function keepKnown<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim() as T;
    if (allowed.includes(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

function writeValues(params: URLSearchParams, name: string, filter: ValueFilter): void {
  // No values means no filter, whatever the mode says — so the mode is not
  // worth writing either. See isFiltered.
  if (filter.values.length === 0) return;
  for (const value of filter.values) params.append(name, value);
  if (filter.mode === "exclude") params.set(`${name}mode`, "exclude");
}

function readValues(params: ReadableParams, name: string): ValueFilter {
  const values = params.getAll(name).filter((v) => v !== "");
  if (values.length === 0) return ANY_VALUES;
  return {
    values,
    mode: params.get(`${name}mode`) === "exclude" ? "exclude" : "include",
  };
}

/**
 * The filter as a query string — "" when nothing is set.
 *
 * The empty string matters: it is what lets the view put the bare path back in
 * the address bar rather than a lonely "?".
 */
export function filterToQuery(filter: ListFilter): string {
  const params = new URLSearchParams();

  const query = filter.query.trim();
  if (query !== "") params.set("q", filter.query);
  if (filter.stages.length > 0) params.set("stage", filter.stages.join(","));
  writeValues(params, "deity", filter.deity);
  writeValues(params, "raga", filter.raga);
  writeValues(params, "tempo", filter.tempo);
  if (filter.shruti.length > 0) params.set("shruti", filter.shruti.join(","));
  if (filter.sung.length > 0) params.set("sung", filter.sung.join(","));
  if (filter.unlinkedOnly) params.set("unlinked", "1");
  // Sort is not a filter, but it is a choice, and coming back to somebody
  // else's default order is the same surprise as coming back unfiltered.
  if (filter.sort !== EMPTY_FILTER.sort) params.set("sort", filter.sort);

  return params.toString();
}

/** The filter a query string is asking for, defaults for everything it omits. */
export function filterFromQuery(params: ReadableParams): ListFilter {
  const sort = params.get("sort") as SortKey | null;

  return {
    query: params.get("q") ?? EMPTY_FILTER.query,
    stages: keepKnown(params.get("stage"), STAGE_KEYS) as ListFilter["stages"],
    deity: readValues(params, "deity"),
    raga: readValues(params, "raga"),
    tempo: readValues(params, "tempo"),
    shruti: keepKnown(params.get("shruti"), SHRUTI_KEYS),
    sung: keepKnown(params.get("sung"), SUNG_KEYS),
    unlinkedOnly: params.get("unlinked") === "1",
    sort: sort && SORT_KEYS.includes(sort) ? sort : EMPTY_FILTER.sort,
  };
}


/* ── The filter panel, open or shut ────────────────────────────────────────
 *
 * Sailavan, 2026-09-13: "it comes back with the filters expanded, even if I've
 * collapsed them before clicking on an individual bhajan. it should come back
 * with the filters collapsed."
 *
 * The panel was the one thing on the toolbar still being GUESSED at rather than
 * remembered — it came back open whenever anything inside it was set, which is
 * a fair guess for a link somebody sends you and the wrong answer for the page
 * you were just on. You chose to shut it; that is not a guess to improve on.
 *
 * So it is remembered, and the guess survives only where there is nothing to
 * remember: a link from somebody else, or a bookmark older than this. Which is
 * also why the key is written only when it DISAGREES with the guess — a plain
 * unfiltered list carries no "filters=0", and a link with filters in it opens
 * the panel without anyone having to say so.
 */

/** Everything in the panel; the stage chips and the search sit outside it. */
function panelHasSomethingSet(filter: ListFilter): boolean {
  return (
    filter.deity.values.length > 0 ||
    filter.raga.values.length > 0 ||
    filter.tempo.values.length > 0 ||
    filter.shruti.length > 0 ||
    filter.sung.length > 0 ||
    filter.unlinkedOnly
  );
}

/**
 * Open or shut, for a url that does not say.
 *
 * A closed panel with a small "3" on the button means the list is cut down by
 * things you cannot see, which is fine when you shut it yourself and unhelpful
 * when you have just been handed the link.
 */
export function panelStartsOpen(filter: ListFilter): boolean {
  return panelHasSomethingSet(filter);
}

/** What the url says, or the guess where it says nothing. */
export function panelFromQuery(params: ReadableParams, filter: ListFilter): boolean {
  const said = params.get("filters");
  if (said === "1") return true;
  if (said === "0") return false;
  return panelStartsOpen(filter);
}

/** `null` where the guess already gets it right, and nothing need be written. */
export function panelToQuery(open: boolean, filter: ListFilter): string | null {
  if (open === panelStartsOpen(filter)) return null;
  return open ? "1" : "0";
}
