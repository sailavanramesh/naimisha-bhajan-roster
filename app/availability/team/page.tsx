import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, cn } from "@/components/ui";
import { getRole, can } from "@/lib/auth";
import { melbourneTodayISO, addDaysISO } from "@/lib/dates";
import { rosterAvailability } from "@/lib/availabilityQueries";
import {
  boardColumns,
  boardTotals,
  byMonth,
  columnLabel,
  monthLabel,
  type BoardRow,
} from "@/lib/availabilityBoard";
import { LIVE_SESSION } from "@/lib/archive";

export const dynamic = "force-dynamic";

/** Two or three months. Anything longer stops being a plan. */
const MONTH_CHOICES = [2, 3] as const;

/**
 * Who is around over the next couple of months.
 *
 * For whoever builds the roster. A column per date that can carry a session —
 * every session already in the diary plus the coming Thursdays — rather than one
 * per calendar day, which over three months would be ninety-two columns of
 * mostly nothing.
 *
 * It shows DATES ONLY. `rosterAvailability` returns a type with nowhere to put a
 * reason, so a date somebody marked by hand and a date their cycle predicted
 * arrive here identical and are drawn identically. That is deliberate: the
 * planner needs to know who to avoid, and nothing else about why.
 */
export default async function TeamAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months: monthsRaw } = await searchParams;
  const role = await getRole();

  if (!can(role, "assignSingers")) {
    return (
      <div className="py-6">
        <Card>
          <CardHeader>
            <CardTitle>Who is around</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-on-surface-muted">
              This is for whoever is building the roster. Your own dates are on{" "}
              <Link href="/availability" className="underline">
                your availability page
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const months = MONTH_CHOICES.includes(Number(monthsRaw) as 2 | 3) ? Number(monthsRaw) : 3;
  const today = melbourneTodayISO();
  const end = addDaysISO(today, months * 31) ?? today;

  const [singers, sessions, away] = await Promise.all([
    prisma.singer.findMany({
      where: { gender: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gender: true },
    }),
    prisma.session.findMany({
      where: {
        date: { gte: new Date(`${today}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) },
        ...LIVE_SESSION,
      },
      select: { date: true },
    }),
    rosterAvailability(today, end),
  ]);

  const columns = boardColumns({
    sessionDates: sessions.map((s) => s.date.toISOString().slice(0, 10)),
    fromISO: today,
    toISODate: end,
  });

  const awayBySinger = new Map<string, Set<string>>();
  for (const a of away) {
    let set = awayBySinger.get(a.singerId);
    if (!set) {
      set = new Set();
      awayBySinger.set(a.singerId, set);
    }
    set.add(a.date);
  }

  const rows: BoardRow[] = singers.map((s) => ({
    singerId: s.id,
    name: s.name,
    gender: s.gender,
    awayOn: awayBySinger.get(s.id) ?? new Set<string>(),
  }));

  const { awayPerDate, awayPerSinger } = boardTotals(rows, columns);
  const groups = byMonth(columns);
  const anyone = rows.some((r) => awayPerSinger.get(r.singerId));

  return (
    <div className="grid gap-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold">Who is around</h1>
          <p className="mt-1 text-sm text-on-surface-muted">
            The next {months} months, one column per date that could carry a session. A marked cell
            means that person has said they cannot sing — the reason is theirs and is not shown.
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {MONTH_CHOICES.map((m) => (
            <Link
              key={m}
              href={`/availability/team?months=${m}`}
              className={cn(
                "rounded-[10px] border px-2 py-1",
                m === months
                  ? "border-brass/60 bg-brass/[0.08] font-semibold"
                  : "border-rule-surface hover:border-brass/50",
              )}
            >
              {m} months
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* The table scrolls sideways on its own; the page never does. */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 z-20 min-w-[9rem] border-b border-rule-surface bg-panel px-3 py-2 text-left text-xs font-semibold"
                    rowSpan={2}
                  >
                    Singer
                  </th>
                  {groups.map((g) => (
                    <th
                      key={g.month}
                      colSpan={g.columns.length}
                      className="border-b border-l border-rule-surface px-2 py-1 text-center text-[11px] font-semibold text-on-surface-muted"
                    >
                      {monthLabel(g.month)}
                    </th>
                  ))}
                  <th
                    className="border-b border-l border-rule-surface px-2 py-2 text-center text-[11px] font-semibold text-on-surface-muted"
                    rowSpan={2}
                  >
                    away
                  </th>
                </tr>
                <tr>
                  {columns.map((c) => {
                    const l = columnLabel(c.date);
                    return (
                      <th
                        key={c.date}
                        title={`${c.date}${c.scheduled ? " — session in the diary" : " — no session yet"}`}
                        className={cn(
                          "w-9 border-b border-rule-surface px-0 py-1 text-center text-[10px] font-normal leading-tight",
                          c.scheduled ? "font-semibold" : "text-on-surface-muted",
                        )}
                      >
                        <div>{l.weekday}</div>
                        <div className="tabular-nums">{l.day}</div>
                        {/* A dot marks a date that is already a session, so a
                            coordinator can tell a real night from a possible one. */}
                        <div aria-hidden className="text-brass">
                          {c.scheduled ? "•" : " "}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => {
                  const total = awayPerSinger.get(r.singerId) ?? 0;
                  return (
                    <tr key={r.singerId} className="odd:bg-surface-sunk/40">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-rule-surface bg-panel px-3 py-1.5 text-left font-normal"
                      >
                        <Link href={`/singers/${r.singerId}`} className="hover:underline">
                          {r.name}
                        </Link>
                      </th>
                      {columns.map((c) => {
                        const isAway = r.awayOn.has(c.date);
                        return (
                          <td
                            key={c.date}
                            className="border-b border-rule-surface p-0 text-center align-middle"
                          >
                            <span
                              title={isAway ? `${r.name} cannot sing on ${c.date}` : undefined}
                              className={cn(
                                "mx-auto block h-5 w-5 rounded-[6px]",
                                isAway ? "bg-kumkum/70" : "bg-transparent",
                              )}
                            >
                              <span className="sr-only">
                                {isAway ? `${r.name} away ${c.date}` : `${r.name} available ${c.date}`}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="border-b border-l border-rule-surface px-2 py-1.5 text-center text-xs tabular-nums text-on-surface-muted">
                        {total || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-panel px-3 py-1.5 text-left text-xs font-semibold"
                  >
                    away that night
                  </th>
                  {columns.map((c) => {
                    const n = awayPerDate.get(c.date) ?? 0;
                    return (
                      <td
                        key={c.date}
                        className={cn(
                          "px-0 py-1.5 text-center text-xs tabular-nums",
                          n === 0 ? "text-on-surface-muted" : "font-semibold",
                        )}
                      >
                        {n || ""}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-on-surface-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[4px] bg-kumkum/70" /> cannot sing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-brass">•</span> session already in the diary
        </span>
        <span>{rows.length} singers</span>
      </div>

      {!anyone ? (
        <p className="text-sm text-on-surface-muted">
          Nobody has marked anything in this window yet. It fills in as people use{" "}
          <Link href="/availability" className="underline">
            their own availability page
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
