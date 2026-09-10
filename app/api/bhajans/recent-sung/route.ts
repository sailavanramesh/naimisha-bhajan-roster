import { NextResponse } from "next/server";
import { recentlySungFor } from "@/lib/recentlySungQueries";

/**
 * Has this bhajan been sung lately?
 *
 * The session page already answers this for the rows it renders. This is for
 * the rows that appear AFTER it renders — somebody picking a bhajan out of the
 * masterlist, copying last week's set down, or restoring a draft. The marker
 * has to arrive with the bhajan, not after a save, or it cannot do the one job
 * it has: catching a repeat while the roster is still being built.
 *
 * GET /api/bhajans/recent-sung?ids=a,b,c&asOf=2026-09-17&exclude=<sessionId>
 *   → { recent: { "<bhajanId>": { lastISO, count } } }
 *
 * Bhajans with nothing inside the window are simply absent, so an empty object
 * is the normal answer and means "none of these".
 *
 * Deliberately ungated. It says how often the group sang a devotional song,
 * which is on the public bhajan page already, and gating it would put the
 * marker behind a permission the grid itself does not require.
 */
export const dynamic = "force-dynamic";

/** Enough for the longest Sunday, and a bound on what one request can ask. */
const MAX_IDS = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  const asOf = (searchParams.get("asOf") ?? "").trim();
  if (ids.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json({ recent: {} });
  }

  const exclude = (searchParams.get("exclude") ?? "").trim() || null;
  return NextResponse.json({ recent: await recentlySungFor(ids, asOf, exclude) });
}
