/**
 * lib/availability.ts — when somebody cannot be rostered.
 *
 * Pure. No Prisma, no clock of its own.
 *
 * ## The privacy rule, and why it is a type and not a habit
 *
 * Two quite different things live here. One is a list of dates a singer cannot
 * sing, which the person building a roster must see. The other is why — and for
 * the cycle predictions, that is health information about a named woman in a
 * temple community.
 *
 * So they are separated at the type level. `AvailabilityForRoster` carries
 * dates and nothing else: no source, no note, no way to tell a predicted date
 * from a holiday. `OwnAvailability` carries the rest and is only ever built for
 * the person it belongs to. A query that hands a rosterer the second type does
 * not compile, which is a stronger guarantee than remembering not to.
 *
 * Sailavan chose this shape on 2026-08-20: the roster shows "likely
 * unavailable" and nothing more, identical in appearance to any other blocked
 * date.
 *
 * What this CANNOT do is hide anything from somebody with database access. He
 * was told that plainly before it was built. The cycle row exists, and an admin
 * with a connection string can read it.
 */

import { addDaysISO, daysBetweenISO } from './dates';

/** A date somebody cannot sing, as the roster sees it: no reason attached. */
export type AvailabilityForRoster = {
  singerId: string;
  /** `YYYY-MM-DD`. */
  date: string;
};

/** Why a date is blocked. Never leaves the singer's own pages. */
export type BlockSource = 'manual' | 'cycle';

/** A date as the singer herself sees it, reason included. */
export type OwnBlock = {
  date: string;
  source: BlockSource;
  /** Her own words, for her own reference. */
  note?: string | null;
};

/**
 * What somebody has told the app about their cycle. Entirely optional.
 *
 * Stored as the last start plus two lengths rather than a list of past dates:
 * it is the smallest thing that predicts, and the least to hold about somebody.
 */
export type CycleInput = {
  /** `YYYY-MM-DD` of the most recent period start. */
  lastStart: string;
  /** Days from one start to the next. */
  cycleLengthDays: number;
  /** How many days she is out of action. */
  durationDays: number;
};

/**
 * Bounds, so a typo cannot generate nonsense.
 *
 * A cycle shorter than 20 days or longer than 45 is outside what this simple
 * projection should be guessing at; anybody in that position is better served
 * by blocking dates by hand.
 */
export const MIN_CYCLE_DAYS = 20;
export const MAX_CYCLE_DAYS = 45;
export const MIN_DURATION_DAYS = 1;
export const MAX_DURATION_DAYS = 10;

/**
 * How far ahead a projection is offered at all.
 *
 * Six months. Each projected cycle carries the error of the one before it, so a
 * date a year out is arithmetic rather than a prediction, and showing it would
 * lend it a confidence it has not got.
 */
export const PREDICT_HORIZON_DAYS = 183;

export type CycleProblem = { field: keyof CycleInput; message: string };

/** Check a cycle before it is stored, with a message that says what to do. */
export function validateCycle(input: CycleInput): CycleProblem[] {
  const problems: CycleProblem[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lastStart)) {
    problems.push({ field: 'lastStart', message: 'Give the date your last period started.' });
  }
  if (
    !Number.isInteger(input.cycleLengthDays) ||
    input.cycleLengthDays < MIN_CYCLE_DAYS ||
    input.cycleLengthDays > MAX_CYCLE_DAYS
  ) {
    problems.push({
      field: 'cycleLengthDays',
      message: `Cycle length should be between ${MIN_CYCLE_DAYS} and ${MAX_CYCLE_DAYS} days.`,
    });
  }
  if (
    !Number.isInteger(input.durationDays) ||
    input.durationDays < MIN_DURATION_DAYS ||
    input.durationDays > MAX_DURATION_DAYS
  ) {
    problems.push({
      field: 'durationDays',
      message: `Give between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS} days.`,
    });
  }
  return problems;
}

