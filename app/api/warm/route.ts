import { NextRequest, NextResponse } from "next/server";
import { getFacetOptions } from "@/lib/candidateQueries";

export const dynamic = "force-dynamic";

/**
 * POST /api/warm — read the masterlist once, so the first real visitor does not.
 *
 * A restart empties the `masterlist` cache (lib/candidateQueries.ts,
 * `unstable_cache`, 3,607 rows, one-hour backstop). Measured 2026-08-21, that
 * read IS the cost of /explore — rendering one bhajan instead of fifty changed
 * the page by nothing, because the fixed part is all of it. So the first person
 * onto /explore after a deploy pays for the whole table, and on 2026-08-24 that
 * person was Sailavan, watching "Finding another set…" spin.
 *
 * `getFacetOptions` is the cheapest way in: it goes through `loadMasterlist`,
 * which is what fills the cache. What it returns is thrown away — the point is
 * the side effect.
 *
 * Called by the deploy workflow after the health check passes. Guarded by the
 * same shared secret as the nudge endpoint rather than a new one: it is the
 * same kind of caller, a workflow with no person in it, and one secret to
 * rotate is better than two. Without the secret set it refuses, so it cannot
 * become an unauthenticated way to make the server read its biggest table.
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

  const started = Date.now();
  try {
    const facets = await getFacetOptions();
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      deities: facets.deities.length,
    });
  } catch (e) {
    // A warm-up that fails must never fail the deploy. It is an optimisation.
    console.error("warm failed", e);
    return NextResponse.json({ ok: false, error: "failed", ms: Date.now() - started });
  }
}
