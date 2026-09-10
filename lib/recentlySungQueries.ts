/**
 * lib/recentlySungQueries.ts — the database half of lib/recentlySung.ts.
 *
 * Kept apart from the maths so the maths stays testable without a database, the
 * way lib/pitch.ts and lib/pitchQueries.ts are split.
 */

import { prisma } from "@/lib/db";
import { LIVE_SESSION } from "./archive";
import { historyCutoff, toISO } from "./dates";
import { hasBeenSung, melbourneNowLocal } from "./sungCutoff";
import { RECENT_MONTHS, recentCutoffISO, type RecentSung } from "./recentlySung";

/**
 * How recently each of these bhajans was sung, before a given session.
 *
 * ## What counts as sung
 *
 * The app already has an answer and this uses it rather than inventing a second
 * one: a session counts once it has actually happened — `historyCutoff` by
 * date, then the two-hour rule in lib/sungCutoff.ts against its own start time.
 * A bhajan on next Thursday's roster has NOT been sung; it is a plan. That
 * distinction is load-bearing elsewhere (the bhajan page has a whole
 * "Scheduled to be sung" section built on the other side of it), and a marker
 * here that quietly disagreed would be worse than no marker.
 *
 * Unlike `getSungRowsForBhajan` this does NOT require a confirmed pitch. That
 * filter is right for learning pitch offsets — a row with no pitch teaches
 * nothing — but the question here is only whether the group sang the thing, and
 * plenty of real rows never had a shruti written down.
 *
 * ## The window, and the session's own rows
 *
 * It ends at the SESSION's date, not today's — see lib/recentlySung.ts for why.
 * `excludeSessionId` takes the session being looked at out of its own history,
 * or every bhajan on it would report itself and the marker would be on
 * everything, always.
 *
 * Sessions on the same DAY are deliberately still counted: a bhajan sung at the
 * morning session is exactly the sort of repeat this exists to catch.
 *
 * One query for every row on the page. Round trips are what the burstable
 * database's throttling multiplies (CLAUDE.md), so this is never called per
 * bhajan in a loop.
 */
export async function recentlySungFor(
  bhajanIds: string[],
  asOfISO: string,
  excludeSessionId: string | null,
  months = RECENT_MONTHS,
): Promise<Record<string, RecentSung>> {
  const ids = [...new Set(bhajanIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const cutoffISO = recentCutoffISO(asOfISO, months);
  if (!cutoffISO) return {};

  const from = new Date(`${cutoffISO}T00:00:00.000Z`);
  const asOf = new Date(`${asOfISO}T00:00:00.000Z`);
  if (Number.isNaN(asOf.getTime())) return {};

  /*
   * The upper bound is whichever comes first: the session itself, or the point
   * past which nothing has happened yet. For a session being planned that is
   * the cutoff; for one long past it is the session.
   *
   * This is the COARSE half, in SQL, exactly as pitchQueries.ts does it — the
   * two-hour rule needs each session's own start time and is applied below,
   * over rows already narrowed to a three-month window rather than the whole
   * roster.
   */
  const coarseCutoff = historyCutoff();
  const to = asOf < coarseCutoff ? asOf : coarseCutoff;
  if (to < from) return {};

  const slots = await prisma.sessionSlot.findMany({
    where: {
      bhajanId: { in: ids },
      session: {
        ...LIVE_SESSION,
        format: "bhajans",
        date: { gte: from, lte: to },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
    },
    select: {
      bhajanId: true,
      session: { select: { date: true, startsAt: true } },
    },
    orderBy: { session: { date: "desc" } },
  });

  const nowLocal = melbourneNowLocal();
  const out: Record<string, RecentSung> = {};

  for (const s of slots) {
    if (!s.bhajanId) continue;
    const dateISO = toISO(s.session.date);
    if (!hasBeenSung(dateISO, s.session.startsAt, nowLocal)) continue;

    const seen = out[s.bhajanId];
    if (!seen) out[s.bhajanId] = { lastISO: dateISO, count: 1 };
    else {
      seen.count += 1;
      if (dateISO > seen.lastISO) seen.lastISO = dateISO;
    }
  }

  return out;
}
