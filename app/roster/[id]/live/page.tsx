import { prisma } from "@/lib/db";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { jobsOf, runsSound } from "@/lib/sessionView";
import { LiveBoard, type LiveSlot } from "./LiveBoard";
import { planTablas } from "@/lib/tablaPlan";

/**
 * What both the roster and the desk call the drum.
 *
 * The join between a rostered instrument and a desk channel is this word, so it
 * is named once rather than typed twice — see planLiveDesk, which matches on
 * the channel label.
 */
const TABLA = "Tabla";
import type { LiveStrip } from "@/lib/liveDesk";

export const dynamic = "force-dynamic";

/**
 * The live/performance view of one session.
 *
 * A separate route rather than a client-side toggle so it is linkable — the
 * person running the desk can open it straight on their own phone — and so the
 * heavy editing grid is never even sent to the browser.
 */
export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const role = await getRole();

  // Same gate as the session page itself.
  if (!can(role, "setMicCushion")) {
    return (
      <div className="rounded-[14px] border border-card-edge bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">Live view</h1>
        <p className="mt-2 text-sm text-on-surface-muted">
          You need to be signed in as a member or an editor to see this.
        </p>
      </div>
    );
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      category: { select: { name: true, image: true } },
      // Who is on the tabla, for the desk's tabla line. Cheap, and only read
      // when the session says the drum is mic'd.
      instruments: { select: { instrument: true, person: true } },
      slots: {
        include: {
          singer: true,
          chorus: {
            include: { singer: { select: { name: true } } },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          },
          bhajan: { include: { deities: { include: { deity: true } } } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
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

  /*
   * The live view now says WHICH TABLA TO TUNE, not the fifth of the shruti.
   * The fifth was only ever a second-best guess at the answer to this question,
   * and it is still on the roster page for anyone who wants the working.
   */
  const plan = await planTablas(sessionId);
  const tablaByPosition = new Map(plan.slots.map((p) => [p.position, p]));

  const slots: LiveSlot[] = session.slots.map((s) => ({
    position: s.position,
    singerId: s.singerId,
    singerName: s.singer?.name ?? "Unassigned",
    // The chorus mics: who is on them for THIS bhajan, and the colour of each
    // one's cushion. They belong to the bhajan — see SessionSlotChorus.
    chorus: s.chorus.map((c) => ({
      singerId: c.singerId,
      name: c.singer.name,
      cushion: c.cushion,
      position: c.position,
    })),
    bhajanTitle:
      s.bhajan?.title ?? s.bhajanTitle ?? s.festivalBhajanTitle ?? s.inputOnlyCustomBhajan ?? "—",
    bhajanId: s.bhajanId,
    deities: s.bhajan?.deities.map((d) => d.deity.name) ?? [],
    raga: s.bhajan?.raga?.trim() || null,
    // Short — the longest in the masterlist is a few hundred characters — so
    // they travel with the board rather than costing a fetch mid-session.
    lyrics: s.bhajan?.lyrics?.trim() || null,
    confirmedPitch: s.confirmedPitch,
    tablaPitch: tablaByPosition.get(s.position)?.choice.note ?? null,
    tablaWhy: tablaByPosition.get(s.position)?.choice.why ?? null,
  }));

  // Removed sessions do not have a live view either — see /roster/[id].
  if (session.archivedAt) {
    return (
      <div className="rounded-[14px] border border-card-edge bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">This session was removed</h1>
        <p className="mt-2 text-sm text-on-surface-muted">
          It is in the archive. Ask the coordinator if it should come back.
        </p>
      </div>
    );
  }

  /*
   * THE DESK THIS SESSION IS MIXED ON.
   *
   * The one it has been put on, else whichever is ticked as the default —
   * Sailavan wanted an ordinary Thursday to just work, and the festival patch
   * to be a deliberate choice on the night it is used. Read live rather than
   * snapshotted: a bhajan session has no historical channel record to protect,
   * so tidying a desk fixes every session at once. See live/deskActions.ts.
   */
  const desk = session.noDesk
    ? null
    : (session.deskId
        ? await prisma.desk.findUnique({
            where: { id: session.deskId },
            include: { channels: { orderBy: { number: "asc" } } },
          })
        : null) ??
      (await prisma.desk.findFirst({
        where: { isDefault: true },
        include: { channels: { orderBy: { number: "asc" } } },
      })) ??
      (await prisma.desk.findFirst({
        orderBy: { name: "asc" },
        include: { channels: { orderBy: { number: "asc" } } },
      }));

  /*
   * Who may change which desk this session is on.
   *
   * Sailavan: "the sound desk configuration option for the live view in bhajans
   * should only be visible to editors and people designated as mic coordinators
   * or sound engineer." The two jobs are roles on the person now; the action
   * re-checks the same rule, because hiding a control is not a permission.
   */
  const me = await getSignedInSinger();
  const runsTheSound = runsSound(jobsOf(me));
  const canSetUpDesk = can(role, "editPrograms") || runsTheSound;

  const deskChoices = desk
    ? await prisma.desk.findMany({
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true, name: true },
      })
    : [];

  /*
   * A DESK's channel number is an Int; a PROGRAMME's snapshot of one is a
   * string, because a snapshot can say "13/14". Already ordered by the query,
   * so nothing needs re-sorting here.
   */
  const strips: LiveStrip[] = desk
    ? desk.channels.map((c) => ({
        id: c.id,
        number: String(c.number),
        label: c.label,
        kind: c.kind as string,
        colour: c.colour,
        mic: c.mic,
        stereo: c.stereo,
      }))
    : [];

  const heading = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(session.date);

  /*
   * Kept to one short fact. The confirmed-pitch tally and the note about
   * cushions updating were both true and both noise on a screen whose whole
   * job is to show the bhajan and the pitch — the pitches are right there to
   * be read, and the cushions visibly change on their own.
   */
  const subheading = `${slots.length} bhajan${slots.length === 1 ? "" : "s"}`;

  return (
    <LiveBoard
      sessionId={session.id}
      heading={heading}
      subheading={subheading}
      categoryName={session.category?.name ?? null}
      categoryImage={session.category?.image ?? null}
      slots={slots}
      /*
       * Sailavan: "open the live board on that user should go straight into the
       * desk view rather than the bhajan live view". Just so — somebody down as
       * sound engineer or mic coordinator came to run the desk, and the toggle
       * is one press away for the times they want the bhajans.
       *
       * Deliberately NOT editors. An editor opening a session is far more
       * likely to be checking the running order than standing at the desk.
       */
      initialView={runsTheSound ? "desk" : "board"}
      desk={
        desk
          ? {
              // Null when the session is riding the default rather than a desk
              // somebody chose — the picker shows "The default desk" for it, so
              // a later change of default follows this session too.
              id: session.deskId,
              name: desk.name,
              strips,
              choices: deskChoices,
              currentPosition: session.currentItemPosition,
              canSetUp: canSetUpDesk,
              /*
               * The tabla line, when there is a mic on the drum.
               *
               * Sailavan, 2026-08-19: "all sessions should have an option to
               * say tabla is mic'd, and then that channel shows on the desk
               * view (as long as its allocated in the sound desk, which it is
               * currently)." Channel 9 is already labelled Tabla; this is the
               * half that was missing.
               */
              instruments: session.tablaMicd
                ? [
                    {
                      label: TABLA,
                      person:
                        session.instruments.find(
                          (i) => i.instrument.trim().toLowerCase() === TABLA.toLowerCase(),
                        )?.person ?? null,
                    },
                  ]
                : [],
            }
          : null
      }
    />
  );
}
