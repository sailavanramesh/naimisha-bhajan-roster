import { describe, it, expect } from 'vitest';
import {
  predictedDates,
  validateCycle,
  ownBlocks,
  forRoster,
  isBlockedOn,
  blockedIndex,
  MIN_CYCLE_DAYS,
  MAX_RANGE_DAYS,
  expandRange,
  MAX_CYCLE_DAYS,
  PREDICT_HORIZON_DAYS,
  type CycleInput,
} from './availability';

const CYCLE: CycleInput = { lastStart: '2026-08-03', cycleLengthDays: 28, durationDays: 4 };

describe('validateCycle', () => {
  it('accepts an ordinary cycle', () => {
    expect(validateCycle(CYCLE)).toEqual([]);
  });

  it('refuses lengths outside what a simple projection should guess at', () => {
    for (const days of [MIN_CYCLE_DAYS - 1, MAX_CYCLE_DAYS + 1, 0, -5, 3.5]) {
      const p = validateCycle({ ...CYCLE, cycleLengthDays: days });
      expect(p.map((x) => x.field), String(days)).toContain('cycleLengthDays');
    }
  });

  it('refuses a duration of zero or a fortnight', () => {
    expect(validateCycle({ ...CYCLE, durationDays: 0 })[0].field).toBe('durationDays');
    expect(validateCycle({ ...CYCLE, durationDays: 14 })[0].field).toBe('durationDays');
  });

  it('refuses a date that is not a date', () => {
    expect(validateCycle({ ...CYCLE, lastStart: '3rd August' })[0].field).toBe('lastStart');
  });
});

describe('predictedDates', () => {
  it('blocks the stated number of days from each cycle start', () => {
    const got = predictedDates(CYCLE, '2026-08-01', '2026-08-31');
    expect(got).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', // the given start
      '2026-08-31', // 28 days on
    ]);
  });

  it('carries on across months', () => {
    const got = predictedDates(CYCLE, '2026-08-31', '2026-09-30');
    expect(got.slice(0, 4)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']);
    expect(got).toContain('2026-09-28');
  });

  it('still blocks the rest of a period already under way when the window opens', () => {
    // Window opens on day 2 of the period. Days 2, 3 and 4 are still blocked.
    const got = predictedDates(CYCLE, '2026-08-04', '2026-08-10');
    expect(got).toEqual(['2026-08-04', '2026-08-05', '2026-08-06']);
  });

  it('does not project backwards before the date she gave', () => {
    // The past is a record, not arithmetic — an unexplained block on a date
    // that has already been rostered would be worse than nothing.
    const got = predictedDates(CYCLE, '2026-06-01', '2026-08-02');
    expect(got).toEqual([]);
  });

  it('stops at the horizon, however wide the window', () => {
    const got = predictedDates(CYCLE, '2026-08-01', '2028-08-01');
    const last = got[got.length - 1];
    const days = Math.round(
      (new Date(`${last}T12:00:00Z`).getTime() - new Date('2026-08-01T12:00:00Z').getTime()) / 86400000,
    );
    expect(days).toBeLessThanOrEqual(PREDICT_HORIZON_DAYS);
    expect(got.length).toBeGreaterThan(20);
  });

  it('predicts nothing from an invalid cycle rather than throwing', () => {
    expect(predictedDates({ ...CYCLE, cycleLengthDays: 0 }, '2026-08-01', '2026-12-01')).toEqual([]);
    expect(predictedDates({ ...CYCLE, lastStart: 'nonsense' }, '2026-08-01', '2026-12-01')).toEqual([]);
  });

  it('returns nothing for a backwards window', () => {
    expect(predictedDates(CYCLE, '2026-09-01', '2026-08-01')).toEqual([]);
  });

  it('is sorted and free of duplicates', () => {
    const got = predictedDates({ ...CYCLE, cycleLengthDays: 20, durationDays: 10 }, '2026-08-03', '2026-12-01');
    expect([...got].sort()).toEqual(got);
    expect(new Set(got).size).toBe(got.length);
  });
});

