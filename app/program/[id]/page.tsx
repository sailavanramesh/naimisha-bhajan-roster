import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRole, can, getSignedInSinger, type Role } from "@/lib/auth";
import { jobsOf, runsSound } from "@/lib/sessionView";
import { NoAccess } from "@/components/RequireRole";
import { Card, CardContent } from "@/components/ui";
import { SessionMetaPanel } from "@/app/roster/[id]/SessionMetaPanel";
import { DeleteSessionButton } from "@/app/roster/[id]/DeleteSessionButton";
import { timeLabel } from "@/lib/sessionsOfDay";
import { ProgramEditor } from "./ProgramEditor";
import { ChannelGrid } from "./ChannelGrid";
import { occupantFor, sharedName, sortChannels } from "@/lib/deskChannels";

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
      desk: { select: { id: true, name: true } },
      channels: {
        include: {
          singer: { select: { name: true } },
          instrument: { select: { name: true } },
          withSinger: { select: { name: true } },
        },
      },
      programItems: {
        orderBy: { position: "asc" },
        include: {
          song: {
            select: {
              title: true,
              // The words, so they can be read and edited ON the item rather
              // than two hops away in the catalogue.
              verses: {
                orderBy: { order: "asc" },
                select: { id: true, label: true, script: true, roman: true, meaning: true },
              },
            },
          },
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
              withSingerId: true,
              withPerson: true,
              singer: { select: { name: true } },
              instrument: { select: { name: true } },
              withSinger: { select: { name: true } },
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

  /*
   * Removed, and therefore not here — including for whoever still has the link
   * open in a tab. Nothing else leads here any more; this is the one door left,
   * and it says where the programme went rather than showing it as if nothing
   * had happened.
   */
  if (session.archivedAt) return <Removed kind="programme" role={role} />;

  const canEdit = can(role, "editPrograms");

  /*
   * Who may SET UP THE DESK on this programme — which desk it is on, taking its
   * strips again, and the channel list.
   *
   * Sailavan: those "shouldn't be available to anyone but editors and people
   * marked as sound engineers or mic coordinators". Both are now roles on the
   * PERSON, set in /admin, so this asks one question instead of the two it used
   * to — a per-night crew row and a standing grant that always agreed with it.
   *
   * Only for somebody the app can name: a shared access link is not a person,
   * so it cannot hold a job.
   */
  const me = await getSignedInSinger();
  const canSetUpDesk = canEdit || runsSound(jobsOf(me));

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

  /*
   * Guests: everybody named on this programme who is not a roster singer.
   *
   * They sing and they need a mic, so they belong in the channel picker —
   * Sailavan, 2026-08-17. Taken from the programme rather than from a table,
   * because that is the only place a guest exists: a ProgramPerformer with a
   * name and no singerId, or somebody typed in as playing an instrument.
   * De-duplicated case-insensitively, since the same guest gets typed twice.
   */
  const guests = (() => {
    const byLower = new Map<string, string>();
    for (const item of session.programItems) {
      for (const p of item.performers) {
        const name = (p.singerId ? null : p.name)?.trim();
        if (name) byLower.set(name.toLowerCase(), name);
      }
      for (const i of item.instruments) {
        const name = (i.singerId ? null : i.person)?.trim();
        if (name) byLower.set(name.toLowerCase(), name);
      }
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
  })();

  const items = session.programItems.map((item) => ({
    id: item.id,
    position: item.position,
    kind: item.kind,
    songId: item.songId,
    songTitle: item.song?.title ?? null,
    verses: item.song?.verses ?? [],
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
              // The column is @db.Date, so the ISO day is the whole value.
              date: session.date.toISOString().slice(0, 10),
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
          withSingerId: c.withSingerId,
          withPerson: c.withPerson,
          person: c.person,
          // What to show in brackets: the person on it, or the instrument.
          who: sharedName(
            c.singer?.name ?? c.person ?? c.instrument?.name ?? null,
            c.withSinger?.name ?? c.withPerson,
          ),
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
              withSingerId: c.withSingerId,
              withPerson: c.withPerson,
              who: sharedName(
                occupantFor(
                  { who: null },
                  {
                    instrumentName: c.instrument?.name,
                    singerName: c.singer?.name,
                    person: c.person,
                  },
                ),
                c.withSinger?.name ?? c.withPerson,
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
                withSingerId: string | null;
                withPerson: string | null;
                who: string;
              } =>
                s.who !== null,
            ),
        }))}
        singers={singers}
        instruments={instruments}
        guests={guests}
        canEdit={canEdit}
        canSetUpDesk={canSetUpDesk}
      />

      {/*
        "Who is running it" used to sit here — two pickers naming the sound
        engineer and the mic coordinator for this one programme. Gone entirely
        as of 2026-08-18: both are roles on the person now, set once in /admin,
        so there was nothing left for a per-programme card to say.
      */}

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


/**
 * What is left where an archived session used to be.
 *
 * Deliberately not a 404: the person reading this pressed a link that worked
 * yesterday, and "not found" would send them looking for a bug. An owner is
 * told where to go about it; everybody else is told who to ask.
 */
function Removed({ kind, role }: { kind: "programme" | "session"; role: Role }) {
  return (
    <div className="rounded-[14px] border border-card-edge bg-surface p-6">
      <h1 className="font-display text-2xl font-semibold">This {kind} was removed</h1>
      <p className="mt-2 max-w-prose text-sm text-on-surface-muted">
        It is in the archive rather than gone — nothing on it has been touched, and putting it
        back restores it exactly as it was.
      </p>
      <p className="mt-2 text-sm text-on-surface-muted">
        {can(role, "manageArchive") ? (
          <Link href="/admin/archive" className="underline underline-offset-2">
            Review the archive →
          </Link>
        ) : (
          "Ask the coordinator if it should come back."
        )}
      </p>
    </div>
  );
}
