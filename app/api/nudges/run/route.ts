import { NextRequest, NextResponse } from "next/server";
import { runNudges } from "@/lib/nudgeRun";
import { announceSettledRosters } from "@/lib/announceRosters";

export const dynamic = "force-dynamic";

/**
 * POST /api/nudges/run — the clock's way in.
 *
 * Called hourly by .github/workflows/nudge.yml. The schedule is deliberately
 * dumber than the rules: the workflow just says "it is the top of an hour",
 * and the app decides what is due. Daylight saving then costs nothing, and a
 * cron tick that arrives late or twice is harmless.
 *
 * Two jobs. `runNudges` chases people who have not filled their row in on the
 * day. `announceSettledRosters` tells the group about a roster once it has
 * stopped changing — it used to be sent from the save and announced "1 singer
 * rostered" while the coordinator was still adding the other two.
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
    const [nudges, announcements] = await Promise.all([
      runNudges(),
      announceSettledRosters(),
    ]);
    return NextResponse.json({ ok: true, ...nudges, ...announcements });
  } catch (e) {
    console.error("runNudges failed", e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
