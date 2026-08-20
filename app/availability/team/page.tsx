import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, cn } from "@/components/ui";
import { getRole, can } from "@/lib/auth";
import { melbourneTodayISO, addDaysISO } from "@/lib/dates";
import { rosterAvailability } from "@/lib/availabilityQueries";
import { boardColumns, boardTotals, byMonth, type BoardRow } from "@/lib/availabilityBoard";
import { LIVE_SESSION } from "@/lib/archive";
import { Board } from "./Board";

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
        <CardContent className="p-0 pb-3">
          <Board
            columns={columns}
            groups={groups}
            rows={rows.map((r) => ({
              singerId: r.singerId,
              name: r.name,
              gender: r.gender,
              awayOn: [...r.awayOn],
            }))}
            awayPerDate={Object.fromEntries(awayPerDate)}
            canRoster={can(role, "assignSingers")}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-on-surface-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[4px] bg-kumkum/70" /> cannot sing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-brass">•</span> session already in the diary
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[4px]" style={{ background: "rgb(var(--brass))" }} /> picked
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
