import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Figure, SectionTitle } from "@/components/ui";
import { summariseLoad, staleKnownBhajans, countBy, LOAD_TOLERANCE } from "@/lib/fairness";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function FairnessPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const windowDays = Number(sp.days ?? 365) || 365;
  const since = new Date(Date.now() - windowDays * DAY);

  const [singers, slots, allSlots] = await Promise.all([
    prisma.singer.findMany({ orderBy: { name: "asc" } }),
    prisma.sessionSlot.findMany({
      where: { session: { date: { gte: since } } },
      select: {
        singerId: true,
        bhajan: { select: { deities: { select: { deity: { select: { name: true } } } }, raga: true } },
      },
    }),
    prisma.sessionSlot.findMany({
      where: { bhajanId: { not: null } },
      select: { bhajanId: true, bhajan: { select: { title: true } }, session: { select: { date: true } } },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const s of slots) if (s.singerId) counts.set(s.singerId, (counts.get(s.singerId) ?? 0) + 1);

  const { singers: loads, mean, total } = summariseLoad(
    singers.map((s) => ({ singerId: s.id, name: s.name, count: counts.get(s.id) ?? 0 })),
  );

  const deities = countBy(slots, (s) => s.bhajan?.deities.map((d) => d.deity.name) ?? []).slice(0, 10);
  const ragas = countBy(slots, (s) => (s.bhajan?.raga ? [s.bhajan.raga] : [])).slice(0, 10);

  // Staleness is measured over ALL history, not the selected window — a bhajan
  // that has lapsed for two years must not vanish because the window is a year.
  const byBhajan = new Map<string, { title: string; timesSung: number; last: Date }>();
  for (const s of allSlots) {
    if (!s.bhajanId || !s.bhajan) continue;
    const existing = byBhajan.get(s.bhajanId);
    if (!existing) byBhajan.set(s.bhajanId, { title: s.bhajan.title, timesSung: 1, last: s.session.date });
    else {
      existing.timesSung++;
      if (s.session.date > existing.last) existing.last = s.session.date;
    }
  }
  const now = Date.now();
  const stale = staleKnownBhajans(
    [...byBhajan.entries()].map(([bhajanId, v]) => ({
      bhajanId,
      title: v.title,
      timesSung: v.timesSung,
      lastSungDaysAgo: Math.round((now - v.last.getTime()) / DAY),
    })),
  ).slice(0, 25);

  const maxCount = Math.max(1, ...loads.map((l) => l.count));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Fairness</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            {total} slots across the last {windowDays} days · group mean {mean.toFixed(1)} each.
            Anyone more than {Math.round(LOAD_TOLERANCE * 100)}% either side of the mean is
            called out.
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[90, 180, 365, 3650].map((d) => (
              <Link
                key={d}
                href={`/fairness?days=${d}`}
                className={
                  d === windowDays
                    ? "rounded-full border border-brass/60 bg-brass/15 px-3 py-1"
                    : "rounded-full border border-rule-surface px-3 py-1 hover:bg-black/[0.04]"
                }
              >
                {d === 3650 ? "All time" : `${d} days`}
              </Link>
            ))}
          </div>
        </CardHeader>

        <CardContent className="grid gap-2">
          <SectionTitle>Singer load</SectionTitle>
          <ul className="grid gap-1">
            {loads.map((s) => (
              <li key={s.singerId} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3">
                <Link
                  href={`/singers/${s.singerId}`}
                  className="truncate text-sm underline-offset-2 hover:underline"
                >
                  {s.name}
                </Link>

                {/* A plain proportional bar. No chart library for eleven rows. */}
                <div className="h-5 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className={
                      s.verdict === "under"
                        ? "h-full bg-brass/70"
                        : s.verdict === "over"
                          ? "h-full bg-ink/70"
                          : "h-full bg-ink/30"
                    }
                    style={{ width: `${Math.max(2, (s.count / maxCount) * 100)}%` }}
                  />
                </div>

                <div className="flex items-center gap-2 justify-self-end">
                  <Figure className="text-sm">{s.count}</Figure>
                  {s.verdict === "under" ? (
                    <Badge tone="brass">under-used, +{s.deltaToMean}</Badge>
                  ) : s.verdict === "over" ? (
                    <Badge tone="neutral">over-used, {s.deltaToMean}</Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-on-surface-muted">
            Bars are proportional to the busiest singer. &ldquo;+3&rdquo; means three more
            slots would bring them to the group mean.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most-sung deities</CardTitle>
          </CardHeader>
          <CardContent>
            <CountList rows={deities} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most-sung ragas</CardTitle>
          </CardHeader>
          <CardContent>
            <CountList rows={ragas} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gone stale</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            Bhajans the group knows but has not sung in over a year. Measured over all
            history, not the window above. Bhajans never sung are not listed — they were
            never known, so they belong on the Build page instead.
          </div>
        </CardHeader>
        <CardContent>
          {stale.length === 0 ? (
            <p className="text-sm text-on-surface-muted">Nothing has lapsed a year. Unlikely, but good.</p>
          ) : (
            <ul className="grid gap-1">
              {stale.map((b) => (
                <li key={b.bhajanId} className="flex items-baseline justify-between gap-3 border-b border-rule-surface py-1 last:border-b-0">
                  <Link href={`/bhajans/${b.bhajanId}`} className="text-sm underline-offset-2 hover:underline">
                    {b.title}
                  </Link>
                  <span className="shrink-0 text-xs text-on-surface-muted">
                    <Figure>{Math.round((b.lastSungDaysAgo ?? 0) / 30)}</Figure> months ago ·
                    sung <Figure>{b.timesSung}</Figure>×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountList({ rows }: { rows: Array<{ name: string; count: number }> }) {
  if (rows.length === 0) return <p className="text-sm text-on-surface-muted">Nothing yet.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="grid gap-1">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm">{r.name}</div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
              <div className="h-full bg-ink/40" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </div>
          <Figure className="text-xs">{r.count}</Figure>
        </li>
      ))}
    </ul>
  );
}