describe('what she sees versus what the rosterer sees', () => {
  const manual = [{ date: '2026-08-20', note: 'away for work' }];

  it('labels her own view, and lets a stated date beat a guess', () => {
    const blocks = ownBlocks({
      manual: [{ date: '2026-08-03', note: 'travelling' }],
      cycle: CYCLE,
      fromISO: '2026-08-01',
      toISODate: '2026-08-10',
    });
    const third = blocks.find((b) => b.date === '2026-08-03')!;
    expect(third.source).toBe('manual');
    expect(third.note).toBe('travelling');
    expect(blocks.find((b) => b.date === '2026-08-04')!.source).toBe('cycle');
  });

  it('THE PRIVACY RULE: the roster view carries dates and nothing else', () => {
    const blocks = ownBlocks({ manual, cycle: CYCLE, fromISO: '2026-08-01', toISODate: '2026-08-31' });
    const rosterView = forRoster('singer-1', blocks);

    for (const row of rosterView) {
      expect(Object.keys(row).sort()).toEqual(['date', 'singerId']);
    }
    // A predicted date and a stated one must be indistinguishable.
    const predicted = rosterView.find((r) => r.date === '2026-08-04')!;
    const stated = rosterView.find((r) => r.date === '2026-08-20')!;
    expect(Object.keys(predicted)).toEqual(Object.keys(stated));
    expect(JSON.stringify(predicted).replace('2026-08-04', 'D')).toBe(
      JSON.stringify(stated).replace('2026-08-20', 'D'),
    );
  });

  it('carries no note through to the roster, even when she wrote one', () => {
    const blocks = ownBlocks({ manual, cycle: null, fromISO: '2026-08-01', toISODate: '2026-08-31' });
    expect(blocks[0].note).toBe('away for work');
    expect(JSON.stringify(forRoster('singer-1', blocks))).not.toContain('away for work');
  });

  it('answers the only question a rosterer asks', () => {
    const blocks = forRoster(
      'singer-1',
      ownBlocks({ manual, cycle: CYCLE, fromISO: '2026-08-01', toISODate: '2026-08-31' }),
    );
    expect(isBlockedOn(blocks, 'singer-1', '2026-08-20')).toBe(true);
    expect(isBlockedOn(blocks, 'singer-1', '2026-08-04')).toBe(true);
    expect(isBlockedOn(blocks, 'singer-1', '2026-08-12')).toBe(false);
    expect(isBlockedOn(blocks, 'singer-2', '2026-08-20')).toBe(false);
  });

  it('indexes a whole page in one pass', () => {
    const a = forRoster('a', ownBlocks({ manual, cycle: null, fromISO: '2026-08-01', toISODate: '2026-08-31' }));
    const b = forRoster('b', ownBlocks({ manual: [{ date: '2026-08-21' }], cycle: null, fromISO: '2026-08-01', toISODate: '2026-08-31' }));
    const index = blockedIndex([...a, ...b]);
    expect(index.get('a')!.has('2026-08-20')).toBe(true);
    expect(index.get('b')!.has('2026-08-21')).toBe(true);
    expect(index.get('a')!.has('2026-08-21')).toBe(false);
    expect(index.get('c')).toBeUndefined();
  });
});

describe('blocking a range of dates', () => {
  it('includes both ends', () => {
    const r = expandRange('2026-09-01', '2026-09-04');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  });

  it('handles a single day', () => {
    const r = expandRange('2026-09-01', '2026-09-01');
    if (r.ok) expect(r.dates).toEqual(['2026-09-01']);
  });

  it('crosses a month and a year end', () => {
    const a = expandRange('2026-08-30', '2026-09-02');
    if (a.ok) expect(a.dates).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    const b = expandRange('2026-12-31', '2027-01-02');
    if (b.ok) expect(b.dates).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('refuses a backwards range rather than silently swapping it', () => {
    const r = expandRange('2026-09-10', '2026-09-01');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/before/);
  });

  it('refuses an over-long span rather than truncating it', () => {
    // Truncating would have somebody believe they were marked away for dates
    // that were quietly dropped.
    const r = expandRange('2026-01-01', '2026-12-31');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(String(MAX_RANGE_DAYS));
  });

  it('accepts exactly the maximum', () => {
    const end = new Date(Date.UTC(2026, 8, 1) + (MAX_RANGE_DAYS - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
    const r = expandRange('2026-09-01', end);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dates).toHaveLength(MAX_RANGE_DAYS);
  });
});
