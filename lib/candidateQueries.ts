/**
 * lib/candidateQueries.ts — reading the masterlist for the generator.
 *
 * The DATABASE half. The filters themselves are pure and live in
 * lib/candidatePool.ts, which has no Prisma import and is unit-tested; this
 * module's job is to read the rows they work on, as few times as possible.
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { RepertoireKind } from '@prisma/client';
import type { Candidate } from '@/lib/sessionBuilder';
import { selectCandidates, type CandidateFilters, type PoolRow } from '@/lib/candidatePool';
import { LIVE_SESSION } from './archive';

// Re-exported so the pages keep importing the filter vocabulary from one place.
export { UNSPECIFIED, selectCandidates } from '@/lib/candidatePool';
export type { CandidateFilters, PoolRow } from '@/lib/candidatePool';

export type FacetValue = { name: string; count: number };

export type FacetOptions = {
  deities: string[];
  /** Languages with their bhajan counts — 40 distinct values, most of them
   *  one-off combinations, so the UI shows only the common ones. */
  languages: FacetValue[];
  tempos: string[];
  levels: string[];
  beats: string[];
};

/**
 * Everything about the masterlist that the pool and the facets both come from,
 * read ONCE per request.
 *
 * /build and /explore each ask for the facet list AND the candidate pool, and
 * both answers are derived from the same 3,607 rows. Asking twice meant five
 * extra round trips to a Burstable database for numbers already in memory, and
 * CLAUDE.md is explicit about why that hurts: the round-trip count is what that
 * server's variance multiplies.
 *
 * `cache` from React memoises for the life of ONE request — the same trick
 * lib/auth.ts uses on the signed-in singer. Outside a request it is a no-op, so
 * scripts and tests behave normally.
 *
 * `lyrics` is deliberately NOT selected. It is 0.72 MB of Text across the
 * masterlist and the only question ever asked of it is whether it is empty, so
 * the answer comes back as a list of ids instead — which halved this query.
 * Blank-but-not-null is not a state this database holds (checked across every
 * text column here: zero rows) and `cleanFieldValue` in lib/bhajanFields.ts
 * turns a blank edit into null, so `not: null` is the same test as `.trim()`.
 */
type MasterlistRow = {
  id: string;
  title: string;
  raga: string | null;
  language: string | null;
  tempo: string | null;
  level: string | null;
  beat: string | null;
  audio: string | null;
  referenceGentsPitch: string | null;
  referenceLadiesPitch: string | null;
  deities: Array<{ deity: { name: string } }>;
};

/**
 * The masterlist itself, CACHED ACROSS REQUESTS.
 *
 * Measured on dev, 2026-08-21: this read is essentially the whole cost of both
 * /build and /explore. Asking /explore to render one bhajan instead of fifty —
 * 78 KB against 306 KB — changed the page's time by nothing at all, because the
 * fixed part is 3,607 rows crossing the wire and being turned into objects on a
 * shared vCPU, and the fixed part is all of it.
 *
 * It is also the most cacheable thing in the app. The masterlist is a copy of
 * somebody else's spreadsheet: 3,607 rows that change when a member corrects a
 * raga or adds a bhajan, which is a handful of times a month. So it is tagged
 * and the three write paths clear it — see `BHAJANS_TAG` below.
 *
 * The one-hour `revalidate` is a backstop, not the mechanism. If a future write
 * path forgets the tag, the list is stale for an hour rather than until the app
 * restarts. The seed and backfill scripts write outside the app entirely and
 * cannot call `revalidateTag` at all, so for them the hour IS the mechanism.
 *
 * Returned as plain arrays: `unstable_cache` serialises what it stores, and a
 * Set or a Map would not survive the trip. They are rebuilt per request by
 * `loadMasterlist`, which costs about a millisecond.
 *
 * `lyrics` is deliberately NOT selected. It is 0.72 MB of Text across the
 * masterlist and the only question ever asked of it is whether it is empty, so
 * the answer comes back as a list of ids instead — which halved this query.
 * Blank-but-not-null is not a state this database holds (checked across every
 * text column here: zero rows) and `cleanFieldValue` in lib/bhajanFields.ts
 * turns a blank edit into null, so `not: null` is the same test as `.trim()`.
 */
