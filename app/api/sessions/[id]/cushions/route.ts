import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRole, can } from "@/lib/auth";

/**
 * The poll endpoint behind the mic cushion dots.
 *
 * Kept as a route handler rather than a Server Action because it runs every
 * few seconds per device: it returns a few hundred bytes of JSON instead of an
 * RSC payload, and it does not re-render the page.
 *
 * Why polling rather than SSE or WebSockets: this runs on a single B1 App
 * Service instance behind the Azure front end, where a held-open connection
 * per device is the fragile option (idle timeouts, no sticky guarantees). For
 * a handful of phones in a hall, a small GET every few seconds is both cheaper
 * to reason about and more robust, and a few seconds of latency is well inside
 * what setting up a sound desk needs.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  // Same gate as seeing the roster at all — this leaks who is singing tonight.
  if (!can(role, "setMicCushion")) {
    return NextResponse.json({ error: "not permitted" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const rows = await prisma.micCushion.findMany({
    where: { sessionId: id },
    select: { singerId: true, colour: true, updatedAt: true, setByName: true },
  });

  return NextResponse.json(
    {
      cushions: rows.map((r) => ({
        singerId: r.singerId,
        colour: r.colour,
        updatedAt: r.updatedAt.getTime(),
        setByName: r.setByName,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
