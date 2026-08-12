import Link from "next/link";
import { SessionRows, Marked } from "@/components/SessionRows";
import { matches, excerpt } from "@/lib/highlight";
import { timeLabel, USUAL_START } from "@/lib/sessionsOfDay";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startSessionOnDate } from "./viewActions";
import { DefaultViewToggle } from "./DefaultViewToggle";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import RosterCalendarClient from "./RosterCalendarClient";
import { nextThursday, melbourneTodayISO } from "@/lib/dates";

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

function toISODateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  const view: "calendar" | "list" =
    sp.view === "list" || sp.view === "calendar"
      ? sp.view
      : savedView === "list"
        ? "list"
        : "calendar";
  const q = (sp.q ?? "").trim();

  const todayUTC = new Date();
  const selected = parseISODate(sp.d) ?? parseISODate(toISODateUTC(todayUTC))!;
  const month = parseMonth(sp.m) ?? new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 0, 0, 0));
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 0, 0, 0));
  const monthEndExclusive = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1, 0, 0, 0));

  const monthSessions = await prisma.session.findMany({
    where: { date: { gte: monthStart, lt: monthEndExclusive } },
    select: {
      id: true,
      date: true,
      startsAt: true,
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
      categoryName: s.category?.name ?? null,
      entries: s._count.slots ?? 0,
      rows: s.slots.map((x) => ({
        singer: x.singer?.name ?? "Unassigned",
        bhajan: x.bhajan?.title ?? x.bhajanTitle ?? x.festivalBhajanTitle ?? null,
        pitch: x.confirmedPitch,
      })),
    };

    const utcKey = toISODateUTC(s.date);
    const localKey = toISODateLocal(s.date);

    (dayInfo[utcKey] ??= { sessions: [] }).sessions.push(value);
    if (localKey !== utcKey) dayInfo[localKey] ??= dayInfo[utcKey];
  }

  let listSessions:
    | Array<{
        id: string;
        date: Date;
        notes: string | null;
        startsAt: string | null;
        category: { name: string } | null;
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
        category: { select: { name: true } },
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
                  : "List view. Search + date range available."}
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
              initialDayInfo={dayInfo}
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
                    placeholder="Singer, bhajan or notes…"
                    aria-label="Search singer, bhajan or notes"
                    className="w-full"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-[11px] text-on-surface-muted">
                  From
                  <Input
                    name="from"
                    type="date"
                    defaultValue={sp.from ?? ""}
                    aria-label="From"
                    className="w-full"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-[11px] text-on-surface-muted">
                  To
                  <Input
                    name="to"
                    type="date"
                    defaultValue={sp.to ?? ""}
                    aria-label="To"
                    className="w-full"
                  />
                </label>
                <Button type="submit" className="col-span-2 sm:col-span-1">
                  Apply
                </Button>
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
                  <Link
                    key={s.id}
                    href={`/roster/${s.id}`}
                    className="group rounded-[12px] border border-rule-surface bg-panel p-3 transition-colors hover:border-brass/40 hover:bg-panel-hover"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-display text-[15px]">
                          {new Date(s.date).toLocaleDateString("en-AU", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </span>
                        {/* What kind of session it was, where the eye already is. */}
                        {s.category ? (
                          <span className="rounded-full border border-brass/40 bg-brass/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-wide text-on-surface-muted">
                            {s.category.name}
                          </span>
                        ) : null}
                        {s.startsAt && s.startsAt !== USUAL_START ? (
                          <span className="font-mono text-[11px] text-on-surface-muted">
                            {timeLabel(s.startsAt)}
                          </span>
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
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}