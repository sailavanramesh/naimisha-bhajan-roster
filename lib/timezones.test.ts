import { describe, it, expect } from "vitest";
import {
  CENTRE_TIME_ZONE,
  SHORTLIST_ZONES,
  allTimeZones,
  canonicalZone,
  dateInZone,
  isValidTimeZone,
  sameClock,
  sameZone,
  sessionInstant,
  wallTimeInZone,
  zoneAbbreviation,
  zoneLabel,
  zoneOffsetMs,
} from "./timezones";

const HOUR = 3600_000;

describe("zoneOffsetMs", () => {
  it("reads Melbourne as +10 in winter and +11 in summer", () => {
    // August: no daylight saving in the southern winter.
    expect(zoneOffsetMs("Australia/Melbourne", new Date("2026-08-19T00:00:00Z"))).toBe(10 * HOUR);
    // January: daylight saving.
    expect(zoneOffsetMs("Australia/Melbourne", new Date("2026-01-15T00:00:00Z"))).toBe(11 * HOUR);
  });

  it("reads India as +5:30 all year, because it keeps no daylight saving", () => {
    const winter = zoneOffsetMs("Asia/Kolkata", new Date("2026-01-15T00:00:00Z"));
    const summer = zoneOffsetMs("Asia/Kolkata", new Date("2026-07-15T00:00:00Z"));
    expect(winter).toBe(5.5 * HOUR);
    expect(summer).toBe(5.5 * HOUR);
  });

  it("handles a zone behind UTC", () => {
    expect(zoneOffsetMs("America/New_York", new Date("2026-01-15T00:00:00Z"))).toBe(-5 * HOUR);
  });

  it("is exact — no stray milliseconds from a non-round instant", () => {
    expect(zoneOffsetMs("Asia/Kolkata", new Date("2026-08-19T04:37:29.813Z"))).toBe(5.5 * HOUR);
  });
});

