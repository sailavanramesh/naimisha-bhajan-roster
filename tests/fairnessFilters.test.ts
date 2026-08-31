import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  describeFilters,
  filtersToQuery,
  parseFilters,
  toggleId,
} from "@/lib/fairnessFilters";

const TODAY = "2026-08-12";

describe("parseFilters", () => {
  it("defaults to the last year", () => {
    const f = parseFilters({}, TODAY);
    expect(f.presetDays).toBe(365);
    expect(f.toISO).toBe(TODAY);
    expect(f.fromISO).toBe("2025-08-12");
    expect(f.categoryIds).toEqual([]);
    expect(f.categoryMode).toBe("include");
    expect(f.partOfDay).toBe("any");
  });

  it("takes a preset", () => {
    expect(parseFilters({ days: "90" }, TODAY).fromISO).toBe("2026-05-14");
  });

  it("lets explicit dates beat a stale preset", () => {
    // Somebody who typed a range means it. Snapping back to "last 365 days"
    // because days= is still in the URL is how a dashboard loses trust.
    const f = parseFilters({ days: "365", from: "2026-01-01", to: "2026-03-31" }, TODAY);
    expect(f.presetDays).toBeNull();
    expect(f.fromISO).toBe("2026-01-01");
    expect(f.toISO).toBe("2026-03-31");
  });

  it("fills in the open end of a half-given range", () => {
    expect(parseFilters({ from: "2026-06-01" }, TODAY).toISO).toBe(TODAY);
    expect(parseFilters({ to: "2026-06-01" }, TODAY).fromISO).toBe("2025-06-01");
  });

  it("swaps a backwards range rather than showing nothing", () => {
    const f = parseFilters({ from: "2026-06-01", to: "2026-01-01" }, TODAY);
    expect(f.fromISO).toBe("2026-01-01");
    expect(f.toISO).toBe("2026-06-01");
  });

  it("ignores rubbish dates and falls back to the preset", () => {
    const f = parseFilters({ from: "last tuesday" }, TODAY);
    expect(f.presetDays).toBe(365);
  });

  it("reads a single category, as links written before the list existed do", () => {
    const f = parseFilters({ cat: "cat123", when: "morning" }, TODAY);
    expect(f.categoryIds).toEqual(["cat123"]);
    expect(f.partOfDay).toBe("morning");
  });

  it("reads several categories", () => {
    expect(parseFilters({ cat: "a,b,c" }, TODAY).categoryIds).toEqual(["a", "b", "c"]);
  });

  it("drops blanks and repeats from the list", () => {
    expect(parseFilters({ cat: "a,,b, a ," }, TODAY).categoryIds).toEqual(["a", "b"]);
  });

  it("reads the exclusion mode", () => {
    const f = parseFilters({ cat: "a,b", catmode: "exclude" }, TODAY);
    expect(f.categoryIds).toEqual(["a", "b"]);
    expect(f.categoryMode).toBe("exclude");
  });

  it("ignores an unknown mode", () => {
    expect(parseFilters({ cat: "a", catmode: "sideways" }, TODAY).categoryMode).toBe("include");
  });

  it("treats 'all' as no category filter", () => {
    expect(parseFilters({ cat: "all" }, TODAY).categoryIds).toEqual([]);
  });

  it("ignores an unknown part of day", () => {
    expect(parseFilters({ when: "teatime" }, TODAY).partOfDay).toBe("any");
  });
});

describe("filtersToQuery", () => {
  it("keeps the other filters when one changes", () => {
    // The reason this exists: changing the window must not silently drop the
    // category somebody chose.
    const f = parseFilters({ days: "90", cat: "cat123", when: "evening" }, TODAY);
    expect(filtersToQuery(f, { days: 365 })).toBe("?days=365&cat=cat123&when=evening");
  });

  it("carries a whole list and its mode", () => {
    const f = parseFilters({ days: "90", cat: "a,b", catmode: "exclude" }, TODAY);
    expect(filtersToQuery(f, { days: 365 })).toBe("?days=365&cat=a%2Cb&catmode=exclude");
  });

  it("leaves the mode out when no kind is chosen", () => {
    // "Exclude nothing" is what "include everything" already means, and a mode
    // left in the URL with no kinds beside it is a filter that looks set and
    // is not.
    const f = parseFilters({ days: "90", cat: "a", catmode: "exclude" }, TODAY);
    expect(filtersToQuery(f, { cat: null })).toBe("?days=90");
  });

  it("drops the preset when an explicit range is set", () => {
    const f = parseFilters({ from: "2026-01-01", to: "2026-03-31" }, TODAY);
    expect(filtersToQuery(f)).toBe("?from=2026-01-01&to=2026-03-31");
  });

  it("omits everything at its default", () => {
    const f = parseFilters({ days: "365" }, TODAY);
    expect(filtersToQuery(f, { days: null })).toBe("");
  });

  it("clears a category", () => {
    const f = parseFilters({ days: "90", cat: "cat123" }, TODAY);
    expect(filtersToQuery(f, { cat: null })).toBe("?days=90");
  });

  it("round-trips a toggled chip", () => {
    const f = parseFilters({ days: "90", cat: "a" }, TODAY);
    const q = filtersToQuery(f, { cat: toggleId(f.categoryIds, "b") });
    expect(parseFilters(Object.fromEntries(new URLSearchParams(q.slice(1))), TODAY).categoryIds)
      .toEqual(["a", "b"]);
  });
});

describe("describeFilters", () => {
  it("says what the numbers cover", () => {
    expect(describeFilters(parseFilters({ days: "90" }, TODAY), [], TODAY)).toBe(
      "the last 90 days",
    );
    expect(describeFilters(parseFilters({ days: "3650" }, TODAY), [], TODAY)).toBe("all time");
    expect(
      describeFilters(parseFilters({ days: "90", when: "morning" }, TODAY), ["Festival"], TODAY),
    ).toBe("the last 90 days · festival sessions · mornings only");
  });

  it("names every chosen kind", () => {
    expect(
      describeFilters(parseFilters({ days: "90", cat: "a,b" }, TODAY), ["Festival", "Retreat"], TODAY),
    ).toBe("the last 90 days · festival or retreat sessions");
  });

  it("says an exclusion is an exclusion", () => {
    // "12 slots" with three kinds quietly left out is a different claim from
    // "12 slots", and the difference has to be on screen.
    expect(
      describeFilters(
        parseFilters({ days: "90", cat: "a,b", catmode: "exclude" }, TODAY),
        ["Festival", "Retreat"],
        TODAY,
      ),
    ).toBe("the last 90 days · every kind except festival and retreat");
  });

  it("names an explicit range by its dates", () => {
    expect(
      describeFilters(parseFilters({ from: "2026-01-01", to: "2026-03-31" }, TODAY), [], TODAY),
    ).toBe("2026-01-01 to 2026-03-31");
  });
});

describe("addDaysISO", () => {
  it("does not let a timezone shift the day", () => {
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysISO("2026-08-12", 0)).toBe("2026-08-12");
  });
});

describe("toggleId", () => {
  it("adds, removes, and keeps the drawn order", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
});
