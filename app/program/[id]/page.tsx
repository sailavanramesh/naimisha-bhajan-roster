import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { SessionMetaPanel } from "@/app/roster/[id]/SessionMetaPanel";
import { DeleteSessionButton } from "@/app/roster/[id]/DeleteSessionButton";
import { timeLabel } from "@/lib/sessionsOfDay";
import { ProgramEditor } from "./ProgramEditor";
import { ProgramCrew } from "./ProgramCrew";
import { ChannelGrid } from "./ChannelGrid";
import { occupantFor, sortChannels } from "@/lib/deskChannels";

export const dynamic = "force-dynamic";

/**
 * One music program.
 *
 * A program is a Session with `format = program`; this page is its content.
 * The bhajan session page is next door and shares the calendar, the category
 * mark and the meta panel with it — everything below that line is different,
 * because a program item is a rehearsed piece with several singers and its own
 * instruments rather than one singer at one shruti.
 */
export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();

  if (!can(role, "viewAllPages") && role === "viewer") {
    return <NoAccess what="This music program" role={role} />;
  }

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      crew: { include: { singer: { select: { id: true, name: true } } } },
      desk: { select: { id: true, name: true } },
      channels: {
        include: {
          singer: { select: { name: true } },
          instrument: { select: { name: true } },
        },
      },
      programItems: {
        orderBy: { position: "asc" },
        include: {
          performers: {
            orderBy: { order: "asc" },
            include: { singer: { select: { id: true, name: true } } },
          },
          instruments: {
            orderBy: { order: "asc" },
            include: {
              instrument: { select: { id: true, name: true } },
              singer: { select: { id: true, name: true } },
            },
          },
          channels: {
            select: {
              channelId: true,
              open: true,
              // The per-item override: who is on this strip for THIS item.
              singerId: true,
              instrumentId: true,
              person: true,
              singer: { select: { name: true } },
              instrument: { select: { name: true } },
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

  // A bhajan session opened at a program URL belongs on the roster page. The
  // reverse redirect lives on that page, so the two links are interchangeable
  // and neither can strand somebody on the wrong editor.
  if (session.format !== "program") redirect(`/roster/${session.id}`);

  const canEdit = can(role, "editPrograms");

  const [singers, instruments, categories, places, desks] = await Promise.all([
    prisma.singer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.instrument.findMany({
      where: { active: true, scope: { in: ["program", "both"] } },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.sessionCategory.findMany({
      where: { scope: "program" },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.session
      .findMany({
        where: { location: { not: null } },
        distinct: ["location"],
        select: { location: true },
        take: 20,
      })
      .then((rows) => rows.map((r) => r.location!).filter(Boolean)),
    prisma.desk.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, _count: { select: { channels: true } } },
    }),
  ]);

  const heading = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(session.date);

  const items = session.programItems.map((item) => ({
    id: item.id,
    position: item.position,
    kind: item.kind,
    songId: item.songId,
    title: item.title ?? "",
    narration: item.narration ?? "",
    pitchNote: item.pitchNote ?? "",
    bpm: item.bpm === null ? "" : String(item.bpm),
    referenceUrl: item.referenceUrl ?? "",
    arrangement: item.arrangement ?? "",
    notes: item.notes ?? "",
    performers: item.performers.map((p) => ({
      id: p.id,
      singerName: p.singer?.name ?? null,
      name: p.name,
      part: p.part,
    })),
    instruments: item.instruments.map((i) => ({
      id: i.id,
      instrumentName: i.instrument.name,
      singerName: i.singer?.name ?? null,
      person: i.person,
    })),
  }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-on-ground-muted">Music program</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {session.topic?.trim() || session.category?.name || "Music program"}
          </h1>
          <p className="mt-0.5 text-sm text-on-ground-muted">
            {heading}
            {session.startsAt ? ` · ${timeLabel(session.startsAt)}` : ""}
          </p>
        </div>
        <Link
          href="/program"
          className="text-sm text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
        >
          All programs
        </Link>
      </div>

      <Card>
        <CardContent className="pt-4">
          <SessionMetaPanel
            sessionId={session.id}
            categories={categories}
            places={places}
            canEdit={canEdit}
            initial={{
              categoryId: session.categoryId,
              topic: session.topic,
              location: session.location,
              startsAt: session.startsAt,
            }}
          />
        </CardContent>
      </Card>

      <ProgramEditor
        sessionId={session.id}
        items={items}
        singers={singers}
        instruments={instruments}
        canEdit={canEdit}
      />

      <ChannelGrid
        sessionId={session.id}
        deskName={session.desk?.name ?? null}
        desks={desks.map((d) => ({ id: d.id, name: d.name, channels: d._count.channels }))}
        channels={sortChannels(session.channels).map((c) => ({
          id: c.id,
          number: c.number,
          label: c.label,
          kind: c.kind,
          colour: c.colour,
          mic: c.mic,
          stereo: c.stereo,
          singerId: c.singerId,
          instrumentId: c.instrumentId,
          person: c.person,
          // What to show in brackets: the person on it, or the instrument.
          who: c.singer?.name ?? c.person ?? c.instrument?.name ?? null,
        }))}
        items={session.programItems.map((item) => ({
          id: item.id,
          position: item.position,
          kind: item.kind,
          title: item.title ?? "",
          sceneNumber: item.sceneNumber === null ? "" : String(item.sceneNumber),
          open: item.channels.filter((c) => c.open).map((c) => c.channelId),
          swaps: item.channels
            .map((c) => ({
              channelId: c.channelId,
              singerId: c.singerId,
              instrumentId: c.instrumentId,
              person: c.person,
              who: occupantFor(
                { who: null },
                {
                  instrumentName: c.instrument?.name,
                  singerName: c.singer?.name,
                  person: c.person,
                },
              ),
            }))
            .filter(
              (
                s,
              ): s is {
                channelId: string;
                singerId: string | null;
                instrumentId: string | null;
                person: string | null;
                who: string;
              } =>
                s.who !== null,
            ),
        }))}
        singers={singers}
        instruments={instruments}
        canEdit={canEdit}
      />

      <Card>
        <CardHeader>
          <CardTitle>Who is running it</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            Somebody on a job here lands on the screen for that job when they open the
            session, instead of hunting for it.
          </p>
        </CardHeader>
        <CardContent>
          <ProgramCrew
            sessionId={session.id}
            singers={singers}
            crew={session.crew.map((c) => ({
              singerId: c.singerId,
              singerName: c.singer.name,
              job: c.job,
            }))}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {canEdit ? (
        <DeleteSessionButton
          sessionId={session.id}
          dateLabel={heading}
          rows={items.length}
          kind="program"
          backTo="/program"
        />
      ) : null}
    </div>
  );
}
