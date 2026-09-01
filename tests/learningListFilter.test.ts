import { describe, expect, it } from "vitest";
import { RepertoireKind } from "@prisma/client";
import {
  applyListFilter,
  daysSince,
  disagrees,
  isFiltered,
  matchesValues,
  toggleValue,
  EMPTY_FILTER,
  RECENT_DAYS,
  STALE_DAYS,
  type ListFilter,
  type ValueFilter,
} from "@/lib/learningListFilter";
import type { ListRow } from "@/lib/learningList";

/**
 * The search and filters on a singer's list.
 *
 * The theme running through most of these: MISSING IS NOT EXCLUDED. Two thirds
 * of the masterlist has no tempo and a sixth has no raga (CLAUDE.md), and a
 * singer's list is full of bhajans they have never sung, so "the field is
 * blank" is the common case rather than the odd one. A filter that quietly
 * drops those rows is worse than no filter, because nothing on screen says the
 * list is incomplete.
 */

/** Midday UTC on 2026-09-01, so every "days ago" below is a whole number. */
const NOW = Date.parse("2026-09-01T12:00:00.000Z");

function row(over: Partial<ListRow> = {}): ListRow {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Sai Ram",
    bhajanId: "b1",
    kind: RepertoireKind.known,
    note: null,
    preferredPitch: null,
    hintPitch: null,
    hintSource: null,
    deities: [],
    raga: null,
    tempo: null,
    lastSungISO: null,
    timesSung: 0,
    isFestival: false,
    updatedAtISO: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

const F = (over: Partial<ListFilter> = {}): ListFilter => ({ ...EMPTY_FILTER, ...over });

/** "only these" / "everything except these", the way the chips read. */
const only = (...values: string[]): ValueFilter => ({ values, mode: "include" });
const except = (...values: string[]): ValueFilter => ({ values, mode: "exclude" });

/** N days before NOW, as a calendar date. */
function daysAgo(n: number): string {
  return new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
}

describe("isFiltered", () => {
  it("is false for the empty filter", () => {
    expect(isFiltered(EMPTY_FILTER)).toBe(false);
  });

  it("ignores sort — reordering is not narrowing", () => {
    expect(isFiltered(F({ sort: "title" }))).toBe(false);
  });

  it("treats a whitespace-only query as no query", () => {
    expect(isFiltered(F({ query: "   " }))).toBe(false);
  });

  it("notices each of the filters", () => {
    expect(isFiltered(F({ query: "sai" }))).toBe(true);
    expect(isFiltered(F({ stages: [RepertoireKind.learning] }))).toBe(true);
    expect(isFiltered(F({ deity: only("Krishna") }))).toBe(true);
    expect(isFiltered(F({ raga: only("Kalyani / Yaman") }))).toBe(true);
    expect(isFiltered(F({ tempo: only("Medium") }))).toBe(true);
    expect(isFiltered(F({ shruti: ["missing"] }))).toBe(true);
    expect(isFiltered(F({ sung: ["never"] }))).toBe(true);
    expect(isFiltered(F({ unlinkedOnly: true }))).toBe(true);
  });

  it("ignores a mode with no values beside it", () => {
    // "Exclude nothing" is what "include everything" already means. A filter
    // that looks set and is not is worse than no filter.
    expect(isFiltered(F({ deity: { values: [], mode: "exclude" } }))).toBe(false);
  });
});

describe("stages", () => {
  const rows = [
    row({ title: "A", kind: RepertoireKind.wantToLearn }),
    row({ title: "B", kind: RepertoireKind.learning }),
    row({ title: "C", kind: RepertoireKind.known }),
  ];

  it("shows every stage when none is chosen", () => {
    expect(applyListFilter(rows, EMPTY_FILTER, NOW)).toHaveLength(3);
  });

  it("narrows to one", () => {
    const out = applyListFilter(rows, F({ stages: [RepertoireKind.learning] }), NOW);
    expect(out.map((r) => r.title)).toEqual(["B"]);
  });

  it("WIDENS as chips are added rather than intersecting", () => {
    const out = applyListFilter(
      rows,
      F({ stages: [RepertoireKind.learning, RepertoireKind.known], sort: "title" }),
      NOW,
    );
    expect(out.map((r) => r.title)).toEqual(["B", "C"]);
  });
});

describe("search", () => {
  it("matches the title, case-insensitively", () => {
    const rows = [row({ title: "Bhaja Govindam" }), row({ title: "Sai Ram" })];
    expect(applyListFilter(rows, F({ query: "GOVIND" }), NOW).map((r) => r.title)).toEqual([
      "Bhaja Govindam",
    ]);
  });

  it("searches the note, the raga, the tempo and the deities too", () => {
    const rows = [
      row({ title: "One", note: "taught by Jothsna" }),
      row({ title: "Two", raga: "Kalyani / Yaman" }),
      row({ title: "Three", tempo: "Medium Slow" }),
      row({ title: "Four", deities: ["Ganesha"] }),
      row({ title: "Five" }),
    ];
    expect(applyListFilter(rows, F({ query: "jothsna" }), NOW)).toHaveLength(1);
    expect(applyListFilter(rows, F({ query: "yaman" }), NOW)).toHaveLength(1);
    expect(applyListFilter(rows, F({ query: "medium" }), NOW)).toHaveLength(1);
    expect(applyListFilter(rows, F({ query: "ganesha" }), NOW)).toHaveLength(1);
  });

  it("does not trip over a row with nothing but a title", () => {
    expect(applyListFilter([row({ title: "Bare" })], F({ query: "bare" }), NOW)).toHaveLength(1);
  });
});

describe("deity, raga and tempo — missing is not excluded by default", () => {
  const rows = [
    row({ title: "Has", raga: "Bhairavi", tempo: "Medium", deities: ["Krishna", "Sai"] }),
    row({ title: "Blank" }),
  ];

  it("keeps a row with no raga when no raga is asked for", () => {
    expect(applyListFilter(rows, EMPTY_FILTER, NOW)).toHaveLength(2);
  });

  it("excludes a blank row only when that field is being filtered on", () => {
    expect(applyListFilter(rows, F({ raga: only("Bhairavi") }), NOW).map((r) => r.title)).toEqual([
      "Has",
    ]);
    expect(applyListFilter(rows, F({ tempo: only("Medium") }), NOW).map((r) => r.title)).toEqual([
      "Has",
    ]);
    expect(applyListFilter(rows, F({ deity: only("Sai") }), NOW).map((r) => r.title)).toEqual([
      "Has",
    ]);
  });

  it("matches any one of a bhajan's deities, not just the first", () => {
    expect(applyListFilter(rows, F({ deity: only("Krishna") }), NOW)).toHaveLength(1);
    expect(applyListFilter(rows, F({ deity: only("Sai") }), NOW)).toHaveLength(1);
  });
});

/**
 * Multi-select, and the two modes. The asymmetry is the point: a row with the
 * field BLANK passes an exclusion and fails an inclusion, because "does not have
 * Bhairavi" is true of a bhajan with no raga and "has Bhairavi" is not.
 */
describe("only / except", () => {
  const rows = [
    row({ title: "Krishna", deities: ["Krishna"], raga: "Bhairavi", tempo: "Fast" }),
    row({ title: "Rama", deities: ["Rama"], raga: "Kalyani / Yaman", tempo: "Medium" }),
    row({ title: "Ganesha", deities: ["Ganesha"], raga: "Hamsadhwani", tempo: "Medium" }),
    row({ title: "Blank" }),
  ];

  it("keeps any of several chosen values", () => {
    const out = applyListFilter(rows, F({ deity: only("Krishna", "Rama"), sort: "title" }), NOW);
    expect(out.map((r) => r.title)).toEqual(["Krishna", "Rama"]);
  });

  it("reads the same chips the other way round", () => {
    const out = applyListFilter(rows, F({ deity: except("Krishna", "Rama"), sort: "title" }), NOW);
    // Ganesha, and the blank row — which has no Krishna and no Rama.
    expect(out.map((r) => r.title)).toEqual(["Blank", "Ganesha"]);
  });

  it("KEEPS rows with the field blank under an exclusion", () => {
    // 565 of the masterlist's bhajans have no raga at all. "Everything except
    // Bhairavi" that dropped all of them would be a filter nobody could trust.
    const out = applyListFilter(rows, F({ raga: except("Bhairavi"), sort: "title" }), NOW);
    expect(out.map((r) => r.title)).toContain("Blank");
    expect(out.map((r) => r.title)).not.toContain("Krishna");
  });

  it("drops rows with the field blank under an inclusion", () => {
    const out = applyListFilter(rows, F({ raga: only("Bhairavi") }), NOW);
    expect(out.map((r) => r.title)).toEqual(["Krishna"]);
  });

  it("matches a bhajan carrying several deities against either mode", () => {
    const multi = [row({ title: "Both", deities: ["Krishna", "Sai"] })];
    expect(applyListFilter(multi, F({ deity: only("Sai") }), NOW)).toHaveLength(1);
    // Excluding EITHER of its deities excludes it — it is a Krishna bhajan.
    expect(applyListFilter(multi, F({ deity: except("Krishna") }), NOW)).toHaveLength(0);
  });

  it("is the identity when nothing is chosen, whichever mode is set", () => {
    expect(applyListFilter(rows, F({ deity: { values: [], mode: "exclude" } }), NOW)).toHaveLength(4);
    expect(matchesValues(["Krishna"], { values: [], mode: "exclude" })).toBe(true);
  });
});

describe("toggleValue", () => {
  it("adds, removes, and keeps the order chips are drawn in", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(toggleValue([], "a")).toEqual(["a"]);
  });
});

