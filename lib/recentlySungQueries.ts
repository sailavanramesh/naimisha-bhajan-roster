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
import {
  MAX_OCCURRENCES,
  RECENT_MONTHS,
  recentCutoffISO,
  type SungBefore,
  type SungOccurrence,
} from "./recentlySung";

/**
 * When each of these bhajans was last sung before a given session, and the
 * evenings themselves.
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
 * ## No lower bound on the query
 *
 * It used to stop at the three-month cutoff. It no longer does, because the
 * marker now has a quiet second state for "sung, but longer ago than that" —
 * see `SungBefore`. The window is applied afterwards, to `recentCount`, so the
 * cutoff is one number in one pure function rather than a date in a WHERE
 * clause and a rule in a component.
 *
 * The cost of dropping it is small and worth naming: the whole roster is 709
 * sung rows across 3,613 bhajans, so "every time these dozen bhajans were sung"
 * is tens of rows, not thousands. If the history ever grows by an order of
 * magnitude this wants a lateral join for the top few per bhajan; it does not
 * want a lower bound back, which would take the quiet state with it.
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
export async function sungBeforeFor(
  bhajanIds: string[],
  asOfISO: string,
  excludeSessionId: string | null,
  months = RECENT_MONTHS,
): Promise<Record<string, SungBefore>> {
  const ids = [...new Set(bhajanIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const cutoffISO = recentCutoffISO(asOfISO, months);
  if (!cutoffISO) return {};

  const asOf = new Date(`${asOfISO}T00:00:00.000Z`);
  if (Number.isNaN(asOf.getTime())) return {};

  /*
   * The upper bound is whichever comes first: the session itself, or the point
   * past which nothing has happened yet. For a session being planned that is
   * the cutoff; for one long past it is the session.
   *
   * This is the COARSE half, in SQL, exactly as pitchQueries.ts does it — the
   * two-hour rule needs each session's own start time and is applied below.
   */
  const coarseCutoff = historyCutoff();
  const to = asOf < coarseCutoff ? asOf : coarseCutoff;

  const slots = await prisma.sessionSlot.findMany({
    where: {
      bhajanId: { in: ids },
      session: {
        ...LIVE_SESSION,
        format: "bhajans",
        date: { lte: to },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
    },
    select: {
      bhajanId: true,
      confirmedPitch: true,
      singer: { select: { name: true } },
      session: { select: { id: true, date: true, startsAt: true } },
    },
    orderBy: { session: { date: "desc" } },
  });

  const nowLocal = melbourneNowLocal();
  const byBhajan = new Map<string, SungOccurrence[]>();

  for (const s of slots) {
    if (!s.bhajanId) continue;
    const dateISO = toISO(s.session.date);
    if (!hasBeenSung(dateISO, s.session.startsAt, nowLocal)) continue;

    const list = byBhajan.get(s.bhajanId) ?? [];
    list.push({
      dateISO,
      sessionId: s.session.id,
      singerName: s.singer?.name ?? null,
      confirmedPitch: s.confirmedPitch,
    });
    byBhajan.set(s.bhajanId, list);
  }

  const out: Record<string, SungBefore> = {};
  for (const [bhajanId, all] of byBhajan) {
    if (all.length === 0) continue;

    /*
     * `orderBy` puts the newest first, but two slots on the SAME evening arrive
     * in whatever order the rows came back, and a Sunday can hold the same
     * bhajan twice. Sorting by date descending here keeps `lastISO` and the
     * listed occurrences honest without depending on that.
     */
    all.sort((a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0));

    out[bhajanId] = {
      lastISO: all[0].dateISO,
      recentCount: all.filter((o) => o.dateISO >= cutoffISO).length,
      occurrences: all.slice(0, MAX_OCCURRENCES),
      more: Math.max(0, all.length - MAX_OCCURRENCES),
    };
  }

  return out;
}
