import { prisma } from "@/lib/db";
import { pushToSingers, pushConfigured } from "@/lib/push";
import { lyricFlagNotification } from "@/lib/notify";
import { addDaysISO, melbourneTodayISO } from "@/lib/dates";
import { findLyricFlags, lyricFlagNoticeDue } from "@/lib/lyricFlags";
import { sessionStart } from "@/lib/nudgeRules";
import { timeLabel, USUAL_START } from "@/lib/sessionsOfDay";
import { editorSingerIds } from "@/lib/notifyUnavailable";
import { NOT_ARCHIVED } from "./archive";

/**
 * lib/notifyLyricFlags.ts — telling the coordinators about a flagged word,
 * about two hours before the session.
 *
 * Sailavan, 2026-10-12: "If a flagged word is in the lyrics for a rostered
 * bhajan, send a notification to all coordinators 2 hours prior to the bhajan
 * start time." The banner on the session page says the same thing to anybody
 * who opens it; this is for the coordinators who would not think to look.
 *
 * Run by the hourly sweep. Each run asks which sessions start within the next
 * two and a half hours (see lyricFlagNoticeDue for why half an hour of slack),
 * and the instant comes from the session's own date, wall-clock time and zone,
 * so daylight saving is the IANA database's problem rather than this file's.
 *
 * Once per coordinator per session, through SessionNotice. If a flagged bhajan
 * is only added after the notice went, the coordinators already told are not
 * told again — the session page still shows it — but anybody who had not been
 * told yet is.
 */

export type LyricFlagRun = {
  /** Sessions inside the two-hour window that were looked at. */
  considered: number;
  /** Of those, how many had a flagged word in their lyrics. */
  flagged: number;
  /** Coordinators who had a notification accepted by a push service. */
  told: number;
};

export async function notifyLyricFlags(now: Date = new Date()): Promise<LyricFlagRun> {
  const run: LyricFlagRun = { considered: 0, flagged: 0, told: 0 };
  if (!pushConfigured) return run;

  try {
    // The cheap exit: no terms at all, nothing to look for.
    if ((await prisma.lyricFlag.count()) === 0) return run;

    /*
     * Yesterday to tomorrow by Melbourne's calendar, then narrowed by the real
     * start instant. A session's date is the date on ITS clock, which for a
     * Sydney or Chennai session need not be Melbourne's, and a session just
     * after midnight is due the evening before. The window is cheap and the
     * instant check is exact.
     */
    const today = melbourneTodayISO(now);
    const from = addDaysISO(today, -1)!;
    const to = addDaysISO(today, 1)!;
    const candidates = await prisma.session.findMany({
      where: {
        ...NOT_ARCHIVED,
        format: "bhajans",
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        slots: { some: { bhajanId: { not: null } } },
      },
      select: { id: true, date: true, startsAt: true, timeZone: true },
    });

    const due = candidates.filter((s) =>
      lyricFlagNoticeDue(
        sessionStart({ dateISO: s.date.toISOString().slice(0, 10), startsAt: s.startsAt, timeZone: s.timeZone }),
        now,
      ),
    );
    if (due.length === 0) return run;

    const editors = await editorSingerIds();
    if (editors.length === 0) return run;

    for (const s of due) {
      run.considered += 1;
      const dateISO = s.date.toISOString().slice(0, 10);

      const told = new Set(
        (
          await prisma.sessionNotice.findMany({
            where: { sessionId: s.id, kind: "lyric_flag" },
            select: { singerId: true },
          })
        ).map((n) => n.singerId),
      );
      const toTell = editors.filter((id) => !told.has(id));
      if (toTell.length === 0) continue;

      // The lyrics only for sessions that are actually due: Bhajan.lyrics is
      // the heaviest column in the database.
      const [rules, slots] = await Promise.all([
        prisma.lyricFlag.findMany({
          where: { startsOn: { lte: s.date }, OR: [{ endsOn: null }, { endsOn: { gte: s.date } }] },
        }),
        prisma.sessionSlot.findMany({
          where: { sessionId: s.id },
          orderBy: { position: "asc" },
          select: { bhajanTitle: true, bhajan: { select: { title: true, lyrics: true } } },
        }),
      ]);

      // Numbered and titled exactly as the session page's banner does it.
      const hits = findLyricFlags(
        rules.map((f) => ({
          id: f.id,
          term: f.term,
          wholeWord: f.wholeWord,
          note: f.note,
          startsOn: f.startsOn.toISOString().slice(0, 10),
          endsOn: f.endsOn ? f.endsOn.toISOString().slice(0, 10) : null,
        })),
        slots.map((x, i) => ({
          position: i + 1,
          title: x.bhajan?.title ?? x.bhajanTitle ?? "Untitled",
          lyrics: x.bhajan?.lyrics ?? null,
        })),
        dateISO,
      );
      if (hits.length === 0) continue;
      run.flagged += 1;

      const res = await pushToSingers(
        toTell,
        lyricFlagNotification({ sessionId: s.id, timeLabel: timeLabel(s.startsAt ?? USUAL_START), hits }),
        s.id,
      );
      // Recorded even when nothing was delivered, as everywhere else: somebody
      // with no subscribed device is not owed a retry every hour.
      await prisma.sessionNotice.createMany({
        data: toTell.map((singerId) => ({ sessionId: s.id, singerId, kind: "lyric_flag" as const })),
        skipDuplicates: true,
      });
      run.told += res.sent;
    }
    return run;
  } catch (e) {
    console.error("notifyLyricFlags failed", e);
    return run;
  }
}
