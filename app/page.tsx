import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, SectionTitle, Figure, Badge } from "@/components/ui";
import { summariseLoad } from "@/lib/fairness";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function Page() {
  const data = await (async () => {
    try {
      const today = new Date();
      const in60 = new Date(today.getTime() + 60 * DAY);
      const since = new Date(today.getTime() - 365 * DAY);

      const [upcoming, masterCount, sessionCount, singers, recentSlots, sungCount] =
        await Promise.all([
          prisma.session.findMany({
            where: { date: { gte: today, lte: in60 } },
            orderBy: { date: "asc" },
            take: 5,
            include: { slots: { include: { singer: true, bhajan: true }, orderBy: { position: "asc" } } },
          }),
          prisma.bhajan.count(),
          prisma.session.count(),
          prisma.singer.findMany({ orderBy: { name: "asc" } }),
          prisma.sessionSlot.findMany({
            where: { session: { date: { gte: since } } },
            select: { singerId: true },
          }),
          prisma.sessionSlot.count({ where: { bhajanId: { not: null } } }),
        ]);

      return { upcoming, masterCount, sessionCount, singers, recentSlots, sungCount };
    } catch (err) {
      console.error("Dashboard query failed", err);
      return null;
    }
  })();

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Database setup required</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-on-surface-muted">
          <p>The app could not connect to the database in this environment.</p>
          <p>
            Set <code>DATABASE_URL</code> and <code>DIRECT_URL</code> in the Web App&rsquo;s
            application settings, then restart. See <code>PROGRESS.md</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { upcoming, masterCount, sessionCount, singers, recentSlots, sungCount } = data;

  const counts = new Map<string, number>();
  for (const s of recentSlots) if (s.singerId) counts.set(s.singerId, (counts.get(s.singerId) ?? 0) + 1);
  const { singers: loads } = summariseLoad(
    singers.map((s) => ({ singerId: s.id, name: s.name, count: counts.get(s.id) ?? 0 })),
  );
  const underUsed = loads.filter((l) => l.verdict === "under").slice(0, 4);

  return (
    <div className="grid gap-5">
      {/* Quick actions — the three jobs from CLAUDE.md, in order. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Action
          href="/build"
          label="Suggest"
          title="Build a session"
          body="A set that works as a session, not n rows that pass a filter."
        />
        <Action
          href="/roster"
          label="Roster"
          title="Assign singers"
          body="Fairly, at the right pitch, with a reason for every choice."
        />
        <Action
          href="/fairness"
          label="Remember"
          title="See the balance"
          body="Who is over- and under-used, and what has gone stale."
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Upcoming */}
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle>Upcoming</SectionTitle>
            <CardTitle className="mt-1">Next sessions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-on-surface-muted">
                Nothing scheduled in the next 60 days.{" "}
                <Link href="/build" className="text-brass-ink underline-offset-2 hover:underline">
                  Build one
                </Link>
                .
              </p>
            ) : (
              upcoming.map((s) => (
                <Link
                  key={s.id}
                  href={`/roster/${s.id}`}
                  className="group rounded-[12px] border border-rule-surface bg-panel p-3 transition-colors hover:border-brass/40 hover:bg-panel-hover"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-lg">
                      {s.date.toLocaleDateString("en-AU", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                    <Badge tone={s.status === "Draft" ? "warn" : "neutral"}>
                      {s.status === "Draft" ? "draft" : `${s.slots.length} slots`}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate text-sm text-on-surface-muted">
                    {s.slots.length === 0
                      ? "No bhajans chosen yet"
                      : s.slots
                          .map((x) => x.bhajan?.title ?? x.bhajanTitle ?? "—")
                          .slice(0, 3)
                          .join(" · ")}
                  </div>
                  <div className="mt-1 truncate text-xs text-on-surface-muted/80">
                    {s.slots.map((x) => x.singer?.name ?? "Unassigned").slice(0, 6).join(" · ")}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5">
          {/* Stats */}
          <Card>
            <CardHeader className="pb-3">
              <SectionTitle>The library</SectionTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Stat label="Bhajans" value={masterCount.toLocaleString()} />
              <Stat label="Sessions" value={sessionCount.toLocaleString()} />
              <Stat label="Singers" value={String(singers.length)} />
              <Stat label="Sung records" value={sungCount.toLocaleString()} />
            </CardContent>
          </Card>

          {/* Fairness nudge */}
          <Card>
            <CardHeader className="pb-3">
              <SectionTitle>Under-used</SectionTitle>
              <p className="mt-1 text-xs text-on-surface-muted">Past year, against the group mean.</p>
            </CardHeader>
            <CardContent className="grid gap-1.5">
              {underUsed.length === 0 ? (
                <p className="text-sm text-on-surface-muted">Everyone is within range.</p>
              ) : (
                underUsed.map((s) => (
                  <Link
                    key={s.singerId}
                    href={`/singers/${s.singerId}`}
                    className="flex items-baseline justify-between gap-3 border-b border-rule-surface py-1 last:border-b-0 hover:text-brass-ink"
                  >
                    <span className="text-sm">{s.name}</span>
                    <span className="text-xs text-on-surface-muted">
                      <Figure>{s.count}</Figure> slots · <Figure>+{s.deltaToMean}</Figure> to mean
                    </span>
                  </Link>
                ))
              )}
              <Link
                href="/fairness"
                className="mt-1 text-xs text-brass-ink underline-offset-2 hover:underline"
              >
                See the whole picture →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Action({
  href,
  label,
  title,
  body,
}: {
  href: string;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[14px] border border-card-edge bg-surface p-5 transition-colors hover:border-brass/45 hover:bg-surface"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-ink">
        {label}
      </div>
      <div className="mt-2 font-display text-xl text-on-surface">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-on-surface-muted">{body}</p>
      <span className="mt-3 inline-block text-sm text-brass-ink opacity-0 transition-opacity group-hover:opacity-100">
        Open →
      </span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-muted">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-2xl tabular text-on-surface">{value}</div>
    </div>
  );
}
