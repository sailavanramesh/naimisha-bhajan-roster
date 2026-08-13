/**
 * When a session counts as having been SUNG.
 *
 * Singing something is the evidence that puts it on somebody's known list
 * (lib/repertoireFromHistory.ts). The question is when that evidence exists,
 * and the first answer was too generous: it compared DATES, so a session dated
 * today counted from midnight — a 7pm bhajan was "sung" at nine in the morning,
 * while it was still a plan somebody might change.
 *
 * Sailavan, 2026-08-13: "a song can't go into the known list if that date
 * hasn't happened yet, it should only go in two hours after the completion of
 * that session (based on its start time)."
 *
 * So the cutoff is the session's own start plus a couple of hours — long
 * enough for an ordinary evening of three or four bhajans to have finished.
 *
 * Everything here works in Melbourne wall-clock time as `YYYY-MM-DDTHH:MM`
 * strings, which compare correctly with `<` and `>`. Session dates are
 * Melbourne dates and `startsAt` is a Melbourne clock time, so there is no
 * instant to convert — turning them into a UTC timestamp would only invite the
 * date to slip across midnight, which CLAUDE.md warns about.
 */

/** Two hours after it starts. An ordinary session is three or four bhajans. */
export const SUNG_GRACE_HOURS = 2;

/** What a session with no recorded start time is assumed to begin at. */
export const ASSUMED_START = "19:00";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Now, in Melbourne, as `YYYY-MM-DDTHH:MM`. */
export function melbourneNowLocal(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // en-CA gives 24-hour time, but midnight can come back as "24".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/**
 * The moment a session's bhajans count as sung: its start plus the grace.
 *
 * Wall-clock arithmetic, so a session starting at 23:00 rolls into the next
 * day correctly. Twice a year a daylight-saving change makes this an hour out;
 * for a rule whose whole purpose is "the session has finished by now" that is
 * not worth a timezone library.
 */
export function sungCutoff(
  dateISO: string,
  startsAt: string | null | undefined,
  graceHours: number = SUNG_GRACE_HOURS,
): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const start = /^\d{1,2}:\d{2}$/.test((startsAt ?? "").trim())
    ? (startsAt as string).trim()
    : ASSUMED_START;
  const [hh, mm] = start.split(":").map(Number);

  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + graceHours * 3600_000);
  return (
    `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
  );
}

/** Has this session finished long enough ago to count as sung? */
export function hasBeenSung(
  dateISO: string,
  startsAt: string | null | undefined,
  nowLocal: string = melbourneNowLocal(),
  graceHours: number = SUNG_GRACE_HOURS,
): boolean {
  return nowLocal >= sungCutoff(dateISO, startsAt, graceHours);
}