describe("not in the masterlist", () => {
  const rows = [row({ title: "Linked", bhajanId: "b1" }), row({ title: "Free text", bhajanId: null })];

  it("finds the entries that never resolved", () => {
    expect(applyListFilter(rows, F({ unlinkedOnly: true }), NOW).map((r) => r.title)).toEqual([
      "Free text",
    ]);
  });
});

describe("shruti", () => {
  const saved = row({ title: "Saved", preferredPitch: "2 Pancham / D", hintPitch: "2 Pancham / D" });
  const missing = row({ title: "Missing", preferredPitch: null, hintPitch: "3 Madhyam / F" });
  const moved = row({ title: "Moved", preferredPitch: "2 Pancham / D", hintPitch: "3 Pancham / D#" });
  const neither = row({ title: "Neither", preferredPitch: null, hintPitch: null });
  const rows = [saved, missing, moved, neither];

  it("finds the saved ones", () => {
    expect(applyListFilter(rows, F({ shruti: ["saved"], sort: "title" }), NOW).map((r) => r.title)).toEqual([
      "Moved",
      "Saved",
    ]);
  });

  it("finds the ones not set yet", () => {
    expect(
      applyListFilter(rows, F({ shruti: ["missing"], sort: "title" }), NOW).map((r) => r.title),
    ).toEqual(["Missing", "Neither"]);
  });

  it("finds only a saved shruti that disagrees with the suggestion", () => {
    expect(applyListFilter(rows, F({ shruti: ["disagrees"] }), NOW).map((r) => r.title)).toEqual([
      "Moved",
    ]);
  });

  it("does not call a row with no suggestion a disagreement", () => {
    // Nothing to disagree WITH. This is the row that would wrongly appear if
    // the check were written as `preferred !== hint`.
    expect(disagrees(row({ preferredPitch: "2 Pancham / D", hintPitch: null }))).toBe(false);
    expect(disagrees(row({ preferredPitch: null, hintPitch: "2 Pancham / D" }))).toBe(false);
  });
});

