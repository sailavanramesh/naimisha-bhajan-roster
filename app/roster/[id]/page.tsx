import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import { SessionSingersGrid } from "./SessionSingersGrid";
import { getPitchSuggestions } from "@/lib/pitchSuggestions";
import { computeRecommendedPitch } from "@/lib/computeRecommendedPitch";
import { deleteInstrumentRow, updateSessionNotes } from "./actions";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { planTablas } from "@/lib/tablaPlan";
import { TablaPanel } from "./TablaPanel";
import { CopyRowsPanel } from "./CopyRowsPanel";
import { SessionMetaPanel } from "./SessionMetaPanel";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { NotifyPanel } from "./NotifyPanel";
import { melbourneTodayISO } from "@/lib/dates";
import { sortByStart, sessionLabel, hasSeveral } from "@/lib/sessionsOfDay";
import { missingParts } from "@/lib/notify";
import type { NotifyPerson } from "./NotifyPanel";

export const dynamic = "force-dynamic";
/** One look for every action in the session header. */
const PILL =
  "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-rule-surface px-3 text-[13px] hover:border-brass/50";

/**
 * Everybody rostered on this session, once each, with what their row still
 * lacks and whether a notification would actually land anywhere.
 *
 * Phrased for a human rather than returned as flags: an editor deciding
 * whether to poke somebody wants to read "no pitch yet", not interpret a pair
 * of booleans.
 */
async function notifyCandidates(sessionId: string): Promise<NotifyPerson[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { sessionId, singerId: { not: null } },
    orderBy: { position: "asc" },
    select: {
      singerId: true,
      confirmedPitch: true,
      bhajanTitle: true,
      festivalBhajanTitle: true,
      bhajan: { select: { title: true } },
      singer: { select: { id: true, name: true } },
    },
  });
  if (slots.length === 0) return [];

  const subscribed = new Set(
    (
      await prisma.pushSubscription.findMany({
        where: { singerId: { in: slots.map((s) => s.singerId!) } },
        select: { singerId: true },
        distinct: ["singerId"],
      })
    ).map((s) => s.singerId),
  );

  const byPerson = new Map<string, NotifyPerson>();
  for (const slot of slots) {
    if (!slot.singer) continue;
    const missing = missingParts({
      bhajanTitle: slot.bhajan?.title ?? slot.bhajanTitle ?? slot.festivalBhajanTitle ?? null,
      confirmedPitch: slot.confirmedPitch,
    });
    const existing = byPerson.get(slot.singer.id);
    // First gap wins, same as the automatic nudge, so the two agree.
    if (existing && (existing.gap || missing.length === 0)) continue;
    byPerson.set(slot.singer.id, {
      id: slot.singer.id,
      name: slot.singer.name,
      gap:
        missing.length === 2
          ? "no bhajan or pitch yet"
          : missing[0] === "bhajan"
            ? "no bhajan yet"
            : missing[0] === "pitch"
              ? "no confirmed pitch yet"
              : "",
      hasDevice: subscribed.has(slot.singer.id),
    });
  }
  return [...byPerson.values()];
}

