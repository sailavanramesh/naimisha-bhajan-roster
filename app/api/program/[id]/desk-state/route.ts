import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentItemOf, sortChannels } from "@/lib/deskChannels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the desk should be doing right now, as JSON.
 *
 * Read by nothing yet, and that is on purpose. When the SQ5 arrives, the bridge
 * that drives it will be a small process on a laptop in the hall polling this
 * and speaking MIDI-over-TCP to the desk — outbound only, so nothing has to be
 * opened to the internet. Building the seam now is what stops that work from
 * needing this phase re-cut: the shape below is the contract, and the live desk
 * view is its first consumer in all but name.
 *
 * It answers for the CURRENT item only. A bridge does not want the programme,
 * it wants "channels 1, 4 and 7 open, scene 4, and here is a stamp so you can
 * tell whether anything moved since you last asked".
 *
 * The stamp is the same one the browser polls, so a bridge that holds it can
 * skip its own work on an unchanged answer.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      format: true,
      updatedAt: true,
      currentItemPosition: true,
      desk: { select: { name: true, kind: true } },
      channels: {
        select: {
          id: true,
          number: true,
          label: true,
          kind: true,
          singer: { select: { name: true } },
          person: true,
          instrument: { select: { name: true } },
        },
      },
      programItems: {
        select: {
          id: true,
          position: true,
          kind: true,
          title: true,
          sceneNumber: true,
          song: { select: { title: true } },
          channels: { select: { channelId: true, open: true } },
        },
      },
    },
  });

  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.format !== "program") {
    return NextResponse.json({ error: "not a programme" }, { status: 404 });
  }

  const item = currentItemOf(session.programItems, session.currentItemPosition);
  // Only the channels the item explicitly opens. A channel with no row for this
  // item is closed — absence is a closed fader, never "unknown".
  const openIds = new Set(
    (item?.channels ?? []).filter((c) => c.open).map((c) => c.channelId),
  );

  const channels = sortChannels(session.channels).map((c) => ({
    id: c.id,
    number: c.number,
    label: c.label,
    kind: c.kind,
    who: c.singer?.name ?? c.person ?? c.instrument?.name ?? null,
    open: openIds.has(c.id),
  }));

  return NextResponse.json({
    sessionId: session.id,
    desk: session.desk ? { name: session.desk.name, kind: session.desk.kind } : null,
    /*
     * Null when the running order is empty. A bridge should do nothing at all
     * in that case rather than fall back to some default scene, which would be
     * a desk changing itself for a programme that does not exist yet.
     */
    item: item
      ? {
          id: item.id,
          position: item.position,
          kind: item.kind,
          title: item.song?.title ?? item.title ?? null,
          sceneNumber: item.sceneNumber,
        }
      : null,
    /** True while nobody has advanced the programme off its first item. */
    notStarted: session.currentItemPosition === null,
    itemCount: session.programItems.length,
    channels,
    /** The same stamp /api/sessions/version serves. Cheap to compare. */
    version: session.updatedAt.getTime(),
  });
}
