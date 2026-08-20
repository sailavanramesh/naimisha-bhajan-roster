import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import { SessionSingersGrid } from "./SessionSingersGrid";
import { getPitchSuggestions } from "@/lib/pitchSuggestions";
import { computeRecommendedPitch } from "@/lib/computeRecommendedPitch";
import { deleteInstrumentRow, updateSessionNotes } from "./actions";
import { getRole, can, getSignedInSinger, canWithGrantsFor } from "@/lib/auth";
import { rosterAvailability } from "@/lib/availabilityQueries";
import { planTablas } from "@/lib/tablaPlan";
import { TablaPanel } from "./TablaPanel";
import { CopyRowsPanel } from "./CopyRowsPanel";
import { SessionMetaPanel } from "./SessionMetaPanel";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { NotifyPanel } from "./NotifyPanel";
import { melbourneTodayISO } from "@/lib/dates";
import { cushionsForSession } from "@/lib/sessionDesk";
import { sortByStart, sessionLabel, hasSeveral, startMinutes, USUAL_START } from "@/lib/sessionsOfDay";
import { DayPanel } from "./DayPanel";
import { resolveSessionView, jobBanner, jobsOf } from "@/lib/sessionView";
import { missingParts } from "@/lib/notify";
import type { NotifyPerson } from "./NotifyPanel";
import { NOT_ARCHIVED } from "@/lib/archive";

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
  /*
   * May this person set the desk up — its strips, and which cushion is on
   * which channel?
   *
   * The DESTINATION'S own rule, not a near-enough one: /admin/desks is gated on
   * `manageDesks` with grants, so asking the same question here means the link
   * can never lead somebody to a refusal. Editors and owners hold it by role;
   * a sound engineer or mic coordinator holds it by their singer row.
   */
  const canManageDesk = await canWithGrantsFor("manageDesks");
  // Any signed-in user, editor or member: this is live sound-desk state.
  const canSetMicCushion = can(role, "setMicCushion");


  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      category: { select: { name: true, image: true } },
      slots: {
        include: {
          singer: true,
          bhajan: { include: { deities: { include: { deity: true } } } },
          chorus: {
            include: { singer: { select: { name: true } } },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      instruments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) return <div>Not found</div>;

  /*
   * A music program has no slots, so this page would render an empty roster
   * grid over it and offer to roster singers into a session that has no such
   * thing. It belongs in its own editor; the matching redirect lives there, so
   * the two URLs are interchangeable and neither can strand somebody.
   */
  if (session.format === "program") redirect(`/program/${session.id}`);

  /*
   * Removed, and therefore not here — including for whoever still has the link
   * open in a tab. Nothing else leads here any more; this is the one door left,
   * and it says where the session went rather than showing it as if nothing had
   * happened.
   */
  if (session.archivedAt) {
    return (
      <div className="rounded-[14px] border border-card-edge bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">This session was removed</h1>
        <p className="mt-2 max-w-prose text-sm text-on-surface-muted">
          It is in the archive rather than gone — nothing on it has been touched, and putting
          it back restores it exactly as it was.
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
  // Bhajan kinds only — the program vocabulary is a different list, and
  // offering "Musical offering" as a kind of Thursday would be nonsense.
/*
   * The cushions on offer come from the DESK, not from a list in the code.
   *
   * Sailavan, 2026-08-19: "if a cushion colour is not ascribed to a channel set
   * for a certain session, then it can't be picked." One list, in channel
   * order, for the lead dots and the chorus dots alike.
   */
  const cushions = await cushionsForSession(session);

  const sessionCategories = await prisma.sessionCategory.findMany({
    where: { scope: "bhajans" },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  /*
   * The jobs this person holds, if any — sound engineer, mic coordinator, both.
   *
   * Read off their singer row rather than out of a per-session crew table: both
   * are roles at the centre now, set in /admin. See lib/sessionView.ts.
   *
   * Shown as an offer rather than acted on as a redirect. Sending somebody
   * straight to the live board would make the session page unreachable for the
   * coordinator who is also on sound — the board's exit button comes back
   * here, and it would bounce them out again. One prominent line does the
   * useful part of the job, which is not having to hunt for the right screen.
   */
  const myJobs = jobsOf(me);
  const myView = resolveSessionView({ sessionId, format: "bhajans", jobs: myJobs });

  // Venues already used, so the field suggests rather than asks people to
  // retype "Naimisha Sai Centre" every week.
  const sessionPlaces = (
    await prisma.session.findMany({
      where: { ...NOT_ARCHIVED, location: { not: null } },
      distinct: ["location"],
      select: { location: true },
      orderBy: { location: "asc" },
    })
  )
    .map((x) => x.location!)
    .filter(Boolean);

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
      where: { ...NOT_ARCHIVED, date: session.date },
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
      where: { ...NOT_ARCHIVED, date: { lt: session.date }, slots: HAS_A_BHAJAN },
      orderBy: { date: "desc" },
      select: { id: true, date: true },
    }),
    prisma.session.findFirst({
      where: { ...NOT_ARCHIVED, date: { gt: session.date }, slots: HAS_A_BHAJAN },
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

  /*
   * The names the grid can offer, for two different controls with two
   * different permissions.
   *
   * It fed only the row's Singer select, which is an allocation, so it was
   * loaded only for somebody who may assign — and a member got an empty list.
   * That was invisible until the chorus mics opened to everybody: the chorus
   * picker reads the same list, so a member saw the column and no way to add
   * anybody to it.
   *
   * Loading it for them is safe. The Singer select and the Delete button are
   * each gated on `canAssign` in the grid itself, not on this being non-empty.
   */
  const allSingers =
    canAssign || can(role, "setMicCushion")
      ? await prisma.singer.findMany({ where: { gender: { not: null } }, orderBy: { name: "asc" } })
      : [];

  /*
   * Anybody on this roster who has since said they cannot sing that night.
   *
   * The coordinators are pushed a notification the moment somebody marks it,
   * but a notification is a thing that can be missed, dismissed on a locked
   * phone, or sent before a person was rostered at all. So the session says it
   * too, every time it is opened, which is the surface nobody can miss.
   *
   * Dates only, as everywhere else — the roster is told THAT somebody cannot
   * sing and never why.
   */
  const sessionISO = session.date.toISOString().slice(0, 10);

  /*
   * A start time for a second session that is not already taken.
   *
   * An hour after the latest one that day, so "add another" lands on something
   * plausible rather than colliding with the session being looked at.
   */
  const latestStart = Math.max(...sameDay.map((x) => startMinutes(x.startsAt)), startMinutes(USUAL_START));
  const suggestedStart = `${String(Math.min(23, Math.floor(latestStart / 60) + 1)).padStart(2, "0")}:${String(latestStart % 60).padStart(2, "0")}`;
  const unavailableIds = new Set(
    (await rosterAvailability(sessionISO, sessionISO)).map((a) => a.singerId),
  );
  const droppedOut = [
    ...new Map(
      session.slots
        .filter((x) => x.singerId && unavailableIds.has(x.singerId))
        .map((x) => [x.singerId as string, x.singer?.name ?? "Somebody"]),
    ).values(),
  ];

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
    // The chorus mics. Read here, written by ChorusCell on its own — never
    // through the grid's save, which carries the historical record.
    chorus: x.chorus.map((c) => ({
      singerId: c.singerId,
      name: c.singer.name,
      cushion: c.cushion,
      position: c.position,
    })),
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
  /*
   * No `view=` here, deliberately.
   *
   * This link used to force the calendar. An explicit view always beats a
   * saved default — that is what makes a shared link show what was meant — so
   * anybody whose default is the LIST got the calendar every time they came
   * back from a session. Since the app opens on the nearest session, that is
   * the normal way in, and it read as the setting being ignored. It was.
   *
   * The month and day stay: they cost nothing when the list is showing, and
   * they put the calendar on the right month when it is.
   */
  const backToRosterHref = `/roster?m=${rosterMonth}&d=${rosterDay}`;

  /*
   * "en-AU" and UTC, not the runtime's guesses at either.
   *
   * `session.date` is a `@db.Date`, which arrives as midnight UTC. Formatting
   * that in the reader's own zone is what puts a Thursday session on Wednesday
   * for anybody west of UTC — the date is a calendar date, so it has to be read
   * back on the calendar it was written on. The locale is pinned for the same
   * reason every other date in the app pins it: `undefined` asks each engine
   * for its own, and they disagree.
   */
  const dateLabel = new Date(session.date).toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="grid gap-4">
      {myView.forJob ? (
        <Link
          href={myView.href}
          className="flex items-center justify-between gap-3 rounded-[14px] border border-brass/50 bg-surface px-4 py-2.5 text-sm hover:border-brass"
        >
          <span>{jobBanner(myView.forJob)}</span>
          <span className="shrink-0 text-brass-ink underline underline-offset-2">
            Open the live board →
          </span>
        </Link>
      ) : null}

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

      {droppedOut.length > 0 ? (
        <div
          role="status"
          className="rounded-[12px] border px-3 py-2 text-sm"
          style={{ borderColor: "rgb(var(--kumkum))", background: "rgb(var(--field))" }}
        >
          <strong className="font-semibold">
            {droppedOut.length === 1
              ? `${droppedOut[0]} cannot sing on this date.`
              : `${droppedOut.slice(0, -1).join(", ")} and ${droppedOut[droppedOut.length - 1]} cannot sing on this date.`}
          </strong>{" "}
          <span className="text-on-surface-muted">
            They are still on this roster.{" "}
            {canAssign ? (
              <Link href={`/roster/${sessionId}/assign`} className="underline">
                Find somebody else
              </Link>
            ) : (
              "A coordinator will need to find somebody else."
            )}
            .
          </span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{dateLabel}</CardTitle>

          {/*
            The kind on its own line, always — not trailing the date.
            
            Beside the date it wrapped on a phone in portrait as soon as the
            name ran long ("Sathyam Shivam Sundaram"), so the header was one
            line on some sessions and two on others, breaking wherever the
            words happened to fall. Its own line is the same shape every time,
            which is what makes a header scannable.

            Still not the time: that belongs to whoever is planning, and the
            details panel carries it.
          */}
          {session.category || session.topic ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {session.category ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/[0.08] py-0.5 pe-2 ps-0.5 text-[11px] uppercase tracking-wide text-on-surface-muted">
                  {/* The kind's picture, same badge as the roster list uses. */}
                  {session.category.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={session.category.image}
                      alt=""
                      className="h-4 w-4 rounded-full object-cover"
                    />
                  ) : null}
                  {session.category.name}
                </span>
              ) : null}
              {session.topic ? (
                <span className="text-sm italic text-on-surface-muted">{session.topic}</span>
              ) : null}
            </div>
          ) : null}

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

              {/*
                THE WAY INTO THE DESK FROM THE BHAJAN SIDE.

                It only existed on a programme, so a sound engineer who is not
                an editor had no route to the desk at all on an ordinary
                Thursday — /admin/desks is not in their nav, and nothing else
                pointed at it. Sailavan asked for it here, and only for them.
              */}
              {canManageDesk ? (
                <Link href="/admin/desks" className={PILL} title="The desks, their strips and cushions">
                  Sound desk
                </Link>
              ) : null}

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
            cushions={cushions}
            noDesk={session.noDesk}
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
            places={sessionPlaces}
            canEdit={can(role, "editSessionNotes")}
            initial={{
              categoryId: session.categoryId,
              topic: session.topic,
              location: session.location,
              // The column is @db.Date, so the ISO day is the whole value.
              date: session.date.toISOString().slice(0, 10),
              startsAt: session.startsAt,
              timeZone: session.timeZone,
              noDesk: session.noDesk,
              tablaMicd: session.tablaMicd,
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

          {/*
            Splitting a day, and adding a second session to it. Above the
            delete button and below the notes: it belongs with the things that
            change the shape of a session rather than its contents.
          */}
          {can(role, "buildSessions") ? (
            <DayPanel
              sessionId={sessionId}
              suggestedTime={suggestedStart}
              rows={session.slots.map((sl) => ({
                slotId: sl.id,
                singerName: sl.singer?.name ?? null,
                bhajanTitle: sl.bhajan?.title ?? sl.bhajanTitle ?? null,
              }))}
            />
          ) : null}

          {/* Last on the page, and quiet. See DeleteSessionButton. */}
          {can(role, "buildSessions") ? (
            <DeleteSessionButton
              sessionId={sessionId}
              dateLabel={dateLabel}
              rows={session.slots.length}
              pitches={session.slots.filter((s) => s.confirmedPitch).length}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}