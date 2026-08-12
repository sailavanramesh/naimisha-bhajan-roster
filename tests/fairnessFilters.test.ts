import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  describeFilters,
  filtersToQuery,
  parseFilters,
} from "@/lib/fairnessFilters";

const TODAY = "2026-08-12";

describe("parseFilters", () => {
  it("defaults to the last year", () => {
    const f = parseFilters({}, TODAY);
    expect(f.presetDays).toBe(365);
    expect(f.toISO).toBe(TODAY);
    expect(f.fromISO).toBe("2025-08-12");
    expect(f.categoryId).toBeNull();
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

  it("reads the category and the part of day", () => {
    const f = parseFilters({ cat: "cat123", when: "morning" }, TODAY);
    expect(f.categoryId).toBe("cat123");
    expect(f.partOfDay).toBe("morning");
  });

  it("treats 'all' as no category filter", () => {
    expect(parseFilters({ cat: "all" }, TODAY).categoryId).toBeNull();
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
});

describe("describeFilters", () => {
  it("says what the numbers cover", () => {
    expect(describeFilters(parseFilters({ days: "90" }, TODAY), null, TODAY)).toBe(
      "the last 90 days",
    );
    expect(describeFilters(parseFilters({ days: "3650" }, TODAY), null, TODAY)).toBe("all time");
    expect(
      describeFilters(parseFilters({ days: "90", when: "morning" }, TODAY), "Festival", TODAY),
    ).toBe("the last 90 days · festival sessions · mornings only");
  });

  it("names an explicit range by its dates", () => {
    expect(
      describeFilters(parseFilters({ from: "2026-01-01", to: "2026-03-31" }, TODAY), null, TODAY),
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
