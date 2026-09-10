import { describe, expect, it } from "vitest";
import {
  RECENT_MONTHS,
  formatSessionDate,
  isRecentlySung,
  recentCutoffISO,
  recentlySungLabel,
  recentlySungTitle,
} from "@/lib/recentlySung";

describe("recentCutoffISO", () => {
  it("goes back three months by default", () => {
    expect(recentCutoffISO("2026-09-10")).toBe("2026-06-10");
  });

  it("crosses the year boundary", () => {
    expect(recentCutoffISO("2026-02-05")).toBe("2025-11-05");
  });

  /*
   * The reason this is not `setUTCMonth` on its own. Three months before
   * 31 May is the end of February — rolling over would land on 2 or 3 March
   * and quietly make the window two days shorter than it says it is.
   */
  it("clamps onto a short month rather than rolling over", () => {
    expect(recentCutoffISO("2026-05-31")).toBe("2026-02-28");
    expect(recentCutoffISO("2028-05-31")).toBe("2028-02-29"); // leap year
    expect(recentCutoffISO("2026-07-31")).toBe("2026-04-30");
  });

  it("takes another window length", () => {
    expect(recentCutoffISO("2026-09-10", 6)).toBe("2026-03-10");
  });

  it("is null on a date it cannot read", () => {
    expect(recentCutoffISO("not a date")).toBeNull();
  });
});

describe("isRecentlySung", () => {
  const asOf = "2026-09-10";

  it("counts the day the window opens, and not the day before it", () => {
    expect(isRecentlySung("2026-06-10", asOf)).toBe(true);
    expect(isRecentlySung("2026-06-09", asOf)).toBe(false);
  });

  it("counts the session's own day", () => {
    expect(isRecentlySung(asOf, asOf)).toBe(true);
  });

  /*
   * The window ends at the SESSION, not at today. Reviewing a session in March,
   * something sung in August is not "recently sung" as far as that evening was
   * concerned — it had not happened yet.
   */
  it("does not count anything after the session", () => {
    expect(isRecentlySung("2026-09-11", asOf)).toBe(false);
  });

  it("is false with no history at all", () => {
    expect(isRecentlySung(null, asOf)).toBe(false);
  });
});

describe("the words", () => {
  it("says when, and how many when there were several", () => {
    expect(recentlySungLabel({ lastISO: "2026-08-23", count: 1 })).toBe("sung recently · 23 Aug");
    expect(recentlySungLabel({ lastISO: "2026-08-23", count: 3 })).toBe(
      "sung recently · 23 Aug · 3×",
    );
  });

  it("spells the window out in the long version", () => {
    expect(recentlySungTitle({ lastISO: "2026-08-23", count: 1 })).toContain(
      `once in the last ${RECENT_MONTHS} months`,
    );
    expect(recentlySungTitle({ lastISO: "2026-08-23", count: 2 })).toContain("2 times");
    expect(recentlySungTitle({ lastISO: "2026-08-23", count: 2 })).toContain("23 August 2026");
  });

  /*
   * A session date is a calendar date. Formatted in the reader's zone it slips
   * a day west of UTC, which is the bug class CLAUDE.md names outright.
   */
  it("reads a date back on the day it was written", () => {
    expect(formatSessionDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatSessionDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatSessionDate("rubbish")).toBe("rubbish");
  });
});
