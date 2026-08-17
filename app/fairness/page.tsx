import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Figure, SectionTitle } from "@/components/ui";
import { summariseLoad, staleKnownBhajans, countBy, LOAD_TOLERANCE } from "@/lib/fairness";

import { getRole, can } from "@/lib/auth";
import { melbourneTodayISO } from "@/lib/dates";
import {
  parseFilters,
  filtersToQuery,
  describeFilters,
  PRESETS,
  MORNING_BEFORE,
} from "@/lib/fairnessFilters";
import { FairnessRange } from "./FairnessRange";
import { NoAccess } from "@/components/RequireRole";
import { LIVE_SESSION } from "@/lib/archive";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function FairnessPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    from?: string;
    to?: string;
    cat?: string;
    when?: string;
  }>;
}) {
  const role = await getRole();
  if (!can(role, "viewAllPages")) return <NoAccess what="The fairness dashboard" role={role} />;

  const sp = await searchParams;
  const todayISO = melbourneTodayISO();
  const filters = parseFilters(sp, todayISO);

  /*
   * Fairness compares people against each other, so what it is measured over
   * has to be sayable. A singer who does every festival and no weekdays looks
   * over-used against one who does the reverse, when neither is — hence the
   * kind-of-session and part-of-day filters, not just a window length.
   */
  const sessionWhere = {
    ...LIVE_SESSION,
    date: {
      gte: new Date(`${filters.fromISO}T00:00:00.000Z`),
      lte: new Date(`${filters.toISO}T00:00:00.000Z`),
    },
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.partOfDay === "morning" ? { startsAt: { lt: MORNING_BEFORE } } : {}),
    // Null startsAt means the usual evening (Session.startsAt), so "evenings"
    // has to include it — otherwise a session nobody gave a time to vanishes
    // from a filter it plainly belongs in.
    ...(filters.partOfDay === "evening"
      ? { OR: [{ startsAt: { gte: MORNING_BEFORE } }, { startsAt: null }] }
      : {}),
  };

  const [singers, slots, allSlots, categories] = await Promise.all([
    /*
     * Only people with a recorded voice. Somebody with none is not a singer
     * (lib/rosterEligibility.ts), so including them here showed a permanent
     * "never sung, most overdue" row and dragged the group average down,
     * making everybody else look busier than they are.
     */
    prisma.singer.findMany({ where: { gender: { not: null } }, orderBy: { name: "asc" } }),
    prisma.sessionSlot.findMany({
      where: { session: sessionWhere },
      select: {
        singerId: true,
        bhajan: { select: { deities: { select: { deity: { select: { name: true } } } }, raga: true } },
      },
    }),
    prisma.sessionSlot.findMany({
      where: { bhajanId: { not: null }, session: LIVE_SESSION },
      select: { bhajanId: true, bhajan: { select: { title: true } }, session: { select: { date: true } } },
    }),
    prisma.sessionCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const categoryName = categories.find((c) => c.id === filters.categoryId)?.name ?? null;

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
            {total} slots over {describeFilters(filters, categoryName, todayISO)} · group mean{" "}
            {mean.toFixed(1)} each. Anyone more than {Math.round(LOAD_TOLERANCE * 100)}% either
            side of the mean is called out.
          </div>

          {/* Each row changes one thing and keeps the rest — see filtersToQuery. */}
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((preset) => (
                <Link
                  key={preset.days}
                  href={`/fairness${filtersToQuery(filters, { days: preset.days, from: null, to: null })}`}
                  className={
                    preset.days === filters.presetDays
                      ? "rounded-full border border-brass/60 bg-brass/15 px-3 py-1"
                      : "rounded-full border border-rule-surface px-3 py-1 hover:bg-panel-hover"
                  }
                >
                  {preset.label}
                </Link>
              ))}
              <FairnessRange filters={filters} />
            </div>

            {categories.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-on-surface-muted">Kind:</span>
                <Link
                  href={`/fairness${filtersToQuery(filters, { cat: null })}`}
                  className={
                    filters.categoryId === null
                      ? "rounded-full border border-brass/60 bg-brass/15 px-3 py-0.5 text-xs"
                      : "rounded-full border border-rule-surface px-3 py-0.5 text-xs hover:bg-panel-hover"
                  }
                >
                  All
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/fairness${filtersToQuery(filters, { cat: c.id })}`}
                    className={
                      filters.categoryId === c.id
                        ? "rounded-full border border-brass/60 bg-brass/15 px-3 py-0.5 text-xs"
                        : "rounded-full border border-rule-surface px-3 py-0.5 text-xs hover:bg-panel-hover"
                    }
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-on-surface-muted">Time:</span>
              {(["any", "morning", "evening"] as const).map((w) => (
                <Link
                  key={w}
                  href={`/fairness${filtersToQuery(filters, { when: w })}`}
                  className={
                    filters.partOfDay === w
                      ? "rounded-full border border-brass/60 bg-brass/15 px-3 py-0.5 text-xs"
                      : "rounded-full border border-rule-surface px-3 py-0.5 text-xs hover:bg-panel-hover"
                  }
                >
                  {w === "any" ? "Any" : w === "morning" ? "Mornings" : "Evenings"}
                </Link>
              ))}
            </div>
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
                <div className="h-5 overflow-hidden rounded-full bg-panel">
                  <div
                    className={
                      s.verdict === "under"
                        ? "h-full bg-brass/85"
                        : s.verdict === "over"
                          ? "h-full bg-on-surface/40"
                          : "h-full bg-on-surface/20"
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
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-panel">
              <div className="h-full bg-brass/50" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </div>
          <Figure className="text-xs">{r.count}</Figure>
        </li>
      ))}
    </ul>
  );
}