describe("last sung", () => {
  const never = row({ title: "Never", lastSungISO: null });
  const fresh = row({ title: "Fresh", lastSungISO: daysAgo(3) });
  const edgeRecent = row({ title: "Edge", lastSungISO: daysAgo(RECENT_DAYS) });
  const old = row({ title: "Old", lastSungISO: daysAgo(STALE_DAYS + 1) });
  const rows = [never, fresh, edgeRecent, old];

  it("counts days from a calendar date", () => {
    expect(daysSince(daysAgo(7), NOW)).toBe(7);
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince("not-a-date", NOW)).toBeNull();
  });

  it("finds what has never been sung", () => {
    expect(applyListFilter(rows, F({ sung: ["never"] }), NOW).map((r) => r.title)).toEqual(["Never"]);
  });

  it("includes the boundary day in 'recently'", () => {
    const out = applyListFilter(rows, F({ sung: ["recent"], sort: "title" }), NOW);
    expect(out.map((r) => r.title)).toEqual(["Edge", "Fresh"]);
  });

  it("EXCLUDES never-sung from both 'recently' and 'a while ago'", () => {
    // The one that matters. A bhajan with no date answers neither question, and
    // sorting it as "very old" would put a whole list of things you have not
    // started under "not sung in 6 months".
    expect(applyListFilter(rows, F({ sung: ["recent"] }), NOW).map((r) => r.title)).not.toContain(
      "Never",
    );
    expect(applyListFilter(rows, F({ sung: ["stale"] }), NOW).map((r) => r.title)).toEqual(["Old"]);
  });
});

