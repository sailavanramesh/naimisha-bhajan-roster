/**
 * lib/candidateQueries.ts — building the candidate pool for the generator.
 *
 * "Missing is not excluded" (CLAUDE.md). Every facet filter here offers an
 * explicit `unspecified` value, and leaving a facet unset never drops bhajans
 * that simply lack that field. A third of the masterlist has no tempo and
 * nearly a third no level; those bhajans must stay reachable.
 */

import { prisma } from '@/lib/db';
import { RepertoireKind } from '@prisma/client';
import type { Candidate } from '@/lib/sessionBuilder';

/** Sentinel meaning "this field is blank in the masterlist". */
export const UNSPECIFIED = 'unspecified';

export type CandidateFilters = {
  deities?: string[];
  excludeDeities?: string[];
  languages?: string[];
  tempos?: string[];
  levels?: string[];
  beats?: string[];
  requireLyrics?: boolean;
  requireAudio?: boolean;
  requireReference?: boolean;
  /** Restrict to bhajans at least one of these singers already knows. */
  repertoireOf?: string[];
  /**
   * Only ~600 of 3,607 bhajans have ever been sung, so an unfiltered pool
   * naturally produces sets of songs nobody in the group knows.
   * `known` restricts to bhajans with sung history, `new` to those without.
   */
  sungBefore?: 'any' | 'known' | 'new';
};

export type FacetOptions = {
  deities: string[];
  languages: string[];
  tempos: string[];
  levels: string[];
  beats: string[];
};

/** Distinct facet values for the filter UI, each including `unspecified`. */
export async function getFacetOptions(): Promise<FacetOptions> {
  const [deities, languages, tempos, levels, beats] = await Promise.all([
    prisma.deity.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
    prisma.bhajan.groupBy({ by: ['language'] }),
    prisma.bhajan.groupBy({ by: ['tempo'] }),
    prisma.bhajan.groupBy({ by: ['level'] }),
    prisma.bhajan.groupBy({ by: ['beat'] }),
  ]);

  const values = (rows: { [k: string]: string | null }[], key: string) =>
    rows
      .map((r) => r[key])
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .sort((a, b) => a.localeCompare(b));

  return {
    deities: deities.map((d) => d.name),
    languages: values(languages, 'language'),
    tempos: values(tempos, 'tempo'),
    levels: values(levels, 'level'),
    beats: values(beats, 'beat'),
  };
}

function matchesFacet(value: string | null, selected: string[] | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  const blank = value === null || value.trim() === '';
  if (blank) return selected.includes(UNSPECIFIED);
  return selected.some((s) => s.toLowerCase() === value.trim().toLowerCase());
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
  const [bhajans, sungStats, repertoire] = await Promise.all([
    prisma.bhajan.findMany({
      select: {
        id: true,
        title: true,
        raga: true,
        language: true,
        tempo: true,
        level: true,
        beat: true,
        lyrics: true,
        audio: true,
        referenceGentsPitch: true,
        referenceLadiesPitch: true,
        deities: { select: { deity: { select: { name: true } } } },
      },
    }),
    prisma.sessionSlot.groupBy({
      by: ['bhajanId'],
      where: { bhajanId: { not: null } },
      _count: { _all: true },
      _max: { sessionId: true },
    }),
    filters.repertoireOf?.length
      ? prisma.singerRepertoire.findMany({
          where: { singer: { name: { in: filters.repertoireOf } }, bhajanId: { not: null } },
          select: { bhajanId: true, kind: true },
        })
      : Promise.resolve([] as { bhajanId: string | null; kind: RepertoireKind }[]),
  ]);

  // Last sung date per bhajan. groupBy cannot reach through the relation to the
  // session date, so this is a second pass over the slots that actually matter.
  const lastSung = new Map<string, Date>();
  const sungCount = new Map<string, number>();
  const slots = await prisma.sessionSlot.findMany({
    where: { bhajanId: { not: null } },
    select: { bhajanId: true, session: { select: { date: true } } },
  });
  for (const s of slots) {
    if (!s.bhajanId) continue;
    sungCount.set(s.bhajanId, (sungCount.get(s.bhajanId) ?? 0) + 1);
    const current = lastSung.get(s.bhajanId);
    if (!current || s.session.date > current) lastSung.set(s.bhajanId, s.session.date);
  }
  void sungStats;

  const repertoireIds = new Set(
    repertoire.map((r) => r.bhajanId).filter((id): id is string => id !== null),
  );

  const DAY = 24 * 60 * 60 * 1000;
  const excluded = (filters.excludeDeities ?? []).map((d) => d.toLowerCase());

  const pool: Candidate[] = [];
  for (const b of bhajans) {
    const deities = b.deities.map((d) => d.deity.name);

    if (filters.deities?.length) {
      const wantsUnspecified = filters.deities.includes(UNSPECIFIED);
      const hit =
        (deities.length === 0 && wantsUnspecified) ||
        deities.some((d) => filters.deities!.some((f) => f.toLowerCase() === d.toLowerCase()));
      if (!hit) continue;
    }
    if (excluded.length && deities.some((d) => excluded.includes(d.toLowerCase()))) continue;

    if (!matchesFacet(b.language, filters.languages)) continue;
    if (!matchesFacet(b.tempo, filters.tempos)) continue;
    if (!matchesFacet(b.level, filters.levels)) continue;
    if (!matchesFacet(b.beat, filters.beats)) continue;

    const hasLyrics = Boolean(b.lyrics && b.lyrics.trim());
    const hasAudio = Boolean(b.audio && b.audio.trim());
    const hasReference = Boolean(
      (b.referenceGentsPitch && b.referenceGentsPitch.trim()) ||
        (b.referenceLadiesPitch && b.referenceLadiesPitch.trim()),
    );
    if (filters.requireLyrics && !hasLyrics) continue;
    if (filters.requireAudio && !hasAudio) continue;
    if (filters.requireReference && !hasReference) continue;

    // Repertoire is a SCORING input by default (SPEC §9.3); it only filters
    // when the coordinator explicitly opts in by naming singers.
    if (filters.repertoireOf?.length && !repertoireIds.has(b.id)) continue;

    const timesSung = sungCount.get(b.id) ?? 0;
    if (filters.sungBefore === 'known' && timesSung === 0) continue;
    if (filters.sungBefore === 'new' && timesSung > 0) continue;

    const last = lastSung.get(b.id) ?? null;
    pool.push({
      id: b.id,
      title: b.title,
      deities,
      raga: b.raga,
      language: b.language,
      tempo: b.tempo,
      level: b.level,
      beat: b.beat,
      hasLyrics,
      hasAudio,
      hasReference,
      timesSung,
      lastSungDaysAgo: last ? Math.max(0, Math.round((asOf.getTime() - last.getTime()) / DAY)) : null,
    });
  }

  return pool;
}
