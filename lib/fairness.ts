/**
 * lib/fairness.ts — who is being over- and under-used, and what has gone stale.
 *
 * Pure. SPEC §4.E: "Prasanna has 67 slots, Triveni 16; that is the kind of
 * thing the app should make impossible to miss."
 *
 * The threshold is expressed as a share of the group mean rather than an
 * absolute count, so it keeps working as the group grows or the window changes.
 */

export type SingerLoad = {
  name: string;
  singerId: string;
  count: number;
};

export type LoadVerdict = 'under' | 'over' | 'balanced';

export type SingerLoadSummary = SingerLoad & {
  /** Their count as a multiple of the group mean. 1 is exactly average. */
  share: number;
  verdict: LoadVerdict;
  /** How many slots would bring them to the mean. Negative means give away. */
  deltaToMean: number;
};

/** Beyond ±this share of the mean, a singer is called out. */
export const LOAD_TOLERANCE = 0.35;

export function summariseLoad(loads: readonly SingerLoad[]): {
  singers: SingerLoadSummary[];
  mean: number;
  total: number;
} {
  const total = loads.reduce((sum, l) => sum + l.count, 0);
  const mean = loads.length > 0 ? total / loads.length : 0;

  const singers = loads
    .map((l) => {
      const share = mean > 0 ? l.count / mean : 1;
      const verdict: LoadVerdict =
        mean === 0
          ? 'balanced'
          : share < 1 - LOAD_TOLERANCE
            ? 'under'
            : share > 1 + LOAD_TOLERANCE
              ? 'over'
              : 'balanced';
      return {
        ...l,
        share,
        verdict,
        deltaToMean: Math.round(mean - l.count),
      };
    })
    .sort((a, b) => a.count - b.count);

  return { singers, mean, total };
}

export type StalenessBucket = 'never' | 'over-a-year' | 'six-to-twelve' | 'recent';

export type BhajanStaleness = {
  bhajanId: string;
  title: string;
  timesSung: number;
  lastSungDaysAgo: number | null;
};

export function stalenessBucket(b: BhajanStaleness): StalenessBucket {
  // Never sung is a different thing from stale: the group does not know it, so
  // it is a candidate to learn, not a lapse. Kept as its own bucket.
  if (b.lastSungDaysAgo === null) return 'never';
  if (b.lastSungDaysAgo >= 365) return 'over-a-year';
  if (b.lastSungDaysAgo >= 180) return 'six-to-twelve';
  return 'recent';
}

/**
 * Bhajans the group KNOWS but has let go stale (SPEC §4.E).
 * Never-sung bhajans are deliberately excluded — they were never known.
 */
export function staleKnownBhajans(
  bhajans: readonly BhajanStaleness[],
  minDays = 365,
): BhajanStaleness[] {
  return bhajans
    .filter((b) => b.timesSung > 0 && b.lastSungDaysAgo !== null && b.lastSungDaysAgo >= minDays)
    .sort((a, b) => (b.lastSungDaysAgo ?? 0) - (a.lastSungDaysAgo ?? 0));
}

/** Counts by an arbitrary key, sorted most-first. Used for deity and raga. */
export function countBy<T>(items: readonly T[], key: (item: T) => string[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const k of key(item)) {
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