export const BHAJANS_TAG = 'masterlist';

const loadBhajans = unstable_cache(
  async () => {
    const [bhajans, withLyrics, deities] = await Promise.all([
      prisma.bhajan.findMany({
        select: {
          id: true,
          title: true,
          raga: true,
          language: true,
          tempo: true,
          level: true,
          beat: true,
          audio: true,
          referenceGentsPitch: true,
          referenceLadiesPitch: true,
          deities: { select: { deity: { select: { name: true } } } },
        },
      }),
      prisma.bhajan.findMany({ where: { lyrics: { not: null } }, select: { id: true } }),
      prisma.deity.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
    ]);

    return {
      bhajans: bhajans as MasterlistRow[],
      lyricIds: withLyrics.map((b) => b.id),
      deityNames: deities.map((d) => d.name),
    };
  },
  ['masterlist-rows'],
  { tags: [BHAJANS_TAG], revalidate: 3600 },
);

/**
 * What has been sung, and when. NOT cached across requests.
 *
 * This changes every time somebody rosters a bhajan, and "days since last sung"
 * is what floats a bhajan back up the suggestions — a stale answer here would
 * keep proposing something the group sang on Thursday. It is 765 rows and one
 * round trip, so there is nothing to gain by risking it.
 *
 * Slots rather than an aggregate: `groupBy` cannot reach through the relation to
 * the session's date, and the date is the part that matters. There used to be a
 * `groupBy` here as well, computing counts that were thrown away on the next
 * line with `void sungStats` — a whole round trip for nothing.
 */
const loadSungHistory = cache(async () => {
  const slots = await prisma.sessionSlot.findMany({
    where: { bhajanId: { not: null }, session: LIVE_SESSION },
    select: { bhajanId: true, session: { select: { date: true } } },
  });

  const timesSung = new Map<string, number>();
  const lastSung = new Map<string, Date>();
  for (const s of slots) {
    if (!s.bhajanId) continue;
    timesSung.set(s.bhajanId, (timesSung.get(s.bhajanId) ?? 0) + 1);
    const current = lastSung.get(s.bhajanId);
    if (!current || s.session.date > current) lastSung.set(s.bhajanId, s.session.date);
  }
  return { timesSung, lastSung };
});

/**
 * Both halves, once per request.
 *
 * `cache` from React memoises for the life of ONE request — the same trick
 * lib/auth.ts uses on the signed-in singer. /build and /explore each want the
 * facet list AND the candidate pool, and both are derived from these same rows,
 * so without this they would each be read twice.
 */
const loadMasterlist = cache(async () => {
  const [{ bhajans, lyricIds, deityNames }, { timesSung, lastSung }] = await Promise.all([
    loadBhajans(),
    loadSungHistory(),
  ]);
  return { bhajans, hasLyrics: new Set(lyricIds), timesSung, lastSung, deityNames };
});

const distinct = (values: ReadonlyArray<string | null>) =>
  [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))].sort(
    (a, b) => a.localeCompare(b),
  );

