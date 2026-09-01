import { describe, expect, it } from "vitest";
import { RepertoireKind } from "@prisma/client";
import {
  applyListFilter,
  daysSince,
  disagrees,
  isFiltered,
  EMPTY_FILTER,
  RECENT_DAYS,
  STALE_DAYS,
  type ListFilter,
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
    expect(isFiltered(F({ deity: "Krishna" }))).toBe(true);
    expect(isFiltered(F({ raga: "Kalyani / Yaman" }))).toBe(true);
    expect(isFiltered(F({ tempo: "Medium" }))).toBe(true);
    expect(isFiltered(F({ shruti: "missing" }))).toBe(true);
    expect(isFiltered(F({ sung: "never" }))).toBe(true);
    expect(isFiltered(F({ unlinkedOnly: true }))).toBe(true);
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
    expect(applyListFilter(rows, F({ raga: "Bhairavi" }), NOW).map((r) => r.title)).toEqual(["Has"]);
    expect(applyListFilter(rows, F({ tempo: "Medium" }), NOW).map((r) => r.title)).toEqual(["Has"]);
    expect(applyListFilter(rows, F({ deity: "Sai" }), NOW).map((r) => r.title)).toEqual(["Has"]);
  });

  it("matches any one of a bhajan's deities, not just the first", () => {
    expect(applyListFilter(rows, F({ deity: "Krishna" }), NOW)).toHaveLength(1);
    expect(applyListFilter(rows, F({ deity: "Sai" }), NOW)).toHaveLength(1);
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
    expect(applyListFilter(rows, F({ shruti: "saved", sort: "title" }), NOW).map((r) => r.title)).toEqual([
      "Moved",
      "Saved",
    ]);
  });

  it("finds the ones not set yet", () => {
    expect(
      applyListFilter(rows, F({ shruti: "missing", sort: "title" }), NOW).map((r) => r.title),
    ).toEqual(["Missing", "Neither"]);
  });

  it("finds only a saved shruti that disagrees with the suggestion", () => {
    expect(applyListFilter(rows, F({ shruti: "disagrees" }), NOW).map((r) => r.title)).toEqual([
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
    expect(applyListFilter(rows, F({ sung: "never" }), NOW).map((r) => r.title)).toEqual(["Never"]);
  });

  it("includes the boundary day in 'recently'", () => {
    const out = applyListFilter(rows, F({ sung: "recent", sort: "title" }), NOW);
    expect(out.map((r) => r.title)).toEqual(["Edge", "Fresh"]);
  });

  it("EXCLUDES never-sung from both 'recently' and 'a while ago'", () => {
    // The one that matters. A bhajan with no date answers neither question, and
    // sorting it as "very old" would put a whole list of things you have not
    // started under "not sung in 6 months".
    expect(applyListFilter(rows, F({ sung: "recent" }), NOW).map((r) => r.title)).not.toContain(
      "Never",
    );
    expect(applyListFilter(rows, F({ sung: "stale" }), NOW).map((r) => r.title)).toEqual(["Old"]);
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
      F({ stages: [RepertoireKind.wantToLearn], deity: "Krishna", sung: "never" }),
      NOW,
    );
    expect(out.map((r) => r.title)).toEqual(["Wanted Krishna, never sung"]);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(applyListFilter([row()], F({ deity: "Hanuman" }), NOW)).toEqual([]);
  });
});
