import { prisma } from "@/lib/db";
import { pushToSingers, pushConfigured } from "@/lib/push";
import { removedNotification, shouldNotifyForSession } from "@/lib/notify";
import { melbourneTodayISO } from "@/lib/dates";

/**
 * lib/notifyRemoval.ts — telling somebody they are off a session.
 *
 * Sailavan, 2026-08-12: "if you are removed from a session, you should be
 * notified too." Being told you are singing and then quietly not singing is
 * the one that wastes somebody's week, so this alerts like the rostering
 * notice rather than sitting silently in the shade.
 *
 * There are three ways off a roster — the grid's Delete, the assign panel's
 * remove, and simply being swapped out of a row when the grid is saved — so
 * this works by DIFFERENCE rather than by hooking each one. Read who was on
 * before the change, call `notifyRemovals` with that list afterwards, and
 * anybody who has fallen out gets told. A path added later that forgets to
 * call it fails silently rather than sending something wrong.
 */

/** Who is rostered on this session right now. Call BEFORE mutating. */
export async function rosteredSingerIds(sessionId: string): Promise<string[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { sessionId, singerId: { not: null } },
    select: { singerId: true },
  });
  return [...new Set(slots.map((s) => s.singerId!))];
}

export async function notifyRemovals(
  sessionId: string,
  before: readonly string[],
): Promise<{ told: number; skipped?: string }> {
  if (before.length === 0) return { told: 0 };
  if (!pushConfigured) return { told: 0, skipped: "push is not configured" };

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { date: true },
    });
    if (!session) return { told: 0, skipped: "no such session" };

    const dateISO = session.date.toISOString().slice(0, 10);
    // Past sessions are edited constantly — tidying last month's roster must
    // not tell anybody they have been dropped from something already sung.
    if (!shouldNotifyForSession(dateISO, melbourneTodayISO())) {
      return { told: 0, skipped: "session is in the past" };
    }

    const after = new Set(await rosteredSingerIds(sessionId));
    const removed = before.filter((id) => !after.has(id));
    if (removed.length === 0) return { told: 0 };

    const res = await pushToSingers(removed, removedNotification({ sessionId, dateISO }));

    // Forget that they were ever told about this session. If they are put back
    // on later, that is news again, and the "once per person per session" rule
    // in notifyAboutSession would otherwise swallow it.
    await prisma.sessionNotice.deleteMany({
      where: { sessionId, singerId: { in: removed } },
    });

    return { told: res.sent };
  } catch (e) {
    // Same rule as every other notification here: never break the edit.
    console.error("notifyRemovals failed", e);
    return { told: 0, skipped: "error" };
  }
}
