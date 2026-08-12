import { prisma } from "@/lib/db";
import { rosteredSingerIds } from "@/lib/notifyRemoval";

/**
 * lib/rosterChange.ts — noting when the PEOPLE on a session changed.
 *
 * Session.rosterChangedAt answers one question: has this roster settled? It
 * has to be stamped only when the set of rostered singers changes, and not
 * when anything else about the session does — filling in a pitch an hour after
 * the singers were decided must not reset the clock, or the quiet "the roster
 * is up" would never go out on a session anybody keeps editing.
 *
 * Called with the set of singers as it was BEFORE the change, which every
 * caller already reads for lib/notifyRemoval.ts.
 */
export async function noteRosterChange(
  sessionId: string,
  before: readonly string[],
  now: Date = new Date(),
): Promise<{ changed: boolean }> {
  try {
    const after = await rosteredSingerIds(sessionId);
    const same =
      after.length === before.length && after.every((id) => before.includes(id));
    if (same) return { changed: false };

    await prisma.session.update({
      where: { id: sessionId },
      data: { rosterChangedAt: now },
    });
    return { changed: true };
  } catch (e) {
    // Never break a save over bookkeeping. The hourly job still catches it.
    console.error("noteRosterChange failed", e);
    return { changed: false };
  }
}