describe("state filters read as OR", () => {
  it("finds shrutis that need attention: not set yet OR disagreeing", () => {
    const rows = [
      row({ title: "Fine", preferredPitch: "2 Pancham / D", hintPitch: "2 Pancham / D" }),
      row({ title: "Unset", preferredPitch: null }),
      row({ title: "Moved", preferredPitch: "2 Pancham / D", hintPitch: "3 Pancham / D#" }),
    ];
    const out = applyListFilter(rows, F({ shruti: ["missing", "disagrees"], sort: "title" }), NOW);
    expect(out.map((r) => r.title)).toEqual(["Moved", "Unset"]);
  });

  it("finds what is going cold: never sung OR not in six months", () => {
    const rows = [
      row({ title: "Never", lastSungISO: null }),
      row({ title: "Fresh", lastSungISO: daysAgo(5) }),
      row({ title: "Old", lastSungISO: daysAgo(STALE_DAYS + 30) }),
      // The gap between the two buckets — belongs to neither, and must not be
      // swept into either.
      row({ title: "Middle", lastSungISO: daysAgo(RECENT_DAYS + 20) }),
    ];
    const out = applyListFilter(rows, F({ sung: ["never", "stale"], sort: "title" }), NOW);
    expect(out.map((r) => r.title)).toEqual(["Never", "Old"]);
  });
});

describe("sorting", () => {
  it("puts never-sung last under 'last sung', whichever end it starts at", () => {
    const rows = [
      row({ title: "Never", lastSungISO: null }),
      row({ title: "Older", lastSungISO: "2026-01-01" }),
      row({ title: "Newer", lastSungISO: "2026-08-01" }),
      row({ title: "AlsoNever", lastSungISO: null }),
    ];
    expect(applyListFilter(rows, F({ sort: "lastSung" }), NOW).map((r) => r.title)).toEqual([
      "Newer",
      "Older",
      // Ties among the undated fall back to the title.
      "AlsoNever",
      "Never",
    ]);
  });

  it("sorts by title, by most sung, and by recently changed", () => {
    const rows = [
      row({ title: "Beta", timesSung: 1, updatedAtISO: "2026-08-30T00:00:00.000Z" }),
      row({ title: "Alpha", timesSung: 9, updatedAtISO: "2026-08-01T00:00:00.000Z" }),
    ];
    expect(applyListFilter(rows, F({ sort: "title" }), NOW).map((r) => r.title)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(applyListFilter(rows, F({ sort: "mostSung" }), NOW).map((r) => r.title)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(applyListFilter(rows, F({ sort: "recent" }), NOW).map((r) => r.title)).toEqual([
      "Beta",
      "Alpha",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [row({ title: "B" }), row({ title: "A" })];
    const before = rows.map((r) => r.title);
    applyListFilter(rows, F({ sort: "title" }), NOW);
    expect(rows.map((r) => r.title)).toEqual(before);
  });
});

describe("filters combine", () => {
  it("narrows on every axis at once", () => {
    const rows = [
      row({
        title: "Wanted Krishna, never sung",
        kind: RepertoireKind.wantToLearn,
        deities: ["Krishna"],
        lastSungISO: null,
      }),
      row({
        title: "Wanted Krishna, sung",
        kind: RepertoireKind.wantToLearn,
        deities: ["Krishna"],
        lastSungISO: daysAgo(10),
      }),
      row({ title: "Known Krishna", kind: RepertoireKind.known, deities: ["Krishna"] }),
    ];
    const out = applyListFilter(
      rows,
      F({ stages: [RepertoireKind.wantToLearn], deity: only("Krishna"), sung: ["never"] }),
      NOW,
    );
    expect(out.map((r) => r.title)).toEqual(["Wanted Krishna, never sung"]);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(applyListFilter([row()], F({ deity: only("Hanuman") }), NOW)).toEqual([]);
  });
});
