import { describe, it, expect } from 'vitest';
import { boardColumns, byMonth, monthLabel, columnLabel, boardTotals } from './availabilityBoard';
import { THURSDAY } from './dates';

describe('boardColumns', () => {
  it('gives a column per Thursday, not per day', () => {
    // 2026-09-01 is a Tuesday. Four weeks should be four Thursdays, not 28 days.
    const cols = boardColumns({ sessionDates: [], fromISO: '2026-09-01', toISODate: '2026-09-28' });
    expect(cols.map((c) => c.date)).toEqual(['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']);
    for (const c of cols) expect(new Date(`${c.date}T12:00:00Z`).getUTCDay()).toBe(THURSDAY);
  });

  it('keeps a scheduled session on any weekday — festivals do not wait for Thursday', () => {
    const cols = boardColumns({
      sessionDates: ['2026-09-06', '2026-09-03'],
      fromISO: '2026-09-01',
      toISODate: '2026-09-12',
    });
    expect(cols.map((c) => c.date)).toEqual(['2026-09-03', '2026-09-06', '2026-09-10']);
    expect(cols.find((c) => c.date === '2026-09-06')!.scheduled).toBe(true);
    expect(cols.find((c) => c.date === '2026-09-10')!.scheduled).toBe(false);
  });

  it('does not duplicate a Thursday that already has a session', () => {
    // Two Thursdays in the window, one of them already scheduled: two columns,
    // not three.
    const cols = boardColumns({
      sessionDates: ['2026-09-03'],
      fromISO: '2026-09-01',
      toISODate: '2026-09-12',
    });
    expect(cols.map((c) => c.date)).toEqual(['2026-09-03', '2026-09-10']);
    expect(cols[0]).toMatchObject({ date: '2026-09-03', scheduled: true });
    expect(cols[1]).toMatchObject({ date: '2026-09-10', scheduled: false });
  });

  it('ignores sessions outside the window', () => {
    const cols = boardColumns({
      sessionDates: ['2026-07-04', '2027-01-01'],
      fromISO: '2026-09-01',
      toISODate: '2026-09-09',
    });
    expect(cols.every((c) => c.date >= '2026-09-01' && c.date <= '2026-09-09')).toBe(true);
  });

  it('stays a readable number of columns over three months', () => {
    const cols = boardColumns({ sessionDates: [], fromISO: '2026-09-01', toISODate: '2026-11-30' });
    expect(cols.length).toBeLessThanOrEqual(16);
    expect(cols.length).toBeGreaterThanOrEqual(12);
  });

  it('returns nothing for a backwards window', () => {
    expect(boardColumns({ sessionDates: [], fromISO: '2026-09-30', toISODate: '2026-09-01' })).toEqual([]);
  });
});

describe('grouping and labels', () => {
  it('groups consecutive columns by month, in order', () => {
    const cols = boardColumns({ sessionDates: [], fromISO: '2026-09-01', toISODate: '2026-10-31' });
    const groups = byMonth(cols);
    expect(groups.map((g) => g.month)).toEqual(['2026-09', '2026-10']);
    expect(groups.reduce((n, g) => n + g.columns.length, 0)).toBe(cols.length);
  });

  it('labels months and days for a narrow column', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(columnLabel('2026-09-03')).toEqual({ weekday: 'Thu', day: '3' });
  });
});

describe('boardTotals', () => {
  it('counts who is away per date and per singer', () => {
    const cols = boardColumns({ sessionDates: [], fromISO: '2026-09-01', toISODate: '2026-09-17' });
    const rows = [
      { singerId: 'a', name: 'A', gender: 'Ladies', awayOn: new Set(['2026-09-03', '2026-09-10']) },
      { singerId: 'b', name: 'B', gender: 'Gents', awayOn: new Set(['2026-09-03']) },
      { singerId: 'c', name: 'C', gender: 'Gents', awayOn: new Set<string>() },
    ];
    const { awayPerDate, awayPerSinger } = boardTotals(rows, cols);
    expect(awayPerDate.get('2026-09-03')).toBe(2);
    expect(awayPerDate.get('2026-09-10')).toBe(1);
    expect(awayPerDate.get('2026-09-17')).toBe(0);
    expect(awayPerSinger.get('a')).toBe(2);
    expect(awayPerSinger.get('c')).toBe(0);
  });
});
