import { prisma } from "@/lib/db";
import { pushToSingers, pushConfigured } from "@/lib/push";
import { formatSessionDate, shouldNotifyForSession } from "@/lib/notify";
import { melbourneTodayISO } from "@/lib/dates";
import {
  decideHarmoniumNotice,
  harmoniumChangeNotification,
  harmoniumLines,
  harmoniumReadyNotification,
  type HarmoniumLine,
} from "@/lib/harmoniumNotice";
import { NOT_ARCHIVED } from "./archive";

/**
 * lib/notifyHarmonium.ts — telling the harmonium players, and only when useful.
 *
 * The harmonium player prepares from two facts per bhajan, and neither is worth
 * anything without the other: which bhajan, and at what shruti. So nothing is
 * sent until EVERY row of a session has both. After that they are told about
 * changes, one edit at a time, because by then they have already practised and
 * what they need is the difference.
 *
 * The same restraints as every other notice in this app:
 *
 *   - FUTURE ONLY. Filling in last week's pitches is the commonest edit there
 *     is and it must buzz nobody.
 *   - ONCE for the summary. HarmoniumNotice is the ledger.
 *   - NEVER BLOCKS THE SAVE. Every failure here is swallowed; a coordinator
 *     must not see an error because a push service was down.
 *
 * Called from the same saves as announceRosterIfSettled, and swept by the
 * hourly job as a backstop for a session that is completed and then left alone.
 */

/** The instrument, as it is spelled in InstrumentPerson. */
export const HARMONIUM = "Harmonium";

export type HarmoniumOutcome =
  | "summary sent"
  | "changes sent"
  | "not ready"
  | "unchanged"
  | "nobody to tell"
  | "in the past"
  | "push is not configured"
  | "no such session"
  | "error";

/**
 * Who plays the harmonium, as singer ids.
 *
 * `InstrumentPerson` is keyed by NAME on both sides — it came from the
 * spreadsheet's eligibility lookup and predates anybody signing in — so the
 * names have to be matched back to Singer rows to find a push subscription.
 * Compared case-insensitively and trimmed, because one of those names arrived
 * from the sheet with a trailing space and will do so again.
 *
 * Somebody listed who is not a singer in the app simply cannot be reached, and
 * is skipped rather than treated as an error: eligibility is a list of people,
 * not a list of accounts.
 */
async function harmoniumSingerIds(): Promise<string[]> {
  const listed = await prisma.instrumentPerson.findMany({
    where: { instrument: HARMONIUM },
    select: { person: true },
  });
  if (listed.length === 0) return [];

  const wanted = new Set(listed.map((l) => l.person.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [];

  const singers = await prisma.singer.findMany({ select: { id: true, name: true } });
  return singers.filter((s) => wanted.has(s.name.trim().toLowerCase())).map((s) => s.id);
}

/** The session's rows as the harmonium reads them. */
async function linesFor(sessionId: string): Promise<{
  dateISO: string;
  lines: HarmoniumLine[];
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      date: true,
      format: true,
      slots: {
        select: {
          position: true,
          confirmedPitch: true,
          bhajanTitle: true,
          festivalBhajanTitle: true,
          bhajan: { select: { title: true } },
        },
      },
    },
  });
  if (!session || session.format !== "bhajans") return null;

  return {
    dateISO: session.date.toISOString().slice(0, 10),
    lines: harmoniumLines(
      session.slots.map((s) => ({
        position: s.position,
        // Same resolution order as the nudge: the masterlist title first, then
        // whatever the row was typed with.
        bhajan: s.bhajan?.title ?? s.bhajanTitle ?? s.festivalBhajanTitle ?? null,
        pitch: s.confirmedPitch,
      })),
    ),
  };
}

/**
 * Tell the harmonium players about this session, if there is anything to tell.
 *
 * Safe to call after any save. Everything in it is about NOT sending.
 */
export async function notifyHarmoniumIfReady(sessionId: string): Promise<HarmoniumOutcome> {
  if (!pushConfigured) return "push is not configured";

  try {
    const current = await linesFor(sessionId);
    if (!current) return "no such session";
    if (!shouldNotifyForSession(current.dateISO, melbourneTodayISO())) return "in the past";

    const sent = await prisma.harmoniumNotice.findUnique({ where: { sessionId } });
    const before = sent ? ((sent.lines as unknown as HarmoniumLine[]) ?? []) : null;

    // The whole decision, with no database in it. See decideHarmoniumNotice.
    const decision = decideHarmoniumNotice(before, current.lines);
    if (decision.send === "nothing") return decision.why;

    const players = await harmoniumSingerIds();
    if (players.length === 0) return "nobody to tell";

    const dateLabel = formatSessionDate(current.dateISO);
    await pushToSingers(
      players,
      decision.send === "summary"
        ? harmoniumReadyNotification({ sessionId, dateLabel, lines: decision.lines })
        : harmoniumChangeNotification({ sessionId, dateLabel, changes: decision.changes }),
    );

    /*
     * The snapshot moves whether or not anybody was reachable, so one change is
     * never described twice — a push service being down is not a reason to
     * repeat yourself an hour later.
     */
    await prisma.harmoniumNotice.upsert({
      where: { sessionId },
      create: { sessionId, lines: decision.lines },
      update: { lines: decision.lines },
    });

    return decision.send === "summary" ? "summary sent" : "changes sent";
  } catch {
    // Never blocks the save. See the note at the top.
    return "error";
  }
}

export type HarmoniumRun = {
  considered: number;
  summaries: number;
  changes: number;
};

/**
 * The backstop: every future session, once an hour.
 *
 * A session completed and then left alone is announced on the next save under
 * the ordinary path. This catches the one that was completed by an edit that
 * did not go through a save hook, and any change made outside the roster grid.
 */
export async function notifyHarmoniumForSessions(now: Date = new Date()): Promise<HarmoniumRun> {
  const run: HarmoniumRun = { considered: 0, summaries: 0, changes: 0 };
  if (!pushConfigured) return run;

  const todayISO = melbourneTodayISO(now);
  const sessions = await prisma.session.findMany({
    where: {
      ...NOT_ARCHIVED,
      format: "bhajans",
      date: { gte: new Date(`${todayISO}T00:00:00.000Z`) },
    },
    select: { id: true },
  });

  for (const s of sessions) {
    run.considered += 1;
    const outcome = await notifyHarmoniumIfReady(s.id);
    if (outcome === "summary sent") run.summaries += 1;
    if (outcome === "changes sent") run.changes += 1;
  }

  return run;
}