export default async function RosterSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;

  const cookieStore = await cookies();
  void cookieStore;
  const role = await getRole();
  const canEdit = can(role, "editSlotBhajan");
  const canAssign = can(role, "assignSingers");
  // Any signed-in user, editor or member: this is live sound-desk state.
  const canSetMicCushion = can(role, "setMicCushion");

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      slots: {
        include: {
          singer: true,
          bhajan: { include: { deities: { include: { deity: true } } } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      instruments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) return <div>Not found</div>;

  const sid = session.id;

  /*
   * "Tablas to bring" is for the person who has to carry and tune them, so it
   * is shown only to somebody listed as a tabla player on the instrument
   * roster. Everyone else's page simply starts at the entries.
   *
   * This needs a NAME, so it depends on Google sign-in. Somebody using a
   * shared access link is anonymous by construction and will not see it, which
   * is correct rather than a gap: the panel is addressed to a person.
   */
  const me = await getSignedInSinger();
  const isTablaPlayer = me
    ? (await prisma.instrumentPerson.count({
        where: { person: me.name, instrument: { contains: "abla", mode: "insensitive" } },
      })) > 0
    : false;

  const tablaPlan = isTablaPlayer ? await planTablas(sessionId) : null;

  /*
   * Who could be sent a reminder by hand, and whether it would reach them.
   *
   * Only queried for somebody who may actually send one — this is two extra
   * round trips on a page that already makes several, and a viewer would be
   * paying for a control they never see.
   */
  // Cheap: four rows the centre owns, and the session already has its own.
  const sessionCategories = await prisma.sessionCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  /*
   * The other sessions on this day.
   *
   * Nothing on this page said a day held more than one, so a morning session
   * was reachable only from the calendar. Sailavan: "if a day has multiple
   * sessions, shouldn't i be able to see them all once i go into that day?"
   * Yes — and from the session itself, which is where you already are.
   *
   * Not rendered at all on an ordinary day.
   */
  const sameDay = sortByStart(
    await prisma.session.findMany({
      where: { date: session.date },
      select: {
        id: true,
        startsAt: true,
        category: { select: { name: true } },
        _count: { select: { slots: true } },
      },
    }),
  ).map((x) => ({
    id: x.id,
    startsAt: x.startsAt,
    categoryName: x.category?.name ?? null,
    entries: x._count.slots,
  }));

  const canNotify = can(role, "notifySingers");
  const notifyPeople = canNotify ? await notifyCandidates(sessionId) : [];

  // The grid recomputes a row's tabla in the browser as the pitch is edited,
  // so it needs the overrides rather than a pre-computed answer.
  /*
   * The sessions either side, by date. Rostering runs in sequence — you look at
   * last Thursday to see what was sung, then at next Thursday to plan — and
   * going back to the calendar between each was the only way to move.
   *
   * Adjacent by DATE, not by id: ids are cuids and carry no order, and a
   * session created later can sit earlier in the calendar.
   */
  /*
   * Only days with a bhajan actually scheduled. A session record can outlive
   * its contents — build one, empty it, and the row remains — and stepping
   * through those was landing on blank days that are indistinguishable from a
   * day with nothing on it.
   *
   * A bhajan may be recorded three ways: linked to the masterlist, or as free
   * text kept from the sheet, or as a festival title. Any of them counts.
   */
  // Not `as const`: Prisma's filter type wants a mutable array.
  const HAS_A_BHAJAN = {
    some: {
      OR: [
        { bhajanId: { not: null } },
        { bhajanTitle: { not: null } },
        { festivalBhajanTitle: { not: null } },
      ],
    },
  };

  const [previousSession, nextSession] = await Promise.all([
    prisma.session.findFirst({
      where: { date: { lt: session.date }, slots: HAS_A_BHAJAN },
      orderBy: { date: "desc" },
      select: { id: true, date: true },
    }),
    prisma.session.findFirst({
      where: { date: { gt: session.date }, slots: HAS_A_BHAJAN },
      orderBy: { date: "asc" },
      select: { id: true, date: true },
    }),
  ]);

  const shortDate = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(d);

  const tablaOverrides = Object.fromEntries(
    (await prisma.tablaOverride.findMany({ select: { raga: true, sa: true, note: true } })).map(
      (o) => [`${o.raga}|${o.sa}`, o.note],
    ),
  );

  const allSingers = canAssign
    ? await prisma.singer.findMany({ where: { gender: { not: null } }, orderBy: { name: "asc" } })
    : [];

  const initialRows = session.slots.map((x) => ({
    id: x.id,
    singerId: x.singerId ?? "",
    singerName: x.singer?.name ?? "Unassigned",
    singerGender: x.singer?.gender ?? null,
    bhajanId: x.bhajanId,
    bhajanTitle: x.bhajanTitle,
    festivalBhajanTitle: x.festivalBhajanTitle,
    confirmedPitch: x.confirmedPitch,
    alternativeTablaPitch: x.alternativeTablaPitch,
    // Carried so a save can detect that somebody else got there first.
    updatedAt: x.updatedAt.toISOString(),
    // Derived on read (CLAUDE.md rule 5), not stored. Where the slot's title
    // never resolved to a masterlist bhajan — 11 rows do not — fall back to the
    // recommendation the sheet recorded, so the column is not blank.
    recommendedPitch:
      computeRecommendedPitch(x.singer?.gender ?? null, x.bhajan) || x.historicalRecommendedPitch || null,
    raga: x.bhajan?.raga ?? null,
    deities: x.bhajan?.deities.map((d) => d.deity.name) ?? [],
  }));

  const suggestions = await getPitchSuggestions();

  async function onUpdateNotes(formData: FormData) {
    "use server";
    await updateSessionNotes(sid, String(formData.get("notes") || ""));
  }

  async function onAddInstrument(formData: FormData) {
    "use server";
    const instrument = String(formData.get("instrument") || "").trim();
    const person = String(formData.get("person") || "").trim();
    if (!instrument) return;

    await prisma.sessionInstrument.create({
      data: { sessionId: sid, instrument, person: person || null },
    });
  }

  const sessionDay = new Date(session.date);
  const rosterDay = sessionDay.toISOString().slice(0, 10);
  const rosterMonth = `${sessionDay.getUTCFullYear()}-${String(sessionDay.getUTCMonth() + 1).padStart(2, "0")}`;
  const backToRosterHref = `/roster?view=calendar&m=${rosterMonth}&d=${rosterDay}`;

  const dateLabel = new Date(session.date).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="grid gap-4">
      {tablaPlan ? (
        <TablaPanel
        sessionId={sessionId}
        canEdit={can(role, "editConfirmedPitch")}
        calls={tablaPlan.calls.map((c) => ({
          note: c.note,
          forBhajans: c.forBhajans,
          anyAssumed: c.anyAssumed,
        }))}
        slots={tablaPlan.slots.map((sl) => ({
          position: sl.position,
          title: sl.title,
          raga: sl.raga,
          confirmedPitch: sl.confirmedPitch,
          sa: sl.sa,
          note: sl.choice.note,
          why: sl.choice.why,
          confidence: sl.choice.confidence,
          overridden: sl.overridden,
          alternatives: sl.choice.alternativesIfNone,
        }))}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{dateLabel}</CardTitle>

          <div className="mt-2 grid gap-2 text-sm">
            {/*
              One row of no-wrap pills that wraps BETWEEN items.

              This was a plain `flex` with no wrap, so on a phone the items
              squeezed into narrow columns and each label wrapped inside itself
              — "Back to roster" came out as three stacked lines. Letting the
              row wrap between items and forbidding a break inside one turns
              six squashed columns into two tidy lines.

              They also all look the same now. A mix of underlined text links
              and pills made the row read as more things than it is; only Live
              view keeps its own emphasis, because it is the one you reach for
              standing at the desk rather than while editing.
            */}
            {hasSeveral(sameDay) ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-on-surface-muted">
                  {sameDay.length} sessions today:
                </span>
                {sameDay.map((x) => {
                  const isCurrent = x.id === sessionId;
                  return (
                    <Link
                      key={x.id}
                      href={`/roster/${x.id}`}
                      aria-current={isCurrent ? "page" : undefined}
                      className={[
                        "whitespace-nowrap rounded-full border px-3 py-1",
                        isCurrent
                          ? "border-brass bg-brass/15 font-semibold text-on-surface"
                          : "border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
                      ].join(" ")}
                    >
                      {sessionLabel(x)}
                      <span className="ms-1.5 text-on-surface-muted">
                        {x.entries === 0 ? "empty" : x.entries}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              {/* No standing edit-mode pill: see app/roster/page.tsx. */}
              <Link href={backToRosterHref} className={PILL}>
                Roster
              </Link>

              {/* Editors only — members cannot assign singers, so the link
                  would lead them to a refusal. */}
              {canAssign ? (
                <Link href={`/roster/${sessionId}/assign`} className={PILL}>
                  Assign
                </Link>
              ) : null}

              {/* Step through the sessions in date order. */}
              {previousSession ? (
                <Link
                  href={`/roster/${previousSession.id}`}
                  className={PILL}
                  title={`Previous session — ${shortDate(previousSession.date)}`}
                >
                  ← {shortDate(previousSession.date)}
                </Link>
              ) : null}
              {nextSession ? (
                <Link
                  href={`/roster/${nextSession.id}`}
                  className={PILL}
                  title={`Next session — ${shortDate(nextSession.date)}`}
                >
                  {shortDate(nextSession.date)} →
                </Link>
              ) : null}

              <Link href={`/roster/${sessionId}/print`} className={PILL}>
                Print
              </Link>

              <Link
                href={`/roster/${sessionId}/live`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-brass/45 bg-brass/10 px-3 text-[13px] font-semibold text-brass-ink hover:border-brass/70"
              >
                <span aria-hidden>▶</span> Live view
              </Link>
            </div>

          </div>
        </CardHeader>

        <CardContent className="grid gap-6">
          {/* Main roster grid */}
          <SessionSingersGrid
            canEdit={canEdit}
            canSetMicCushion={canSetMicCushion}
            tablaOverrides={tablaOverrides}
            sessionId={sessionId}
            singers={allSingers}
            canAssign={canAssign}
            initialRows={initialRows}
            suggestions={suggestions}
          />

          {canEdit ? (
            <CopyRowsPanel
              sessionId={sessionId}
              todayISO={melbourneTodayISO()}
              rows={session.slots.map((x) => ({
                id: x.id,
                position: x.position,
                singerName: x.singer?.name ?? "Unassigned",
                bhajanTitle:
                  x.bhajan?.title ?? x.bhajanTitle ?? x.festivalBhajanTitle ?? "no bhajan",
                confirmedPitch: x.confirmedPitch,
              }))}
            />
          ) : null}

          {canNotify ? <NotifyPanel sessionId={sessionId} people={notifyPeople} /> : null}

          <SessionMetaPanel
            sessionId={sessionId}
            categories={sessionCategories}
            canEdit={can(role, "editSessionNotes")}
            initial={{
              categoryId: session.categoryId,
              topic: session.topic,
              startsAt: session.startsAt,
            }}
          />

          {/* Collapsible: Instruments */}
          <details className="rounded-[12px] border border-rule-surface bg-panel">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Instruments</span>
              <span className="text-xs font-normal text-on-surface-muted">
                {session.instruments.length
                  ? `${session.instruments.length} item${session.instruments.length === 1 ? "" : "s"}`
                  : "None"}
              </span>
            </summary>

            <div className="px-4 pb-4 pt-0 grid gap-3">
              {canEdit ? (
                <form action={onAddInstrument} className="rounded-[12px] border bg-panel p-3 grid gap-2">
                  <div className="text-sm font-medium">Add instrument</div>
                  <Input name="instrument" placeholder="Instrument (e.g., Tabla)" />
                  <Input name="person" placeholder="Person (optional)" />
                  <div>
                    <Button type="submit">Add</Button>
                  </div>
                </form>
              ) : null}

              <div className="grid gap-2">
                {session.instruments.length === 0 ? (
                  <div className="text-sm text-on-surface-muted">No instrument assignments.</div>
                ) : (
                  session.instruments.map((i) => (
                    <div key={i.id} className="rounded-[12px] border border-rule-surface bg-panel p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{i.instrument}</div>
                          <div className="text-on-surface-muted">{i.person ?? "—"}</div>
                        </div>

                        {canEdit ? (
                          <form
                            action={async () => {
                              "use server";
                              await deleteInstrumentRow(i.id);
                            }}
                          >
                            <Button type="submit" className="border-red-300 text-red-700 hover:bg-red-50">
                              Delete
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>

          {/* Collapsible: Notes */}
          <details className="rounded-[12px] border border-rule-surface bg-panel">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Notes</span>
              <span className="text-xs font-normal text-on-surface-muted">
                {(session.notes?.trim()?.length ?? 0) > 0 ? "Has notes" : "Empty"}
              </span>
            </summary>

            <div className="px-4 pb-4 pt-0 grid gap-2">
              {canEdit ? (
                <form action={onUpdateNotes} className="grid gap-2">
                  <textarea
                    name="notes"
                    defaultValue={session.notes ?? ""}
                    className="min-h-[80px] w-full rounded-[12px] border p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    placeholder="Session notes…"
                  />
                  <div>
                    <Button type="submit">Save notes</Button>
                  </div>
                </form>
              ) : (
                <div className="rounded-[12px] border border-rule-surface bg-panel p-3 text-sm whitespace-pre-wrap">
                  {session.notes ?? "—"}
                </div>
              )}
            </div>
          </details>

          {/* Last on the page, and quiet. See DeleteSessionButton. */}
          {can(role, "buildSessions") ? (
            <DeleteSessionButton
              sessionId={sessionId}
              dateLabel={dateLabel}
              rows={session.slots.length}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}