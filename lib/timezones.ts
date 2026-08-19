/**
 * lib/timezones.ts — which city's clock a session's time is on.
 *
 * Pure. No Prisma, no clock of its own: every function that needs "now" takes
 * it as an argument, so the whole file is testable against fixed instants.
 *
 * The problem this solves. `Session.startsAt` is a WALL-CLOCK time — the string
 * "19:00" means "the hall's clock says 7" and nothing more. That is the right
 * way to store it (see the schema comment), but on its own it is not enough to
 * answer "when is that, where I am?", because a wall-clock time is only an
 * instant once you say whose wall it is on. `Session.timeZone` says whose.
 *
 * Everything here goes through the IANA database via `Intl`, never through a
 * fixed offset. Melbourne is UTC+10 for half the year and UTC+11 for the other
 * half, India is UTC+5:30 all year and observes no daylight saving at all, and
 * the rules change by legislation more often than anybody expects. Hard-coding
 * "+10" would be wrong for five months of every year; hard-coding a table of
 * rules would be wrong the first time a parliament moved a date. Asking the
 * platform is the only version that stays right without a deploy.
 */

/**
 * Where the centre is, and what every session is assumed to be on.
 *
 * Named once so that a centre which moves, or a second centre, is a change in
 * one place rather than a search through the app for the word "Melbourne".
 */
export const CENTRE_TIME_ZONE = "Australia/Melbourne";

/**
 * The zones worth putting in front of somebody, in the order they should read.
 *
 * Sailavan, 2026-08-19: "a field for timezone, that defaults to Melbourne, and
 * has Sydney, Chennai, Tiruvannamalai (or its applicable timezone), Hyderabad
 * on a shortlist at the top, and the rest of the cities only if asked for."
 *
 * Chennai, Tiruvannamalai and Hyderabad are ONE entry, because they are one
 * zone: India keeps a single offset from Gujarat to Assam. Listing them as
 * three options that all save the same value would be three ways to say the
 * same thing and two of them would come back looking like the third. Naming
 * all three on the one option keeps them findable — somebody scanning for
 * "Tiruvannamalai" still sees the word — without pretending they differ.
 */
export const SHORTLIST_ZONES: ReadonlyArray<{ zone: string; label: string }> = [
  { zone: "Australia/Melbourne", label: "Melbourne" },
  { zone: "Australia/Sydney", label: "Sydney" },
  { zone: "Asia/Kolkata", label: "Chennai · Tiruvannamalai · Hyderabad" },
];

/**
 * The one spelling of a zone that comparisons may use.
 *
 * IANA renames zones and keeps the old name working as a link, and ICU does not
 * agree with itself across versions about which of the pair is canonical: the
 * Node this was written against resolves "Asia/Kolkata" to "Asia/Calcutta",
 * while other builds resolve it the other way. Both compute identical times, so
 * nothing here is WRONG either way — but the two strings are unequal, and that
 * is enough to break the things that compare rather than calculate. A picker
 * would show nothing selected for a saved session; a label lookup would miss;
 * and a server and a browser that disagree would render different text for the
 * same session and fail hydration.
 *
 * So: calculate with whatever was stored, compare only through here.
 */
export function canonicalZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: zone }).resolvedOptions().timeZone || zone;
  } catch {
    return zone;
  }
}

/** Are these the same zone, whichever spelling each is written in? */
export function sameZone(a: string, b: string): boolean {
  return canonicalZone(a) === canonicalZone(b);
}

/** Short names for the shortlist, for reading back in a sentence. */
const SHORT_LABELS: Record<string, string> = {
  "Australia/Melbourne": "Melbourne",
  "Australia/Sydney": "Sydney",
  "Asia/Kolkata": "India",
};

/** The same names again under whatever spelling this runtime prefers. */
const CANONICAL_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SHORT_LABELS).map(([zone, label]) => [canonicalZone(zone), label]),
);

/**
 * Every zone the platform knows, for the "rest of the cities" case.
 *
 * From `Intl`, not from a checked-in list: a list would be a copy of the IANA
 * database that goes stale silently, and this one is already on the machine and
 * already the one all the arithmetic below uses. The fallback covers a runtime
 * too old for `supportedValuesOf`, where the shortlist is still enough to work.
 */
export function allTimeZones(): string[] {
  const shortlist = SHORTLIST_ZONES.map((z) => z.zone);
  const supported = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;

  let rest: string[] = [];
  if (typeof supported === "function") {
    try {
      rest = supported.call(Intl, "timeZone");
    } catch {
      rest = [];
    }
  }

  /*
   * The shortlist leads, and its spelling wins. `supportedValuesOf` returns
   * whichever name this runtime treats as canonical, which for India is
   * "Asia/Calcutta" here — so appending the two lists naively would offer the
   * same zone twice under two names, and the one saved by the shortlist would
   * not be the one the list matched on. Deduping canonically leaves exactly one
   * entry per zone, spelled the way the centre picked it.
   */
  const seen = new Set(shortlist.map(canonicalZone));
  const out = [...shortlist];
  for (const zone of rest) {
    const key = canonicalZone(zone);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(zone);
  }
  return out;
}

