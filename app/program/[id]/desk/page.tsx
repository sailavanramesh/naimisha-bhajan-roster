import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { sortChannels } from "@/lib/deskChannels";
import { songNumbers, instrumentsLabel, performersLabel } from "@/lib/program";
import { DeskBoard, type DeskChannel, type DeskItem } from "./DeskBoard";

export const dynamic = "force-dynamic";

/**
 * The live desk view of one programme.
 *
 * A separate route rather than a mode on the editor, for the same reasons as
 * the bhajan live board: it is linkable, so the person on the desk opens it on
 * their own phone; and none of the editing machinery is sent to the browser at
 * all.
 *
 * What it is FOR: during a programme the sound desk needs one question answered
 * at a time — which faders are up for the thing happening now. Everything else
 * on the programme page is preparation.
 */
export default async function ProgramDeskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const role = await getRole();

  // Same gate as the bhajan live board, and the same reasoning: this is live
  // desk state, which any signed-in person may see and move.
  if (!can(role, "setMicCushion")) {
    return (
      <div className="rounded-[14px] border border-card-edge bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">Desk view</h1>
        <p className="mt-2 text-sm text-on-surface-muted">
          You need to be signed in as a member or an editor to see this.
        </p>
      </div>
    );
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      category: { select: { name: true } },
      desk: { select: { name: true } },
      channels: {
        include: {
          singer: { select: { name: true } },
          instrument: { select: { name: true } },
        },
      },
      programItems: {
        orderBy: { position: "asc" },
        include: {
          song: { select: { title: true } },
          channels: { select: { channelId: true, open: true } },
          performers: {
            orderBy: { createdAt: "asc" },
            include: { singer: { select: { name: true } } },
          },
          instruments: {
            orderBy: { createdAt: "asc" },
            include: {
              instrument: { select: { name: true } },
              singer: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!session) {
    return (
      <div className="rounded-[14px] border border-card-edge bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">Not found</h1>
      </div>
    );
  }

  if (session.format !== "program") {
    return (
      <div className="rounded-[14px] border border-card-edge bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">Not a programme</h1>
        <p className="mt-2 text-sm text-on-surface-muted">
          This is a bhajan session. Its live view is the board on the roster page.
        </p>
      </div>
    );
  }

  const numbers = songNumbers(session.programItems);

  const items: DeskItem[] = session.programItems.map((item) => ({
    position: item.position,
    kind: item.kind,
    /*
     * The number the group SAYS, which counts only the songs — a narration has
     * none at all. Derived, never stored; see lib/program.ts songNumbers.
     */
    songNumber: numbers.get(item.position) ?? null,
    title:
      item.song?.title?.trim() ||
      item.title?.trim() ||
      (item.kind === "narration" ? "Reading" : "Not chosen yet"),
    sceneNumber: item.sceneNumber,
    pitch: item.pitchLabel?.trim() || item.pitchNote?.trim() || null,
    who: performersLabel(
      item.performers.map((p) => ({
        singerName: p.singer?.name ?? null,
        name: p.name,
        part: p.part,
      })),
    ),
    played: instrumentsLabel(
      item.instruments.map((i) => ({
        instrumentName: i.instrument.name,
        singerName: i.singer?.name ?? null,
        person: i.person,
      })),
    ),
    // Only what the item explicitly opens. A channel with no row here is
    // closed — an absent row is a fader down, never an unknown.
    openChannelIds: item.channels.filter((c) => c.open).map((c) => c.channelId),
  }));

  const channels: DeskChannel[] = sortChannels(session.channels).map((c) => ({
    id: c.id,
    number: c.number,
    label: c.label,
    kind: c.kind,
    who: c.singer?.name ?? (c.person?.trim() || c.instrument?.name || null),
  }));

  const heading = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(session.date);

  return (
    <DeskBoard
      sessionId={session.id}
      heading={heading}
      programName={session.topic?.trim() || session.category?.name || "Music programme"}
      deskName={session.desk?.name ?? null}
      currentPosition={session.currentItemPosition}
      items={items}
      channels={channels}
    />
  );
}
