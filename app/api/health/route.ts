import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — "is this instance able to answer yet?"
 *
 * Wired to the App Service `healthCheckPath`, which is the thing that was
 * missing: without it Azure starts routing traffic the moment the CONTAINER
 * starts, rather than when Node can actually serve. That is what produced two
 * 5xx during the 2026-08-24 production deploy and a very slow first page —
 * requests arrived while the new process was still booting.
 *
 * DELIBERATELY TOUCHES NOTHING. No database, no cache, no session. It answers
 * one question — has the JavaScript finished loading and can this process
 * serve a request — and it must not be able to fail for any other reason.
 *
 * The temptation is to check the database here, and it would be actively
 * harmful. There is ONE worker on this plan, and a failing health check tells
 * Azure the instance is sick; a burstable Postgres running out of CPU credits
 * for ninety seconds would then be escalated from "some queries are slow" into
 * "recycle the app", which is strictly worse and would happen at exactly the
 * busiest moment. Liveness, not readiness-of-dependencies.
 *
 * Must stay OUTSIDE the canonical-host redirect — see middleware.ts. Azure
 * probes the instance on its own azurewebsites.net name, and App Service reads
 * a 308 as unhealthy, so a redirect here would mark every instance sick.
 */
export function GET() {
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store, no-cache, must-revalidate" } },
  );
}
