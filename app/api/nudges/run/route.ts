import { NextRequest, NextResponse } from "next/server";
import { runNudges } from "@/lib/nudgeRun";
import { announceSettledRosters } from "@/lib/announceRosters";
import { syncSungRepertoire } from "@/lib/repertoireFromHistory";
import { notifyHarmoniumForSessions } from "@/lib/notifyHarmonium";

export const dynamic = "force-dynamic";

/**
 * POST /api/nudges/run — the clock's way in.
 *
 * Called hourly by .github/workflows/nudge.yml. The schedule is deliberately
 * dumber than the rules: the workflow just says "it is the top of an hour",
 * and the app decides what is due. Daylight saving then costs nothing, and a
 * cron tick that arrives late or twice is harmless.
 *
 * Four jobs. `runNudges` chases people who have not filled their row in on
 * the day. `announceSettledRosters` tells the group about a roster once it has
 * stopped changing — it used to be sent from the save and announced "1 singer
 * rostered" while the coordinator was still adding the other two.
 * `notifyHarmoniumForSessions` tells the harmonium players once every row of a
 * future session has both a bhajan and a shruti, and about any change after
 * that. `syncSungRepertoire` puts what was actually sung onto the singers'
 * lists.
 *
 * The third one has to be here rather than at save time. Rosters are written
 * days ahead, when nothing has been sung yet, and a session nobody edits
 * afterwards would never be recorded at all. `?days=` widens the sweep for a
 * one-off backfill; the hourly run only needs the last few weeks.
 *
 * Guarded by a shared secret rather than by a session, because there is no
 * person here. Without NUDGE_SECRET set the endpoint refuses outright — an
 * unauthenticated route that can push to everybody's phone is not something to
 * leave open by default.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.NUDGE_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }

  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (given !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  try {
    const daysParam = Number(new URL(req.url).searchParams.get("days"));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 10_000) : 21;

    const [nudges, announcements, harmonium, sung] = await Promise.all([
      runNudges(),
      announceSettledRosters(),
      notifyHarmoniumForSessions(),
      syncSungRepertoire(days),
    ]);
    return NextResponse.json({ ok: true, ...nudges, ...announcements, harmonium, sung });
  } catch (e) {
    console.error("runNudges failed", e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
