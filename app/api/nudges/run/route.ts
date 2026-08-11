import { NextRequest, NextResponse } from "next/server";
import { runNudges } from "@/lib/nudgeRun";

export const dynamic = "force-dynamic";

/**
 * POST /api/nudges/run — the clock's way in.
 *
 * Called hourly by .github/workflows/nudge.yml. The schedule is deliberately
 * dumber than the rule: the workflow just says "it is the top of an hour", and
 * runNudges decides whether that hour is 3pm or 5pm in Melbourne. Daylight
 * saving then costs nothing, and a cron tick that arrives late or twice is
 * harmless.
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
    const result = await runNudges();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("runNudges failed", e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
