import { describe, it, expect } from 'vitest';
import { nextThursday, nextWeekday, THURSDAY } from './dates';

describe('nextThursday', () => {
  // 2026-08-10 is a Monday. The week that follows it:
  //   Mon 10, Tue 11, Wed 12, Thu 13, Fri 14, Sat 15, Sun 16, Mon 17
  it('finds the Thursday later this week', () => {
    expect(nextThursday('2026-08-10')).toBe('2026-08-13'); // Mon -> Thu
    expect(nextThursday('2026-08-11')).toBe('2026-08-13'); // Tue -> Thu
    expect(nextThursday('2026-08-12')).toBe('2026-08-13'); // Wed -> Thu
  });

  it('returns TODAY when today is already Thursday, not next week', () => {
    expect(nextThursday('2026-08-13')).toBe('2026-08-13');
  });

  it('rolls into next week from Friday onwards', () => {
    expect(nextThursday('2026-08-14')).toBe('2026-08-20'); // Fri
    expect(nextThursday('2026-08-15')).toBe('2026-08-20'); // Sat
    expect(nextThursday('2026-08-16')).toBe('2026-08-20'); // Sun
  });

  it('crosses a month boundary', () => {
    expect(nextThursday('2026-08-28')).toBe('2026-09-03');
  });

  it('crosses a year boundary', () => {
    // Thu 30 Dec 2027, so Fri 31 Dec rolls into the new year.
    expect(nextThursday('2027-12-31')).toBe('2028-01-06');
  });

  it('returns a New Year\'s Eve that is itself a Thursday', () => {
    expect(nextThursday('2026-12-31')).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(nextThursday('2028-02-28')).toBe('2028-03-02'); // Mon 28 Feb 2028
  });

  it('always lands on a Thursday, for every day of a year', () => {
    const d = new Date('2026-01-01T12:00:00.000Z');
    for (let i = 0; i < 365; i++) {
      const iso = d.toISOString().slice(0, 10);
      const result = nextThursday(iso);
      expect(new Date(`${result}T12:00:00.000Z`).getUTCDay(), `${iso} -> ${result}`).toBe(THURSDAY);
      // and never more than 6 days away
      const gap = (Date.parse(`${result}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86400000;
      expect(gap, `${iso} -> ${result}`).toBeGreaterThanOrEqual(0);
      expect(gap, `${iso} -> ${result}`).toBeLessThanOrEqual(6);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  });

  it('degrades to the input rather than throwing on rubbish', () => {
    expect(nextThursday('not a date')).toBe('not a date');
    expect(nextThursday('')).toBe('');
  });

  it('works for other weekdays too', () => {
    expect(nextWeekday('2026-08-10', 0)).toBe('2026-08-16'); // Mon -> Sun
    expect(nextWeekday('2026-08-10', 1)).toBe('2026-08-10'); // Mon -> Mon (today)
  });
});
