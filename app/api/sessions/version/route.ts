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
      select: { updatedAt: true, format: true, deskId: true },
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
   * The DESK is part of the stamp, because the cushions on offer are now read
   * off it rather than from a list in the code.
   *
   * Sailavan asked the right question: "if I update it in the sound desk, do
   * the new colours pop up?" On a page load, yes — it is derived server-side.
   * On a board already open on a music stand, only if something tells it to
   * refresh, and nothing here watched DeskChannel. So putting a cushion on
   * channel 4 mid-setup would have reached every device that reloaded and no
   * device that did not, which is the worst of both.
   *
   * One aggregate on an indexed column, and the resolution mirrors
   * lib/sessionDesk.ts: the session's desk, or the default one, because only
   * one session in two hundred names a desk explicitly.
   */
  const deskId =
    session.deskId ??
    (await prisma.desk.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ??
    (await prisma.desk.findFirst({ orderBy: { name: "asc" }, select: { id: true } }))?.id ??
    null;

  if (deskId) {
    const channels = await prisma.deskChannel.aggregate({
      where: { deskId },
      _max: { updatedAt: true },
      _count: { _all: true },
    });
    parts.push(channels._max.updatedAt?.getTime() ?? 0, channels._count._all);
  } else {
    parts.push(0, 0);
  }

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
