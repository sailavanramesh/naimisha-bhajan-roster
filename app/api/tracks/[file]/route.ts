import { serveTrack } from "@/lib/trackServing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve any stored audio file, a piece at a time.
 *
 * Programme audio and bhajan recordings sit in the same directory and are the
 * same kind of thing, so there is one route for both. The rules — Range
 * handling, the strict name check, who may listen — are in lib/trackServing.ts.
 */
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  return serveTrack(req, file);
}
