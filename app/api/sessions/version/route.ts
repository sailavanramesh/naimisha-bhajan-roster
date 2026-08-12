import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A cheap stamp saying whether a session has changed.
 *
 * The live view is read once and then sits open on a music stand for two
 * hours. Mic cushions already poll — they were built for it — but the bhajan,
 * the pitch, the tabla and the running order did not, so a coordinator fixing
 * a shruti at five to seven left the sound desk reading the old one with
 * nothing to suggest it was stale.
 *
 * Deliberately not the session itself: this returns two timestamps and a
 * count, so the poll costs almost nothing and the board only re-fetches when
 * something has actually moved.
 */
export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const [session, slots] = await Promise.all([
    prisma.session.findUnique({
      where: { id },
      select: { updatedAt: true },
    }),
    prisma.sessionSlot.aggregate({
      where: { sessionId: id },
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
  ]);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  // A deletion moves the count without moving any surviving row's timestamp,
  // which is why the count is part of the stamp rather than a nicety.
  const version = [
    session.updatedAt.getTime(),
    slots._max.updatedAt?.getTime() ?? 0,
    slots._count._all,
  ].join(":");

  return NextResponse.json({ version });
}
