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
      select: { updatedAt: true, format: true },
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
  const parts: (number | string)[] = [
    session.updatedAt.getTime(),
    slots._max.updatedAt?.getTime() ?? 0,
    slots._count._all,
  ];

  /*
   * A programme's content is not in SessionSlot, so the three numbers above say
   * nothing about it — and the desk view watches exactly the things they miss.
   * Opening a channel on an item touches ProgramItemChannel and nothing else,
   * so without this a tick made on the editor would never reach the desk screen
   * standing next to it.
   *
   * Only for programmes. A bhajan session pays for none of it, which matters:
   * this is polled every ten seconds by every board left open on a music stand.
   */
  if (session.format === "program") {
    const [items, channels, open] = await Promise.all([
      prisma.programItem.aggregate({
        where: { sessionId: id },
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
      prisma.sessionChannel.aggregate({
        where: { sessionId: id },
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
      prisma.programItemChannel.aggregate({
        where: { item: { sessionId: id } },
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
    ]);

    parts.push(
      items._max.updatedAt?.getTime() ?? 0,
      items._count._all,
      channels._max.updatedAt?.getTime() ?? 0,
      channels._count._all,
      open._max.updatedAt?.getTime() ?? 0,
      open._count._all,
    );
  }

  return NextResponse.json({ version: parts.join(":") });
}
