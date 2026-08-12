import { prisma } from "@/lib/db";
import { pushToSingers, pushConfigured } from "@/lib/push";
import { publishedNotification, shouldNotifyForSession } from "@/lib/notify";
import { melbourneTodayISO } from "@/lib/dates";

/**
 * lib/announceRosters.ts — "the roster for Thursday is up", once it actually is.
 *
 * This used to be sent from the save, alongside the alert to the people
 * rostered. Sailavan, 2026-08-12: he added three singers and the group was
 * told "1 singer rostered". The timestamps tell the whole story — the notice
 * went out three seconds after the FIRST singer was added, while he was still
 * typing, and the once-per-person rule meant nobody ever received a corrected
 * one.
 *
 * Adding singers one at a time is the normal workflow, so a count taken at the
 * first save is wrong nearly every time.
 *
 * The fix is to wait. Nobody is waiting for this notice — it is the silent
 * kind, deliberately, and it goes to people who are NOT singing. It can afford
 * to arrive an hour late; it cannot afford to be wrong. So it goes out from the
 * hourly job, once a session's roster has stopped changing.
 *
 * The alerting "you are rostered" stays immediate. That one asks somebody to
 * do something, and it is right the moment it is sent because it names their
 * own rows.
 */

/**
 * How long a roster must sit unchanged before the group is told about it.
 *
 * Long enough to cover building a session in one sitting — adding three or
 * four singers, going back to fix a pitch — and short enough that "the roster
 * is up" is still news.
 */
export const SETTLE_MINUTES = 20;

export type AnnounceRun = {
  announced: number;
  /** Sessions that are still being edited, so not announced yet. */
  waiting: number;
  skipped?: string;
};

export async function announceSettledRosters(now: Date = new Date()): Promise<AnnounceRun> {
  const nothing = { announced: 0, waiting: 0 };
  if (!pushConfigured) return { ...nothing, skipped: "push is not configured" };

  try {
    const todayISO = melbourneTodayISO(now);
    const settledBefore = new Date(now.getTime() - SETTLE_MINUTES * 60_000);

    const sessions = await prisma.session.findMany({
      where: {
        date: { gte: new Date(`${todayISO}T00:00:00.000Z`) },
        slots: { some: { singerId: { not: null } } },
      },
      select: {
        id: true,
        date: true,
        updatedAt: true,
        slots: {
          where: { singerId: { not: null } },
          select: { singerId: true, updatedAt: true },
        },
        notices: { select: { singerId: true, kind: true } },
      },
    });

    let announced = 0;
    let waiting = 0;

    for (const session of sessions) {
      const dateISO = session.date.toISOString().slice(0, 10);
      if (!shouldNotifyForSession(dateISO, todayISO)) continue;

      // Nobody has been told yet? Then this is the announcement. If anybody
      // has, the session has already been announced and a second one would be
      // noise — people who join a roster later get their own alert.
      const alreadyAnnounced = session.notices.some((n) => n.kind === "published");
      if (alreadyAnnounced) continue;

      const lastTouched = session.slots.reduce(
        (latest, s) => (s.updatedAt > latest ? s.updatedAt : latest),
        session.updatedAt,
      );
      if (lastTouched > settledBefore) {
        // Still being worked on. It will be picked up on a later run.
        waiting++;
        continue;
      }

      const rostered = new Set(session.slots.map((s) => s.singerId!));

      const others = await prisma.singer.findMany({
        where: { id: { notIn: [...rostered] } },
        select: { id: true },
      });
      const toTell = others.map((o) => o.id);
      if (toTell.length === 0) continue;

      const res = await pushToSingers(
        toTell,
        publishedNotification({
          sessionId: session.id,
          dateISO,
          // Counted now, when the roster has settled — which is the whole
          // point of this module.
          singerCount: rostered.size,
        }),
      );

      await prisma.sessionNotice.createMany({
        data: toTell.map((singerId) => ({
          sessionId: session.id,
          singerId,
          kind: "published" as const,
        })),
        skipDuplicates: true,
      });

      if (res.sent > 0) announced++;
    }

    return { announced, waiting };
  } catch (e) {
    console.error("announceSettledRosters failed", e);
    return { ...nothing, skipped: "error" };
  }
}