/**
 * The dates a cycle predicts as unavailable, within a window.
 *
 * Projects forward from `lastStart` in whole cycles and blocks `durationDays`
 * from each start. Occurrences BEFORE `lastStart` are not projected backwards:
 * the past is a matter of record, not of arithmetic, and guessing at it would
 * put unexplained blocks on dates that have already happened.
 *
 * Returns sorted ISO dates with no duplicates. An invalid cycle predicts
 * nothing rather than throwing — a bad row must not take down a roster page.
 */
export function predictedDates(
  cycle: CycleInput,
  fromISO: string,
  toISODate: string,
): string[] {
  if (validateCycle(cycle).length > 0) return [];

  const span = daysBetweenISO(fromISO, toISODate);
  if (span === null || span < 0) return [];

  // Never project further than the horizon, however wide a window is asked for.
  const horizonEnd = addDaysISO(fromISO, Math.min(span, PREDICT_HORIZON_DAYS));
  if (!horizonEnd) return [];

  const offsetToWindow = daysBetweenISO(cycle.lastStart, fromISO);
  if (offsetToWindow === null) return [];

  // Start at the last occurrence at or before the window opens, so a period
  // already under way when the window starts still blocks its remaining days.
  const firstIndex = Math.max(0, Math.floor(offsetToWindow / cycle.cycleLengthDays));

  const out = new Set<string>();
  const windowEnd = daysBetweenISO(fromISO, horizonEnd) ?? 0;

  for (let k = firstIndex; ; k++) {
    const startOffset = k * cycle.cycleLengthDays;
    const start = addDaysISO(cycle.lastStart, startOffset);
    if (!start) break;
    const fromWindowStart = daysBetweenISO(fromISO, start);
    if (fromWindowStart === null) break;
    if (fromWindowStart > windowEnd) break;

    for (let d = 0; d < cycle.durationDays; d++) {
      const day = addDaysISO(start, d);
      if (!day) continue;
      const rel = daysBetweenISO(fromISO, day);
      if (rel === null || rel < 0 || rel > windowEnd) continue;
      out.add(day);
    }
  }

  return [...out].sort();
}

/**
 * Everything blocking a singer, as SHE sees it: her own dates and her
 * predictions, each labelled.
 *
 * Manual wins on a clash. She said that one out loud; the other is a guess.
 */
export function ownBlocks({
  manual,
  cycle,
  fromISO,
  toISODate,
}: {
  manual: readonly { date: string; note?: string | null }[];
  cycle: CycleInput | null;
  fromISO: string;
  toISODate: string;
}): OwnBlock[] {
  const byDate = new Map<string, OwnBlock>();
  if (cycle) {
    for (const date of predictedDates(cycle, fromISO, toISODate)) {
      byDate.set(date, { date, source: 'cycle' });
    }
  }
  for (const m of manual) {
    byDate.set(m.date, { date: m.date, source: 'manual', note: m.note ?? null });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The same information with the reasons stripped, for whoever is rostering.
 *
 * The only way to build the roster's view, and it takes `OwnBlock[]` so the
 * stripping is a step somebody has to pass through rather than a field they
 * have to remember not to select.
 */
export function forRoster(singerId: string, blocks: readonly OwnBlock[]): AvailabilityForRoster[] {
  return blocks.map((b) => ({ singerId, date: b.date }));
}

/** Is this singer blocked on this date? */
export function isBlockedOn(
  blocks: readonly AvailabilityForRoster[],
  singerId: string,
  date: string,
): boolean {
  return blocks.some((b) => b.singerId === singerId && b.date === date);
}

/** A lookup for a whole roster page: singer id -> the dates they cannot sing. */
export function blockedIndex(
  blocks: readonly AvailabilityForRoster[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  for (const b of blocks) {
    let set = map.get(b.singerId);
    if (!set) {
      set = new Set();
      map.set(b.singerId, set);
    }
    set.add(b.date);
  }
  return map;
}
