/**
 * lib/sessionsOfDay.ts — a day that holds more than one session.
 *
 * Pure. No Prisma import.
 *
 * Session.date stopped being unique on 2026-08-12: Sailavan, "some days there
 * are 3 sessions". That turns a question the app never had to ask into one it
 * asks constantly — when something says "the session on Thursday", which one
 * does it mean?
 *
 * The answer is the evening one. The overwhelming majority of sessions are at
 * 7pm; a morning session is the exception, and somebody opening the app to
 * roster "Thursday" means the usual Thursday unless they say otherwise. So
 * every default here leans on 19:00, and every screen that can hold several
 * sessions shows them all rather than hiding the others behind the default.
 */

/** The usual evening start, and the pole everything defaults towards. */
export const USUAL_START = "19:00";

export type DaySession = {
  id: string;
  /** "HH:MM", or null for "the usual evening" — see Session.startsAt. */
  startsAt: string | null;
  categoryName?: string | null;
  entries?: number;
};

/** Minutes from midnight. Null means the usual evening, not midnight. */
export function startMinutes(startsAt: string | null | undefined): number {
  const value = startsAt ?? USUAL_START;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return toMinutes(USUAL_START);
  return Number(m[1]) * 60 + Number(m[2]);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Chronological, which is how a day is read. Ties keep their given order. */
export function sortByStart<T extends DaySession>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => startMinutes(a.startsAt) - startMinutes(b.startsAt));
}

/**
 * The one a bare "this day" means.
 *
 * Closest to 7pm, ties going to the earlier. Not "the first of the day", which
 * is what the code did when the unique constraint came off and which would
 * have handed a 9am festival session every link meant for the evening one.
 * Not "the last", either — that would pick a 9pm overflow over the 7pm the
 * group actually meets at.
 */
export function defaultSessionOf<T extends DaySession>(sessions: readonly T[]): T | null {
  if (sessions.length === 0) return null;
  const target = toMinutes(USUAL_START);

  return sortByStart(sessions).reduce((best, s) => {
    const d = Math.abs(startMinutes(s.startsAt) - target);
    const bestD = Math.abs(startMinutes(best.startsAt) - target);
    return d < bestD ? s : best;
  });
}

/**
 * "7pm", "9:30am" — how the group says a time.
 *
 * 24-hour clock is not what anybody here reads, and a bare "19:00" in a
 * calendar cell is one more thing to translate mid-glance.
 */
export function timeLabel(startsAt: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((startsAt ?? "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  if (h === 0 && min === 0) return "midnight";
  if (h === 12 && min === 0) return "noon";
  return min === 0 ? `${hour}${suffix}` : `${hour}:${String(min).padStart(2, "0")}${suffix}`;
}

/**
 * How a session is named when several share a day.
 *
 * The time first, because that is what tells two sessions apart at a glance;
 * the category second, because it says what kind of thing it is. On a day with
 * one session neither is needed, and callers say so by not asking.
 */
export function sessionLabel(session: DaySession): string {
  const parts = [timeLabel(session.startsAt), session.categoryName].filter(Boolean);
  return parts.join(" · ") || "session";
}

/** Does this day need any of the above shown at all? */
export function hasSeveral(sessions: readonly DaySession[]): boolean {
  return sessions.length > 1;
}
