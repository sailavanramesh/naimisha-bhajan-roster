import { serveTrack } from "@/lib/trackServing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The old path for programme audio. Kept because it is still in flight.
 *
 * Superseded by /api/tracks/[file] on 2026-08-21, when bhajans got recordings
 * and the "program" in this URL stopped being true. It stays because a
 * programme page already open in somebody's browser holds the old URLs in its
 * markup and will go on requesting them until it is reloaded — and because a
 * track is cached in the browser under whichever URL fetched it.
 *
 * Nothing new should point here. Safe to delete once no client can still be
 * running the old bundle.
 */
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  return serveTrack(req, file);
}
