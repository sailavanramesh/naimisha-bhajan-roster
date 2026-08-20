/**
 * lib/availabilityBoard.ts — laying out months of availability so it can be read.
 *
 * Pure.
 *
 * The obvious version of this is a row per singer and a column per day. Over
 * three months that is 92 columns, which is not a plan, it is a wall. Nobody is
 * rostered on a Tuesday.
 *
 * So the columns are the days that can actually carry a session: every session
 * already in the diary, plus the group's usual weekday ahead of that, which is
 * how a coordinator finds out that half the singers are away on a Thursday
 * nobody has built yet. Fifteen or so columns over three months — readable
 * without scrolling on a laptop, and grouped by month so the eye can find
 * September.
 */

import { addDaysISO, daysBetweenISO, nextWeekday, THURSDAY } from './dates';

export type BoardColumn = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** True when a session already exists on this date. */
  scheduled: boolean;
  /** `2026-09`, for grouping. */
  month: string;
};

/**
 * The dates worth a column, in order.
 *
 * `sessionDates` are the ones already in the diary — kept whatever weekday they
 * fall on, because festivals do not wait for Thursday. The recurring weekday is
 * added on top so the near future is visible before anybody has built it.
 */
export function boardColumns({
  sessionDates,
  fromISO,
  toISODate,
  weekday = THURSDAY,
}: {
  sessionDates: readonly string[];
  fromISO: string;
  toISODate: string;
  weekday?: number;
}): BoardColumn[] {
  const span = daysBetweenISO(fromISO, toISODate);
  if (span === null || span < 0) return [];

  const scheduled = new Set(
    sessionDates.filter((d) => {
      const off = daysBetweenISO(fromISO, d);
      return off !== null && off >= 0 && off <= span;
    }),
  );

  const dates = new Set(scheduled);

  // Walk the recurring weekday forward from the first one on or after the start.
  let cursor = nextWeekday(fromISO, weekday);
  for (let guard = 0; guard < 400; guard++) {
    const off = daysBetweenISO(fromISO, cursor);
    if (off === null || off > span) break;
    dates.add(cursor);
    const next = addDaysISO(cursor, 7);
    if (!next) break;
    cursor = next;
  }

  return [...dates]
    .sort()
    .map((date) => ({ date, scheduled: scheduled.has(date), month: date.slice(0, 7) }));
}

/** Columns grouped into months, so a header can span each one. */
export function byMonth(columns: readonly BoardColumn[]): { month: string; columns: BoardColumn[] }[] {
  const out: { month: string; columns: BoardColumn[] }[] = [];
  for (const c of columns) {
    const last = out[out.length - 1];
    if (last && last.month === c.month) last.columns.push(c);
    else out.push({ month: c.month, columns: [c] });
  }
  return out;
}

/** `2026-09` -> `September 2026`. */
export function monthLabel(month: string): string {
  const d = new Date(`${month}-01T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return month;
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** `2026-09-03` -> `Thu 3`. Short, because it sits above a narrow column. */
export function columnLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return { weekday: '', day: date };
  return {
    weekday: new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(d),
    day: String(d.getUTCDate()),
  };
}

export type BoardRow = {
  singerId: string;
  name: string;
  gender: string | null;
  /** Dates in this board's window on which they cannot sing. */
  awayOn: ReadonlySet<string>;
};

/** How many of the board's columns each singer is away for, and vice versa. */
export function boardTotals(rows: readonly BoardRow[], columns: readonly BoardColumn[]) {
  const awayPerDate = new Map<string, number>();
  for (const c of columns) awayPerDate.set(c.date, 0);
  for (const r of rows) {
    for (const c of columns) {
      if (r.awayOn.has(c.date)) awayPerDate.set(c.date, (awayPerDate.get(c.date) ?? 0) + 1);
    }
  }
  const awayPerSinger = new Map<string, number>();
  for (const r of rows) {
    awayPerSinger.set(r.singerId, columns.filter((c) => r.awayOn.has(c.date)).length);
  }
  return { awayPerDate, awayPerSinger };
}
