import { describe, it, expect } from "vitest";
import { timeLabel } from "./sessionsOfDay";
import { viewerTime } from "./timezones";

/**
 * What components/SessionTime.tsx puts after the venue's time, if anything.
 *
 * Calls the real function the component calls, rather than a copy of it — a
 * copy would keep passing after the component changed.
 */
function viewerLine(dateISO: string, startsAt: string, venue: string, viewer: string) {
  const v = viewerTime(dateISO, startsAt, venue, viewer, timeLabel);
  if (!v) return null;
  return v.day ? `${v.time} your time (${v.day})` : v.time;
}

const MEL = "Australia/Melbourne";

describe("what a reader elsewhere is shown", () => {
  it("shows nothing to a Melbourne reader of a Melbourne session", () => {
    expect(viewerLine("2026-08-20", "19:00", MEL, MEL)).toBeNull();
  });

  it("shows nothing to a Sydney reader — same clock, different zone", () => {
    expect(viewerLine("2026-08-20", "19:00", MEL, "Australia/Sydney")).toBeNull();
  });

  it("converts 7pm Melbourne to 2:30pm for a reader in India", () => {
    expect(viewerLine("2026-08-20", "19:00", MEL, "Asia/Kolkata")).toBe("2:30pm");
  });

  it("carries the day when the reader is on a different one", () => {
    // 7pm Thu 20 Aug in Melbourne is 5am the SAME Thursday morning in New
    // York — same date, so no day is added and none is wanted.
    expect(viewerLine("2026-08-20", "19:00", MEL, "America/New_York")).toBe("5am");
    // 9am Thu in Melbourne is the previous EVENING in New York.
    expect(viewerLine("2026-08-20", "09:00", MEL, "America/New_York")).toBe("7pm your time (Wed, 19 Aug)");
  });

  it("follows daylight saving on the venue's side", () => {
    // Same 7pm, five months apart: Melbourne is +11 in January, so India sees
    // 1:30pm rather than 2:30pm.
    expect(viewerLine("2026-08-20", "19:00", MEL, "Asia/Kolkata")).toBe("2:30pm");
    expect(viewerLine("2026-01-15", "19:00", MEL, "Asia/Kolkata")).toBe("1:30pm");
  });

  it("works the other way round — a Chennai session read from Melbourne", () => {
    expect(viewerLine("2026-08-20", "19:00", "Asia/Kolkata", MEL)).toBe("11:30pm");
  });

  it("goes quiet in Brisbane in winter and speaks up in summer", () => {
    expect(viewerLine("2026-08-20", "19:00", MEL, "Australia/Brisbane")).toBeNull();
    expect(viewerLine("2026-01-15", "19:00", MEL, "Australia/Brisbane")).toBe("6pm");
  });
});
