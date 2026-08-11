import { prisma } from "@/lib/db";
import type { BhajanFeatures } from "@/lib/bhajanSimilarity";

/**
 * The whole masterlist, as similarity features, cached in process.
 *
 * Reading 3,607 rows with their deity joins from Azure Postgres took ~1.5s and
 * was the single largest cost in opening a singer's suggestions. The data it
 * returns changes only when somebody adds or edits a bhajan — a few times a
 * month against many reads — so holding it in memory is the right trade.
 *
 * A plain module-level cache rather than unstable_cache: the app runs as one
 * App Service instance, so there is nothing to coordinate between, and this
 * stays obvious to read. The TTL is the only guarantee needed — a bhajan added
 * through the UI shows up in suggestions within five minutes, and
 * `invalidateBhajanPool` makes it immediate for the path that adds one.
 */

export type PoolEntry = BhajanFeatures & {
  referenceGentsPitch: string | null;
  referenceLadiesPitch: string | null;
};

const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; entries: PoolEntry[] } | null = null;
/** Concurrent callers share one query instead of each starting their own. */
let inFlight: Promise<PoolEntry[]> | null = null;

export function invalidateBhajanPool(): void {
  cache = null;
}

export async function getBhajanPool(): Promise<PoolEntry[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.entries;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const rows = await prisma.bhajan.findMany({
      select: {
        id: true,
        title: true,
        raga: true,
        tempo: true,
        beat: true,
        language: true,
        level: true,
        referenceGentsPitch: true,
        referenceLadiesPitch: true,
        deities: { select: { deity: { select: { name: true } } } },
      },
    });

    const entries: PoolEntry[] = rows.map((b) => ({
      id: b.id,
      title: b.title,
      deities: b.deities.map((d) => d.deity.name),
      raga: b.raga,
      tempo: b.tempo,
      beat: b.beat,
      language: b.language,
      level: b.level,
      referenceGentsPitch: b.referenceGentsPitch,
      referenceLadiesPitch: b.referenceLadiesPitch,
    }));

    cache = { at: Date.now(), entries };
    return entries;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
