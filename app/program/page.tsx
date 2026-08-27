import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { Card, CardContent } from "@/components/ui";
import { runningOrderLabel } from "@/lib/program";
import { SessionTime } from "@/components/SessionTime";
import { melbourneTodayISO } from "@/lib/dates";
import { NOT_ARCHIVED } from "@/lib/archive";

export const dynamic = "force-dynamic";

/**
 * Every music program, newest first.
 *
 * Grouped by year rather than paged. There are a handful a year — Guru
 * Poornima, Sri Jayanti, Janmashtami, Swami's birthday — so the whole history
 * is a short page, and "what did we sing at Janmashtami two years ago" is the
 * question this list exists to answer.
 */
export default async function ProgramsPage() {
  const role = await getRole();
  if (role === "viewer" && !can(role, "viewAllPages")) {
    return <NoAccess what="Music programs" role={role} />;
  }

  const programs = await prisma.session.findMany({
    where: { ...NOT_ARCHIVED, format: "program" },
    orderBy: [{ date: "desc" }, { startsAt: "desc" }],
    select: {
      id: true,
      date: true,
      startsAt: true,
      timeZone: true,
      topic: true,
      location: true,
      category: { select: { name: true, image: true } },
      programItems: { select: { position: true, kind: true } },
    },
  });

  const todayISO = melbourneTodayISO();
  const upcoming = programs.filter((p) => isoOf(p.date) >= todayISO).reverse();
  const past = programs.filter((p) => isoOf(p.date) < todayISO);

  const byYear = new Map<string, typeof past>();
  for (const p of past) {
    const year = isoOf(p.date).slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), p]);
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Music programs</h1>
        <p className="mt-1 text-sm text-on-ground-muted">
          The offerings — a running order, who sings each piece, and what plays on it. Start one
          from the calendar on a day.
        </p>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-on-surface-muted sm:py-6">
            No programs yet.
          </CardContent>
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-on-ground-muted">Coming up</h2>
          <ul className="grid gap-2">
            {upcoming.map((p) => (
              <li key={p.id}>
                <ProgramRow program={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {[...byYear.entries()].map(([year, list]) => (
        <section key={year} className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-on-ground-muted">{year}</h2>
          <ul className="grid gap-2">
            {list.map((p) => (
              <li key={p.id}>
                <ProgramRow program={p} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ProgramRow({
  program,
}: {
  program: {
    id: string;
    date: Date;
    startsAt: string | null;
    timeZone: string;
    topic: string | null;
    location: string | null;
    category: { name: string; image: string | null } | null;
    programItems: { position: number; kind: "song" | "narration" }[];
  };
}) {
  const when = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(program.date);

  return (
    <Link
      href={`/program/${program.id}`}
      className="flex items-center gap-3 rounded-[14px] border border-card-edge bg-surface p-3 hover:border-brass/50"
    >
      {program.category?.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={program.category.image}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full border border-rule-surface object-cover"
        />
      ) : (
        <span className="h-9 w-9 shrink-0 rounded-full border border-dashed border-rule-surface" />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-lg font-semibold">
          {program.topic?.trim() || program.category?.name || "Music program"}
        </span>
        <span className="block truncate text-sm text-on-surface-muted">
          {when}
          {program.startsAt ? (
            <>
              {" · "}
              <SessionTime
                dateISO={isoOf(program.date)}
                startsAt={program.startsAt}
                timeZone={program.timeZone}
              />
            </>
          ) : null}
          {program.location ? ` · ${program.location}` : ""}
        </span>
      </span>

      <span className="shrink-0 whitespace-nowrap text-xs text-on-surface-muted">
        {runningOrderLabel(program.programItems)}
      </span>
    </Link>
  );
}
