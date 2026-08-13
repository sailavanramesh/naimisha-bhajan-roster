import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { LiveBoard, type LiveSlot } from "./LiveBoard";
import { planTablas } from "@/lib/tablaPlan";

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
      slots: {
        include: {
          singer: true,
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
    />
  );
}