/** Distinct facet values for the filter UI, each including `unspecified`. */
export async function getFacetOptions(): Promise<FacetOptions> {
  const { bhajans, deityNames } = await loadMasterlist();

  // Tallied in memory rather than with four GROUP BYs. Every one of them was a
  // full scan of the same table this request has already read.
  const languageCounts = new Map<string, number>();
  for (const b of bhajans) {
    const language = (b.language ?? '').trim();
    if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  }

  return {
    deities: deityNames,
    languages: [...languageCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    tempos: distinct(bhajans.map((b) => b.tempo)),
    levels: distinct(bhajans.map((b) => b.level)),
    beats: distinct(bhajans.map((b) => b.beat)),
  };
}

/**
 * Build the candidate pool.
 *
 * `asOf` is the session date being planned for, so "days since last sung" is
 * measured against the session rather than against now.
 */
export async function getCandidatePool(
  filters: CandidateFilters,
  asOf: Date,
): Promise<Candidate[]> {
  const [masterlist, repertoire] = await Promise.all([
    loadMasterlist(),
    filters.repertoireOf?.length
      ? prisma.singerRepertoire.findMany({
          where: { singer: { name: { in: filters.repertoireOf } }, bhajanId: { not: null } },
          select: { bhajanId: true, kind: true },
        })
      : Promise.resolve([] as { bhajanId: string | null; kind: RepertoireKind }[]),
  ]);

  const repertoireIds = new Set(
    repertoire.map((r) => r.bhajanId).filter((id): id is string => id !== null),
  );

  const rows: PoolRow[] = masterlist.bhajans.map((b) => ({
    id: b.id,
    title: b.title,
    deities: b.deities.map((d) => d.deity.name),
    raga: b.raga,
    language: b.language,
    tempo: b.tempo,
    level: b.level,
    beat: b.beat,
    hasLyrics: masterlist.hasLyrics.has(b.id),
    hasAudio: Boolean(b.audio && b.audio.trim()),
    hasReference: Boolean(
      (b.referenceGentsPitch && b.referenceGentsPitch.trim()) ||
        (b.referenceLadiesPitch && b.referenceLadiesPitch.trim()),
    ),
    timesSung: masterlist.timesSung.get(b.id) ?? 0,
    lastSung: masterlist.lastSung.get(b.id) ?? null,
  }));

  return selectCandidates(rows, filters, asOf, repertoireIds);
}

export type BhajanSinger = {
  id: string;
  name: string;
  gender: string | null;
  /** How we know they can sing it — strongest first. */
  basis: 'sung' | 'festival' | 'known';
  /** When they last sang this bhajan. Null if only on a list. */
  lastSung: Date | null;
};

/**
 * Who can sing each of these bhajans.
 *
 * "Can" is evidence, not permission: they have sung it before, or it is on
 * their festival or known list. Repertoire never restricts who may be assigned
 * (SPEC §9.3) — this only surfaces the obvious candidates so a coordinator can
 * pick one without leaving the page.
 */
export async function getSingersForBhajans(
  bhajanIds: readonly string[],
): Promise<Map<string, BhajanSinger[]>> {
  const out = new Map<string, BhajanSinger[]>();
  if (bhajanIds.length === 0) return out;

  const [sung, repertoire] = await Promise.all([
    prisma.sessionSlot.findMany({
      where: { bhajanId: { in: [...bhajanIds] }, singerId: { not: null }, session: LIVE_SESSION },
      select: {
        bhajanId: true,
        session: { select: { date: true } },
        singer: { select: { id: true, name: true, gender: true } },
      },
    }),
    prisma.singerRepertoire.findMany({
      where: { bhajanId: { in: [...bhajanIds] } },
      select: {
      bhajanId: true,
      kind: true,
      isFestival: true,
      singer: { select: { id: true, name: true, gender: true } },
    },
    }),
  ]);

  const add = (
    bhajanId: string | null,
    s: { id: string; name: string; gender: string | null } | null,
    basis: BhajanSinger['basis'],
    lastSung: Date | null = null,
  ) => {
    if (!bhajanId || !s) return;
    if (!out.has(bhajanId)) out.set(bhajanId, []);
    const list = out.get(bhajanId)!;
    const existing = list.find((x) => x.id === s.id);
    // Strongest evidence wins: having sung it beats being on a list.
    const rank = { sung: 3, festival: 2, known: 1 } as const;
    if (existing) {
      if (rank[basis] > rank[existing.basis]) existing.basis = basis;
      // Keep the most recent occasion they sang it.
      if (lastSung && (!existing.lastSung || lastSung > existing.lastSung)) {
        existing.lastSung = lastSung;
      }
      return;
    }
    list.push({ id: s.id, name: s.name, gender: s.gender, basis, lastSung });
  };

  for (const r of sung) add(r.bhajanId, r.singer, 'sung', r.session.date);
  for (const r of repertoire) {
    add(r.bhajanId, r.singer, r.isFestival ? 'festival' : 'known');
  }

  for (const list of out.values()) {
    const rank = { sung: 3, festival: 2, known: 1 } as const;
    list.sort((a, b) => rank[b.basis] - rank[a.basis] || a.name.localeCompare(b.name));
  }
  return out;
}
