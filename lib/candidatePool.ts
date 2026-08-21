/**
 * lib/candidatePool.ts — the filters, as pure functions.
 *
 * Split out of lib/candidateQueries.ts so it can be tested without a database:
 * that module imports Prisma and React's `cache`, and CLAUDE.md asks for domain
 * logic to be unit-testable without either.
 *
 * "Missing is not excluded" (CLAUDE.md) lives here. Every facet filter offers an
 * explicit `unspecified` value, and leaving a facet unset never drops bhajans
 * that simply lack that field. A third of the masterlist has no tempo and
 * nearly a third no level; those bhajans must stay reachable.
 */

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

function matchesFacet(value: string | null, selected: string[] | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  const blank = value === null || value.trim() === '';
  if (blank) return selected.includes(UNSPECIFIED);
  return selected.some((s) => s.toLowerCase() === value.trim().toLowerCase());
}

/**
 * One bhajan, with every question the filters ask already answered.
 *
 * The shape `selectCandidates` works on, and the reason it can be tested
 * without a database: nothing here is a Prisma type.
 */
export type PoolRow = {
  id: string;
  title: string;
  deities: string[];
  raga: string | null;
  language: string | null;
  tempo: string | null;
  level: string | null;
  beat: string | null;
  hasLyrics: boolean;
  hasAudio: boolean;
  hasReference: boolean;
  timesSung: number;
  lastSung: Date | null;
};

/**
 * Apply the filters. Pure — this is where "missing is not excluded" lives.
 *
 * `repertoireIds` is the set of bhajans the named singers already know, and is
 * only consulted when the coordinator named some (SPEC §9.3).
 */
export function selectCandidates(
  rows: readonly PoolRow[],
  filters: CandidateFilters,
  asOf: Date,
  repertoireIds: ReadonlySet<string> = new Set(),
): Candidate[] {
  const DAY = 24 * 60 * 60 * 1000;
  const excluded = (filters.excludeDeities ?? []).map((d) => d.toLowerCase());

  const pool: Candidate[] = [];
  for (const b of rows) {
    if (filters.deities?.length) {
      const wantsUnspecified = filters.deities.includes(UNSPECIFIED);
      const hit =
        (b.deities.length === 0 && wantsUnspecified) ||
        b.deities.some((d) => filters.deities!.some((f) => f.toLowerCase() === d.toLowerCase()));
      if (!hit) continue;
    }
    if (excluded.length && b.deities.some((d) => excluded.includes(d.toLowerCase()))) continue;

    if (!matchesFacet(b.language, filters.languages)) continue;
    if (!matchesFacet(b.tempo, filters.tempos)) continue;
    if (!matchesFacet(b.level, filters.levels)) continue;
    if (!matchesFacet(b.beat, filters.beats)) continue;

    if (filters.requireLyrics && !b.hasLyrics) continue;
    if (filters.requireAudio && !b.hasAudio) continue;
    if (filters.requireReference && !b.hasReference) continue;

    // Repertoire is a SCORING input by default (SPEC §9.3); it only filters
    // when the coordinator explicitly opts in by naming singers.
    if (filters.repertoireOf?.length && !repertoireIds.has(b.id)) continue;

    if (filters.sungBefore === 'known' && b.timesSung === 0) continue;
    if (filters.sungBefore === 'new' && b.timesSung > 0) continue;

    pool.push({
      id: b.id,
      title: b.title,
      deities: b.deities,
      raga: b.raga,
      language: b.language,
      tempo: b.tempo,
      level: b.level,
      beat: b.beat,
      hasLyrics: b.hasLyrics,
      hasAudio: b.hasAudio,
      hasReference: b.hasReference,
      timesSung: b.timesSung,
      lastSungDaysAgo: b.lastSung
        ? Math.max(0, Math.round((asOf.getTime() - b.lastSung.getTime()) / DAY))
        : null,
    });
  }

  return pool;
}

