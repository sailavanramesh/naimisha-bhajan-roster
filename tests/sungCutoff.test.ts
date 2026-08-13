import { describe, it, expect } from "vitest";
import {
  sungCutoff,
  hasBeenSung,
  melbourneNowLocal,
  SUNG_GRACE_HOURS,
  ASSUMED_START,
} from "@/lib/sungCutoff";

describe("sungCutoff", () => {
  it("is two hours after the session starts", () => {
    expect(sungCutoff("2026-08-13", "19:00")).toBe("2026-08-13T21:00");
    expect(sungCutoff("2026-08-13", "09:30")).toBe("2026-08-13T11:30");
  });

  it("assumes the usual evening when no start time was recorded", () => {
    // All 214 imported sessions were given 19:00 as a default, not a fact.
    expect(sungCutoff("2026-08-13", null)).toBe(`2026-08-13T21:00`);
    expect(sungCutoff("2026-08-13", "")).toBe("2026-08-13T21:00");
    expect(sungCutoff("2026-08-13", "nonsense")).toBe("2026-08-13T21:00");
    expect(ASSUMED_START).toBe("19:00");
  });

  it("rolls into the next day for a late session", () => {
    expect(sungCutoff("2026-08-13", "23:00")).toBe("2026-08-14T01:00");
    expect(sungCutoff("2026-12-31", "23:30")).toBe("2027-01-01T01:30");
  });

  it("uses the grace it is given", () => {
    expect(sungCutoff("2026-08-13", "19:00", 0)).toBe("2026-08-13T19:00");
    expect(sungCutoff("2026-08-13", "19:00", 5)).toBe("2026-08-14T00:00");
    expect(SUNG_GRACE_HOURS).toBe(2);
  });
});

describe("hasBeenSung", () => {
  const day = "2026-08-13";

  it("says no on the morning of the session — this was the bug", () => {
    // The old rule compared dates, so a 7pm session counted from midnight.
    expect(hasBeenSung(day, "19:00", "2026-08-13T00:01")).toBe(false);
    expect(hasBeenSung(day, "19:00", "2026-08-13T09:00")).toBe(false);
    expect(hasBeenSung(day, "19:00", "2026-08-13T18:59")).toBe(false);
  });

  it("says no while it is still going on", () => {
    expect(hasBeenSung(day, "19:00", "2026-08-13T19:30")).toBe(false);
    expect(hasBeenSung(day, "19:00", "2026-08-13T20:59")).toBe(false);
  });

  it("says yes two hours after it started", () => {
    expect(hasBeenSung(day, "19:00", "2026-08-13T21:00")).toBe(true);
    expect(hasBeenSung(day, "19:00", "2026-08-13T23:30")).toBe(true);
    expect(hasBeenSung(day, "19:00", "2026-08-14T06:00")).toBe(true);
  });

  it("handles a morning session on its own terms", () => {
    // Sailavan: "sometimes there are morning sessions".
    expect(hasBeenSung(day, "09:00", "2026-08-13T10:59")).toBe(false);
    expect(hasBeenSung(day, "09:00", "2026-08-13T11:00")).toBe(true);
    // ...and an evening one that day is still to come.
    expect(hasBeenSung(day, "19:00", "2026-08-13T11:00")).toBe(false);
  });

  it("says no for a session dated in the future", () => {
    expect(hasBeenSung("2026-09-01", "19:00", "2026-08-13T21:00")).toBe(false);
  });

  it("says yes for anything long past", () => {
    expect(hasBeenSung("2025-03-18", "19:00", "2026-08-13T09:00")).toBe(true);
  });
});

describe("melbourneNowLocal", () => {
  it("gives Melbourne wall-clock time in a comparable shape", () => {
    // 2026-08-13T00:30 UTC is 10:30 the same morning in Melbourne (AEST).
    expect(melbourneNowLocal(new Date("2026-08-13T00:30:00Z"))).toBe("2026-08-13T10:30");
    // 13:00 UTC is already the next day there.
    expect(melbourneNowLocal(new Date("2026-08-13T14:30:00Z"))).toBe("2026-08-14T00:30");
  });

  it("is the same format the cutoff produces, so they compare directly", () => {
    expect(melbourneNowLocal(new Date("2026-08-13T00:30:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });
});