describe("sessionInstant", () => {
  it("puts a 7pm Melbourne session at 09:00 UTC in winter", () => {
    const at = sessionInstant("2026-08-20", "19:00", "Australia/Melbourne");
    expect(at?.toISOString()).toBe("2026-08-20T09:00:00.000Z");
  });

  it("puts the same 7pm session an hour earlier in UTC under daylight saving", () => {
    const at = sessionInstant("2026-01-15", "19:00", "Australia/Melbourne");
    expect(at?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  /*
   * The whole point of storing a zone rather than an offset. Melbourne's clocks
   * go forward on the first Sunday in October and back on the first Sunday in
   * April, and "7pm" has to mean 7pm in the hall on both sides of each.
   */
  it("tracks the changeover, so 7pm is 7pm on both sides of it", () => {
    const beforeOct = sessionInstant("2026-10-03", "19:00", "Australia/Melbourne");
    const afterOct = sessionInstant("2026-10-04", "19:00", "Australia/Melbourne");
    expect(beforeOct?.toISOString()).toBe("2026-10-03T09:00:00.000Z");
    expect(afterOct?.toISOString()).toBe("2026-10-04T08:00:00.000Z");

    for (const iso of ["2026-10-03", "2026-10-04", "2026-04-04", "2026-04-05"]) {
      const at = sessionInstant(iso, "19:00", "Australia/Melbourne");
      expect(wallTimeInZone("Australia/Melbourne", at!)).toBe("19:00");
      expect(dateInZone("Australia/Melbourne", at!)).toBe(iso);
    }
  });

  it("round-trips any wall time back to itself, in every shortlist zone", () => {
    for (const { zone } of SHORTLIST_ZONES) {
      for (const iso of ["2026-01-15", "2026-04-05", "2026-08-20", "2026-10-04"]) {
        for (const hhmm of ["06:30", "09:00", "12:00", "19:00", "23:45"]) {
          const at = sessionInstant(iso, hhmm, zone);
          expect(wallTimeInZone(zone, at!)).toBe(hhmm);
          expect(dateInZone(zone, at!)).toBe(iso);
        }
      }
    }
  });

  it("handles a half-hour zone", () => {
    const at = sessionInstant("2026-08-20", "19:00", "Asia/Kolkata");
    expect(at?.toISOString()).toBe("2026-08-20T13:30:00.000Z");
  });

  /*
   * 2:30am does not exist on the morning the clocks spring forward. Resolving
   * it forward is what every calendar does; the contract worth pinning is that
   * it returns a real instant rather than null or NaN.
   */
  it("resolves a time that does not exist, rather than failing", () => {
    const at = sessionInstant("2026-10-04", "02:30", "Australia/Melbourne");
    expect(at).toBeInstanceOf(Date);
    expect(Number.isNaN(at!.getTime())).toBe(false);
    expect(at?.toISOString()).toBe("2026-10-03T16:30:00.000Z");
  });

  it("returns null on input it cannot read", () => {
    expect(sessionInstant("not-a-date", "19:00", CENTRE_TIME_ZONE)).toBeNull();
    expect(sessionInstant("2026-08-20", "teatime", CENTRE_TIME_ZONE)).toBeNull();
  });
});

describe("sameClock", () => {
  it("is true for Melbourne and Sydney, which differ in name only", () => {
    expect(sameClock("Australia/Melbourne", "Australia/Sydney", new Date("2026-08-20T09:00:00Z"))).toBe(true);
    expect(sameClock("Australia/Melbourne", "Australia/Sydney", new Date("2026-01-15T08:00:00Z"))).toBe(true);
  });

  it("is false for Melbourne and India", () => {
    expect(sameClock("Australia/Melbourne", "Asia/Kolkata", new Date("2026-08-20T09:00:00Z"))).toBe(false);
  });

  /*
   * Brisbane keeps no daylight saving, so it agrees with Melbourne for half the
   * year and not the other half. A viewer there should be told the difference
   * in summer and left alone in winter, which only comparing at the instant
   * can get right.
   */
  it("follows the season rather than the zone name", () => {
    const winter = new Date("2026-08-20T09:00:00Z");
    const summer = new Date("2026-01-15T08:00:00Z");
    expect(sameClock("Australia/Melbourne", "Australia/Brisbane", winter)).toBe(true);
    expect(sameClock("Australia/Melbourne", "Australia/Brisbane", summer)).toBe(false);
  });
});

describe("zoneAbbreviation", () => {
  it("names the season, not just the zone", () => {
    expect(zoneAbbreviation("Australia/Melbourne", new Date("2026-08-20T09:00:00Z"))).toBe("AEST");
    expect(zoneAbbreviation("Australia/Melbourne", new Date("2026-01-15T08:00:00Z"))).toBe("AEDT");
  });
});

describe("zoneLabel", () => {
  it("uses the centre's own words for the shortlist", () => {
    expect(zoneLabel("Australia/Melbourne")).toBe("Melbourne");
    expect(zoneLabel("Asia/Kolkata")).toBe("India");
  });

  it("falls back to the city in the zone name, underscores and all", () => {
    expect(zoneLabel("America/New_York")).toBe("New York");
    expect(zoneLabel("Pacific/Auckland")).toBe("Auckland");
  });
});

describe("the zone list", () => {
  it("offers Melbourne first, as the default", () => {
    expect(SHORTLIST_ZONES[0].zone).toBe(CENTRE_TIME_ZONE);
  });

  it("names Tiruvannamalai on the India entry, so it can be found by eye", () => {
    const india = SHORTLIST_ZONES.find((z) => z.zone === "Asia/Kolkata");
    expect(india?.label).toContain("Tiruvannamalai");
    expect(india?.label).toContain("Chennai");
    expect(india?.label).toContain("Hyderabad");
  });

  it("every shortlist zone is one Intl accepts", () => {
    for (const { zone } of SHORTLIST_ZONES) expect(isValidTimeZone(zone)).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(isValidTimeZone("Middle/Earth")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("the full list leads with the shortlist, in its own spelling", () => {
    const all = allTimeZones();
    expect(all.slice(0, SHORTLIST_ZONES.length)).toEqual(SHORTLIST_ZONES.map((z) => z.zone));
  });

  /*
   * The bug this guards. ICU here canonicalises "Asia/Kolkata" to
   * "Asia/Calcutta", so a naive concatenation offered India twice — once under
   * the name the shortlist saves and once under the name the platform returns —
   * and a saved session matched neither reliably.
   */
  it("offers each zone exactly once, whichever name the platform prefers", () => {
    const canonical = allTimeZones().map(canonicalZone);
    expect(new Set(canonical).size).toBe(canonical.length);
  });
});

describe("canonicalZone", () => {
  it("makes the two spellings of India equal", () => {
    expect(sameZone("Asia/Kolkata", "Asia/Calcutta")).toBe(true);
  });

  it("still tells genuinely different zones apart", () => {
    expect(sameZone("Australia/Melbourne", "Australia/Sydney")).toBe(false);
  });

  it("leaves a name it cannot resolve alone rather than throwing", () => {
    expect(canonicalZone("Middle/Earth")).toBe("Middle/Earth");
  });

  it("labels India whichever way it is spelled", () => {
    expect(zoneLabel("Asia/Kolkata")).toBe("India");
    expect(zoneLabel("Asia/Calcutta")).toBe("India");
  });
});
