import Link from "next/link";
import { SessionRows, Marked } from "@/components/SessionRows";
import { DateField } from "@/components/DateField";
import { matches, excerpt } from "@/lib/highlight";
import { USUAL_START } from "@/lib/sessionsOfDay";
import { SessionTime } from "@/components/SessionTime";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startSessionOnDate } from "./viewActions";
import { DefaultViewToggle } from "./DefaultViewToggle";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import RosterCalendarClient from "./RosterCalendarClient";
import { nextThursday, melbourneTodayISO } from "@/lib/dates";
import { resolveRosterView } from "@/lib/rosterView";
import { NOT_ARCHIVED } from "@/lib/archive";

export const dynamic = "force-dynamic";

/** Does this row contain the search text, in either the singer or the bhajan? */
function rowMatches(
  slot: {
    singer: { name: string } | null;
    bhajan: { title: string } | null;
    bhajanTitle: string | null;
    festivalBhajanTitle: string | null;
  },
  q: string,
): boolean {
  return (
    matches(slot.singer?.name, q) ||
    matches(slot.bhajan?.title, q) ||
    matches(slot.bhajanTitle, q) ||
    matches(slot.festivalBhajanTitle, q)
  );
}
function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISODate(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function parseMonth(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 0, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}


function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    tile?: string;
    q?: string;
    from?: string;
    to?: string;
    m?: string;
    d?: string;
  }>;
}) {
  const sp = await searchParams;
  /*
   * Editability comes from the capability system, not from the raw `edit`
   * cookie. Reading the cookie directly predated Google sign-in and did not
   * know about it, so a signed-in Editor was shown "Read-only — enter your
   * edit key" while the header next to it said "Editor". `getRole` already
   * honours the old link key, so shared links keep working.
   */
  const role = await getRole();
  const canEdit = can(role, "buildSessions");

  /*
   * An explicit ?view= always wins, so a link somebody shares still shows what
   * they meant. Otherwise it is whichever the person asked to be their
   * default, and the calendar for anybody who has not said.
   */
  const me = await getSignedInSinger();
  const savedView = me
    ? (
        await prisma.singer.findUnique({
          where: { id: me.id },
          select: { defaultRosterView: true },
        })
      )?.defaultRosterView ?? null
    : null;

  /** Temporary: two ways of showing a session kind's picture, to choose from. */
  const tile = sp.tile === "band" ? "band" : "badge";

  const view = resolveRosterView(sp.view, savedView === "list" ? "list" : savedView === "calendar" ? "calendar" : null);
  const q = (sp.q ?? "").trim();

  /*
   * The default day is MELBOURNE's today, not UTC's.
   *
   * This was `new Date()` read through `toISODateUTC`, and Azure runs UTC — so
   * from midnight until 10am Melbourne the calendar opened on yesterday, and
   * "Today" agreed with it. Melbourne is the right guess for a server that
   * cannot know where the reader is; a reader somewhere else gets corrected on
   * their own device, which is why `selectedFromUrl` goes down with it.
   */
  const selected = parseISODate(sp.d) ?? parseISODate(melbourneTodayISO())!;
  const selectedFromUrl = parseISODate(sp.d) !== null;
  const month = parseMonth(sp.m) ?? new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 0, 0, 0));
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 0, 0, 0));
  const monthEndExclusive = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1, 0, 0, 0));

  /*
   * The kinds of session, for the marks in the calendar cells.
   *
   * Every kind, not only this month's — the calendar walks to other months
   * without asking the server for these again. The pictures are deliberately
   * NOT selected: they run 17–68KB each and come from
   * /api/session-kinds/[id]/image, where the browser can cache them. `v` is
   * the kind's updatedAt, which changes the URL when a picture changes.
   */
  const kindRows = await prisma.sessionCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, image: true, updatedAt: true },
  });
  // `v: null` means no picture, so the cell shows initials instead. A kind
  // with no picture still travels: its name is what the initials come from.
  const kinds = kindRows.map((k) => ({
    id: k.id,
    name: k.name,
    v: k.image ? k.updatedAt.getTime() : null,
  }));

  const monthSessions = await prisma.session.findMany({
    where: { ...NOT_ARCHIVED, date: { gte: monthStart, lt: monthEndExclusive } },
    select: {
      id: true,
      date: true,
      startsAt: true,
      categoryId: true,
      category: { select: { name: true } },
      _count: { select: { slots: true } },
      slots: {
        select: {
          bhajanTitle: true,
          confirmedPitch: true,
          festivalBhajanTitle: true,
          bhajan: { select: { title: true } },
          singer: { select: { name: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        // Matches app/roster/month/route.ts, which serves the same shape when
        // the month is changed without a reload.
        take: 6,
      },
    },
    orderBy: { date: "asc" },
  });

  /*
   * The same shape /roster/month returns: a day holds a LIST of sessions.
   * Seeded here so the first paint of the calendar is not empty, then
   * refreshed from the route as months are navigated.
   */
  const dayInfo: Record<
    string,
    {
      sessions: {
        id: string;
        startsAt: string | null;
        categoryId: string | null;
        categoryName: string | null;
        entries: number;
        rows: { singer: string; bhajan: string | null; pitch: string | null }[];
      }[];
    }
  > = {};
  for (const s of monthSessions) {
    const value = {
      id: s.id,
      startsAt: s.startsAt,
      categoryId: s.categoryId ?? null,
      categoryName: s.category?.name ?? null,
      entries: s._count.slots ?? 0,
      rows: s.slots.map((x) => ({
        singer: x.singer?.name ?? "Unassigned",
        bhajan: x.bhajan?.title ?? x.bhajanTitle ?? x.festivalBhajanTitle ?? null,
        pitch: x.confirmedPitch,
      })),
    };

    /*
     * Keyed by the UTC day, and ONLY by it.
     *
     * There used to be a second key built from the local getters, aliasing each day to
     * whatever day the SERVER's zone made of it, as insurance against the two
     * disagreeing. On Azure they never do — it runs UTC — so the alias has
     * always been a no-op in production; anywhere else it quietly filed every
     * session on a second, wrong day as well as the right one. The calendar
     * reads and writes UTC-anchored day keys throughout, so the one key is the
     * whole answer.
     */
    (dayInfo[toISODateUTC(s.date)] ??= { sessions: [] }).sessions.push(value);
  }

  let listSessions:
    | Array<{
        id: string;
        date: Date;
        notes: string | null;
        startsAt: string | null;
        timeZone: string;
        category: { name: string; image: string | null } | null;
        slots: {
          singer: { name: string } | null;
          bhajan: { title: string } | null;
          bhajanTitle: string | null;
          festivalBhajanTitle: string | null;
          confirmedPitch: string | null;
        }[];
      }>
    | null = null;

  if (view === "list") {
    const from = parseISODate(sp.from) ?? null;
    const to = parseISODate(sp.to) ?? null;

    listSessions = await prisma.session.findMany({
      where: {
        ...NOT_ARCHIVED,
        /*
         * Same rule as the calendar: a session record can outlive its
         * contents, and one with nothing on it is not a session. The calendar
         * already stops drawing those and the arrows already skip them; the
         * list was still printing them as "nothing rostered", which is exactly
         * the noise that rule exists to remove.
         *
         * A session being BUILT — singers on, bhajans not yet chosen — still
         * has slots, so it still appears.
         */
        slots: { some: {} },
        ...(q
          ? {
              /*
                Case-insensitive, and it searches the RESOLVED bhajan title.
                
                It did neither. `contains` is case-sensitive in Postgres, so
                "rama" found 7 sessions where "Rama" found 50; and it looked
                only at SessionSlot.bhajanTitle, the free-text fallback, not at
                the masterlist title most rows actually carry. Between them,
                a search for "rama" returned 7 of the 55 sessions containing it.
              */
              OR: [
                { notes: { contains: q, mode: "insensitive" } },
                { slots: { some: { singer: { name: { contains: q, mode: "insensitive" } } } } },
                { slots: { some: { bhajanTitle: { contains: q, mode: "insensitive" } } } },
                { slots: { some: { bhajan: { title: { contains: q, mode: "insensitive" } } } } },
                // The kind of session, and what it was about. Typing
                // "festival" should find every festival, which is the fastest
                // way to answer "what did we do last Guru Purnima".
                { category: { name: { contains: q, mode: "insensitive" } } },
                { topic: { contains: q, mode: "insensitive" } },
                { location: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lt: addDaysUTC(to, 1) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
      take: 200,
      include: {
        category: { select: { name: true, image: true } },
        slots: {
          orderBy: [{ position: "asc" }],
          include: { singer: true, bhajan: { select: { title: true } } },
        },
      },
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Roster</CardTitle>
              <div className="mt-1 text-sm text-on-surface-muted">
                {view === "calendar"
                  ? "Tap a day to open the session (edit mode will create if missing)."
                  : "List view. Search singers, bhajans, session kinds, places and notes."}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {canEdit ? (
                <Link
                  href="/roster/details"
                  className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                >
                  Session kinds in bulk
                </Link>
              ) : null}
              {/* Nothing to save against without a signed-in person, so nothing to
                  offer either. */}
              {me ? <DefaultViewToggle view={view} defaultView={savedView} /> : null}
              <Link
                className="rounded-[12px] border px-3 py-2 text-sm hover:bg-panel-hover"
                href={`/roster?view=${view === "calendar" ? "list" : "calendar"}`}
              >
                {view === "calendar" ? "List view" : "Calendar view"}
              </Link>
            </div>
          </div>

          {/*
            No standing "Edit mode ON" or "Read-only" banner.
            
            Sailavan: it took a line of the page on every visit to tell people
            something they only need at the moment they try to do something —
            and for an editor, which is most visits, it said nothing at all.
            Whoever cannot do a thing is told when they attempt it, by the
            control they attempted it with.

            The edit-key form goes with it. It only ever reached a signed-out
            visitor, and with sign-in required they meet the sign-in wall
            instead and never see this page.
          */}
        </CardHeader>

        <CardContent className="grid gap-4">
          {view === "calendar" ? (
            <RosterCalendarClient
              canEdit={canEdit}
              initialMonth={monthKey(monthStart)}
              initialSelected={toISODateUTC(selected)}
              selectedFromUrl={selectedFromUrl}
              initialDayInfo={dayInfo}
              kinds={kinds}
            />
          ) : (
            <>
              {/*
                Wrapping, and labelled.
                
                This was a four-column grid, which on a phone squeezed the
                search box until its own placeholder was cut off and left two
                unlabelled date boxes beside it — nothing on screen said what
                they were for. Wrapping lets each control keep a usable width
                and drop to the next line instead of shrinking.
              */}
              {/*
                A phone gets one field per line; from sm up they sit in a row.
                
                Wrapping alone was not enough: the date inputs carry their own
                intrinsic width, so on a 390px screen "From" pushed past the
                card's edge and "To" ended up underneath Apply. Explicit
                full-width basis on small screens is the only thing that makes
                a date input behave.
              */}
              <form className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
                <label className="col-span-2 grid min-w-0 gap-1 text-[11px] text-on-surface-muted sm:min-w-[14rem] sm:flex-1">
                  Search
                  <Input
                    name="q"
                    defaultValue={q}
                    placeholder="Singer, bhajan, kind, place or notes…"
                    aria-label="Search singer, bhajan, kind, place or notes"
                    className="w-full"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-[11px] text-on-surface-muted">
                  From
                  <DateField name="from" defaultValue={sp.from ?? ""} label="From" />
                </label>
                <label className="grid min-w-0 gap-1 text-[11px] text-on-surface-muted">
                  To
                  <DateField name="to" defaultValue={sp.to ?? ""} label="To" />
                </label>
                <Button type="submit" className="col-span-2 sm:col-span-1">
                  Apply
                </Button>
                <p className="col-span-2 flex flex-wrap items-center gap-x-3 text-[11px] text-on-surface-muted sm:basis-full">
                  <span>Leave the dates blank to see every session.</span>
                  {/* Temporary while the two picture treatments are compared. */}
                  <Link
                    href={`/roster?view=list${tile === "band" ? "" : "&tile=band"}`}
                    className="underline underline-offset-2 hover:text-on-surface"
                  >
                    {tile === "band" ? "Try the badge instead" : "Try the picture band instead"}
                  </Link>
                </p>
                <input type="hidden" name="view" value="list" />
              </form>

              {canEdit ? (
                /*
                  The calendar has always been able to start a session — tap a
                  day — and the list simply could not. Now that the list can be
                  somebody's default, that gap would be the first thing they
                  hit.
                */
                <form
                  action={startSessionOnDate}
                  className="flex flex-wrap items-center gap-2 rounded-[12px] border border-rule-surface bg-panel p-3 text-sm"
                >
                  <span className="text-xs text-on-surface-muted">Start a session on</span>
                  <input
                    type="date"
                    name="date"
                    defaultValue={nextThursday(melbourneTodayISO())}
                    aria-label="Date for the new session"
                    className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
                  />
                  <Button type="submit">Start</Button>
                  <span className="text-xs text-on-surface-muted">
                    Opens the day&rsquo;s session, or creates it at 7pm if there is none.
                  </span>
                </form>
              ) : null}

              <div className="grid gap-2">
                {(listSessions ?? []).map((s) => (
                  /*
                    One slot per line, not a run-on sentence. The old version
                    joined every singer and bhajan with a middle dot, so a
                    Sunday of ten slots wrapped into an unreadable paragraph
                    and an empty session was an unexplained blank card.
                  */
                  <div
                    key={s.id}
                    /*
                      A div, not a Link. The whole card used to be one anchor,
                      which meant nothing inside it could be a link of its own —
                      and Sailavan wants Live view here, as the calendar has.
                      The date is the link to the session now.
                    */
                    className="group relative overflow-hidden rounded-[12px] border border-rule-surface bg-panel p-3 transition-colors hover:border-brass/40"
                  >
                    {/*
                      The BAND treatment: the kind's picture washed across the
                      top of the card, behind everything, at low contrast.
                      Shown only under ?tile=band while Sailavan compares it
                      with the badge — one of the two will be deleted.
                    */}
                    {tile === "band" && s.category?.image ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-[0.18]"
                        style={{
                          backgroundImage: `url(${s.category.image})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          maskImage: "linear-gradient(to bottom, black, transparent)",
                          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
                        }}
                      />
                    ) : null}
                    <div className="relative">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <Link
                          href={`/roster/${s.id}`}
                          className="font-display text-[15px] underline-offset-2 hover:underline"
                        >
                          {new Date(s.date).toLocaleDateString("en-AU", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </Link>
                        {/* What kind of session it was, where the eye already is. */}
                        {s.category ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/[0.08] py-0.5 pe-2 ps-0.5 text-[10px] uppercase tracking-wide text-on-surface-muted">
                            {tile !== "band" && s.category.image ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={s.category.image}
                                alt=""
                                className="h-4 w-4 rounded-full object-cover"
                              />
                            ) : null}
                            <Marked text={s.category.name} query={q} />
                          </span>
                        ) : null}
                        {s.startsAt && s.startsAt !== USUAL_START ? (
                          <SessionTime
                            className="font-mono text-[11px] text-on-surface-muted"
                            dateISO={toISODateUTC(s.date)}
                            startsAt={s.startsAt}
                            timeZone={s.timeZone}
                          />
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-on-surface-muted">
                        {s.slots.length === 0
                          ? "nothing rostered"
                          : `${s.slots.length} slot${s.slots.length === 1 ? "" : "s"}`}
                      </span>
                    </div>

                    <div className="mt-2">
                      <SessionRows
                        rows={
                          /*
                            When searching, lead with the rows that matched.
                            A ten-row Sunday shows six, and the one row you
                            searched for could easily be the seventh.
                          */
                          (q
                            ? [...s.slots].sort(
                                (a, b) =>
                                  Number(rowMatches(b, q)) - Number(rowMatches(a, q)),
                              )
                            : s.slots
                          )
                            .slice(0, 6)
                            .map((x) => ({
                              singer: x.singer?.name ?? "Unassigned",
                              bhajan: x.bhajan?.title ?? x.bhajanTitle ?? x.festivalBhajanTitle,
                              pitch: x.confirmedPitch,
                            }))
                        }
                        total={s.slots.length}
                        emptyLabel="Nothing rostered."
                        query={q}
                      />

                      {/*
                        A session can match on its NOTES, in which case no row
                        highlights and the card looks like it was returned for
                        no reason. Show the matching part of the note instead.
                      */}
                      {q && matches(s.notes, q) ? (
                        <p className="mt-1 px-1.5 text-[11px] italic text-on-surface-muted">
                          notes: <Marked text={excerpt(s.notes ?? "", q)} query={q} />
                        </p>
                      ) : null}

                      {/* Both ways in, as the calendar's day panel has. */}
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1.5 text-[12px]">
                        <Link
                          href={`/roster/${s.id}`}
                          className="text-brass-ink underline underline-offset-2"
                        >
                          Open this session →
                        </Link>
                        <Link
                          href={`/roster/${s.id}/live`}
                          className="text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                        >
                          ▶ Live view
                        </Link>
                      </p>
                    </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}