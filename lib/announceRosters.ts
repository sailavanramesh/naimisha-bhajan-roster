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
 * The fix is to wait — but only for the roster to settle, not for the next
 * hourly tick. Every save asks whether this session is now settled and
 * announces it if so, and the hourly job asks the same question of every
 * future session as a backstop. So the common case (build the roster, come
 * back to fill in bhajans) announces on that next save, and a session built
 * and left alone is picked up by the job.
 *
 * "Settled" means THE PEOPLE have stopped changing — Session.rosterChangedAt,
 * not slot.updatedAt. Filling in a pitch an hour later must not reset the
 * clock: the singers are decided, and that is what this announces.
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

export type AnnounceOutcome =
  | "announced"
  | "already announced"
  | "still changing"
  | "nobody rostered"
  | "in the past"
  | "nobody to tell"
  | "push is not configured"
  | "no such session"
  | "error";

/**
 * Announce one session, if it is ready to be announced.
 *
 * Safe to call after every save: it is two small queries and it answers "no"
 * for almost all of them.
 */
export async function announceRosterIfSettled(
  sessionId: string,
  now: Date = new Date(),
): Promise<AnnounceOutcome> {
  if (!pushConfigured) return "push is not configured";

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        date: true,
        createdAt: true,
        rosterChangedAt: true,
        slots: { where: { singerId: { not: null } }, select: { singerId: true } },
        notices: { where: { kind: "published" }, select: { id: true } },
      },
    });
    if (!session) return "no such session";

    const dateISO = session.date.toISOString().slice(0, 10);
    if (!shouldNotifyForSession(dateISO, melbourneTodayISO(now))) return "in the past";
    if (session.slots.length === 0) return "nobody rostered";
    if (session.notices.length > 0) return "already announced";

    // Sessions that predate this column have no stamp; their creation time is
    // the honest fallback and is long past for anything already in the book.
    const changedAt = session.rosterChangedAt ?? session.createdAt;
    if (now.getTime() - changedAt.getTime() < SETTLE_MINUTES * 60_000) return "still changing";

    const rostered = new Set(session.slots.map((s) => s.singerId!));
    const others = await prisma.singer.findMany({
      where: { id: { notIn: [...rostered] } },
      select: { id: true },
    });
    if (others.length === 0) return "nobody to tell";

    await pushToSingers(
      others.map((o) => o.id),
      publishedNotification({ sessionId: session.id, dateISO, singerCount: rostered.size }),
    );

    // Recorded even when nothing was delivered, so a group with no subscribed
    // devices is not re-announced on every save for the rest of the week.
    await prisma.sessionNotice.createMany({
      data: others.map((o) => ({ sessionId: session.id, singerId: o.id, kind: "published" as const })),
      skipDuplicates: true,
    });

    return "announced";
  } catch (e) {
    console.error("announceRosterIfSettled failed", e);
    return "error";
  }
}

export type AnnounceRun = {
  announced: number;
  /** Sessions whose roster is still changing, so not announced yet. */
  waiting: number;
  skipped?: string;
};

/**
 * The backstop: every future session, once an hour.
 *
 * Catches the roster that was built and then left alone, where no later save
 * comes along to ask the question.
 */
export async function announceSettledRosters(now: Date = new Date()): Promise<AnnounceRun> {
  const nothing = { announced: 0, waiting: 0 };
  if (!pushConfigured) return { ...nothing, skipped: "push is not configured" };

  try {
    const todayISO = melbourneTodayISO(now);
    const sessions = await prisma.session.findMany({
      where: {
        date: { gte: new Date(`${todayISO}T00:00:00.000Z`) },
        slots: { some: { singerId: { not: null } } },
        notices: { none: { kind: "published" } },
      },
      select: { id: true },
    });

    let announced = 0;
    let waiting = 0;
    for (const s of sessions) {
      const outcome = await announceRosterIfSettled(s.id, now);
      if (outcome === "announced") announced++;
      else if (outcome === "still changing") waiting++;
    }

    return { announced, waiting };
  } catch (e) {
    console.error("announceSettledRosters failed", e);
    return { ...nothing, skipped: "error" };
  }
}