/** Is this a zone name `Intl` will actually accept? Guards anything user-typed. */
export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A zone as a person would say it: "Melbourne", "India", "Los Angeles".
 *
 * The IANA name is a filing code, not a label — nobody says "the session is at
 * 7pm Australia//Melbourne". Shortlist entries get the name the centre uses;
 * everything else is derived from the last segment of the zone, which is the
 * city often enough to be worth doing and never misleading when it is not.
 */
export function zoneLabel(zone: string): string {
  return (
    SHORT_LABELS[zone] ??
    CANONICAL_LABELS[canonicalZone(zone)] ??
    (zone.split("/").pop() ?? zone).replace(/_/g, " ")
  );
}

/**
 * The zone's offset from UTC at a given instant, in milliseconds.
 *
 * Works by asking the zone what it was showing on its clock at that instant,
 * reading that back as if it were UTC, and taking the difference. Roundabout,
 * but it is the only way `Intl` will answer the question, and it is exact for
 * every zone including the half-hour and quarter-hour ones.
 *
 * Seconds are floored off the input first: the parts carry no milliseconds, so
 * subtracting them from a millisecond-precision instant would leave a stray
 * remainder in the offset.
 */
export function zoneOffsetMs(zone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;

  const asIfUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUTC - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The actual moment a session starts: a date, a wall-clock time and a zone.
 *
 * The offset is the thing being solved for and it depends on the answer, so
 * this guesses once and corrects once. Reading the wall time as if it were UTC
 * gives an instant in the right neighbourhood; the zone's offset THERE is
 * almost always the offset that applies; and re-checking at the corrected
 * instant catches the twice-a-year case where the guess landed on the far side
 * of a daylight-saving change and picked up the wrong one.
 *
 * A second correction is not needed. Offsets shift by an hour or two and the
 * first correction is already within that of the truth, so the only way to
 * still be wrong is a time that does not exist — 2:30am on the morning the
 * clocks spring forward. Those resolve to the instant an hour later, which is
 * the same thing every calendar application does with them.
 */
export function sessionInstant(dateISO: string, startsAt: string, zone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(startsAt.trim());
  if (!d || !t) return null;

  const wallAsUTC = Date.UTC(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
  );
  if (Number.isNaN(wallAsUTC)) return null;

  const firstGuess = zoneOffsetMs(zone, new Date(wallAsUTC));
  const corrected = wallAsUTC - firstGuess;
  const actual = zoneOffsetMs(zone, new Date(corrected));
  return new Date(actual === firstGuess ? corrected : wallAsUTC - actual);
}

/** The zone's short name at an instant — "AEST", "AEDT", "GMT+5:30". */
export function zoneAbbreviation(zone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: zone,
    timeZoneName: "short",
  }).formatToParts(instant);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** The wall-clock time an instant shows in a zone, as `HH:MM`. */
export function wallTimeInZone(zone: string, instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/** The calendar date an instant falls on in a zone, as `YYYY-MM-DD`. */
export function dateInZone(zone: string, instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Do two zones read the same at this instant?
 *
 * The test for whether a viewer needs to be told anything at all. Melbourne and
 * Sydney are different zones with identical clocks, so a Sydney member reading
 * a Melbourne session should not be shown a conversion that converts nothing —
 * comparing the CLOCKS rather than the zone names is what keeps that quiet.
 */
export function sameClock(zoneA: string, zoneB: string, instant: Date): boolean {
  return zoneOffsetMs(zoneA, instant) === zoneOffsetMs(zoneB, instant);
}

/**
 * What a reader in `viewerZone` should be told about a session, if anything.
 *
 * Null means "say nothing", and that is the common answer: a reader on the
 * venue's own clock needs no conversion, and telling them "7pm · 7pm your time"
 * would be noise dressed as help. The test is `sameClock`, comparing offsets
 * rather than zone names, so Sydney is silent all year and Brisbane is silent
 * for the half of it when it agrees with Melbourne.
 *
 * `day` is set only when the reader's calendar date differs from the session's —
 * a Melbourne evening is the previous afternoon in the Americas, and a bare time
 * would be wrong by a day in the least visible way possible.
 *
 * Lives here rather than inside the component so that it can be tested as what
 * it is: arithmetic with a rule about when to stay quiet.
 */
export function viewerTime(
  dateISO: string,
  startsAt: string | null | undefined,
  venueZone: string,
  viewerZone: string,
  format: (hhmm: string) => string,
): { time: string; day: string | null } | null {
  if (!startsAt || !viewerZone) return null;

  const at = sessionInstant(dateISO, startsAt, venueZone);
  if (!at) return null;
  if (sameClock(viewerZone, venueZone, at)) return null;

  const time = format(wallTimeInZone(viewerZone, at));
  if (!time) return null;

  if (dateInZone(viewerZone, at) === dateISO) return { time, day: null };
  return {
    time,
    day: new Intl.DateTimeFormat("en-AU", {
      timeZone: viewerZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(at),
  };
}

/** The viewer's own zone, as the browser reports it. Empty on a server. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}
