import { describe, expect, it } from "vitest";
import {
  RECENT_MONTHS,
  formatSessionDate,
  isRecentlySung,
  recentCutoffISO,
  recentlySungLabel,
  recentlySungParts,
  recentlySungTitle,
  wasSungRecently,
  type SungBefore,
} from "@/lib/recentlySung";

/** A row as the query builds one, with the noise the words do not read. */
function sung(lastISO: string, recentCount: number): SungBefore {
  return { lastISO, recentCount, occurrences: [], more: 0 };
}

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
    expect(recentlySungLabel(sung("2026-08-23", 1))).toBe("sung recently · 23 Aug");
    expect(recentlySungLabel(sung("2026-08-23", 3))).toBe("sung recently · 23 Aug · 3×");
  });

  it("hands the marker its parts separately, so it can weight the lead", () => {
    expect(recentlySungParts(sung("2026-08-23", 1))).toEqual({
      lead: "sung recently",
      when: "23 Aug",
      times: null,
    });
    expect(recentlySungParts(sung("2026-08-23", 3)).times).toBe("3×");
  });

  /*
   * The quiet state. Without it, four months ago looked exactly like never,
   * because the marker simply vanished at the edge of the window.
   */
  it("drops the lead and keeps the year when it was longer ago than the window", () => {
    expect(wasSungRecently(sung("2026-01-12", 0))).toBe(false);
    expect(recentlySungParts(sung("2026-01-12", 0))).toEqual({
      lead: null,
      when: "last sung 12 Jan 2026",
      times: null,
    });
    expect(recentlySungLabel(sung("2026-01-12", 0))).toBe("last sung 12 Jan 2026");
  });

  it("says so in the long version too", () => {
    expect(recentlySungTitle(sung("2026-01-12", 0))).toContain(
      `Not sung in the last ${RECENT_MONTHS} months`,
    );
    expect(recentlySungTitle(sung("2026-01-12", 0))).toContain("12 January 2026");
  });

  it("spells the window out in the long version", () => {
    expect(recentlySungTitle(sung("2026-08-23", 1))).toContain(
      `once in the last ${RECENT_MONTHS} months`,
    );
    expect(recentlySungTitle(sung("2026-08-23", 2))).toContain("2 times");
    expect(recentlySungTitle(sung("2026-08-23", 2))).toContain("23 August 2026");
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
