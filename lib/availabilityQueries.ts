/**
 * lib/availabilityQueries.ts — the database side of availability.
 *
 * The one rule this file exists to enforce:
 *
 *   `ownAvailability` reads the cycle and is ONLY ever called with the id of
 *   the person asking. `rosterAvailability` reads it too — it has to, to
 *   project the dates — but returns `AvailabilityForRoster`, which cannot
 *   carry a reason. Nothing here returns a cycle row to a caller.
 *
 * Keeping both in one small file is deliberate: the two queries are a pair, and
 * reading them together is what makes the boundary obvious.
 */

import { prisma } from './db';
import { toISO } from './dates';
import {
  ownBlocks,
  predictedDates,
  type AvailabilityForRoster,
  type CycleInput,
  type OwnBlock,
} from './availability';

/** A stored `@db.Date` as `YYYY-MM-DD`, without letting a timezone shift it. */
function dateToISO(d: Date): string {
  return toISO(d);
}

function toCycleInput(row: {
  lastStart: Date;
  cycleLengthDays: number;
  durationDays: number;
} | null): CycleInput | null {
  if (!row) return null;
  return {
    lastStart: dateToISO(row.lastStart),
    cycleLengthDays: row.cycleLengthDays,
    durationDays: row.durationDays,
  };
}

/**
 * Everything blocking ONE singer, reasons included.
 *
 * For their own page. `singerId` must be the person asking — there is no
 * capability that lets anybody call this for somebody else, and none should be
 * added.
 */
export async function ownAvailability(
  singerId: string,
  fromISO: string,
  toISODate: string,
): Promise<{ blocks: OwnBlock[]; cycle: CycleInput | null }> {
  const [manual, cycleRow] = await Promise.all([
    prisma.singerUnavailability.findMany({
      where: { singerId },
      orderBy: { date: 'asc' },
      select: { date: true, note: true },
    }),
    prisma.singerCycle.findUnique({
      where: { singerId },
      select: { lastStart: true, cycleLengthDays: true, durationDays: true },
    }),
  ]);

  const cycle = toCycleInput(cycleRow);
  return {
    blocks: ownBlocks({
      manual: manual.map((m) => ({ date: dateToISO(m.date), note: m.note })),
      cycle,
      fromISO,
      toISODate,
    }),
    cycle,
  };
}

/**
 * Who cannot sing, and on which dates, for everybody — dates only.
 *
 * Used by whoever is building a roster. The cycle rows are read here because
 * the projection needs them, and are turned into bare dates before they leave.
 * The return type is what stops a reason travelling: there is no field to put
 * one in.
 */
export async function rosterAvailability(
  fromISO: string,
  toISODate: string,
): Promise<AvailabilityForRoster[]> {
  const [manual, cycles] = await Promise.all([
    prisma.singerUnavailability.findMany({
      where: { date: { gte: new Date(`${fromISO}T00:00:00.000Z`), lte: new Date(`${toISODate}T00:00:00.000Z`) } },
      select: { singerId: true, date: true },
    }),
    prisma.singerCycle.findMany({
      select: { singerId: true, lastStart: true, cycleLengthDays: true, durationDays: true },
    }),
  ]);

  const out: AvailabilityForRoster[] = manual.map((m) => ({
    singerId: m.singerId,
    date: dateToISO(m.date),
  }));

  for (const row of cycles) {
    const cycle = toCycleInput(row);
    if (!cycle) continue;
    for (const date of predictedDates(cycle, fromISO, toISODate)) {
      out.push({ singerId: row.singerId, date });
    }
  }

  // What keeps a reason from travelling is the RETURN TYPE, not a step taken
  // here: AvailabilityForRoster has nowhere to put one, so a caller cannot
  // read what was never selected into the shape. Adding a field to that type
  // is the change to argue about, and lib/availability.test.ts asserts its
  // keys are exactly singerId and date.
  return out;
}
