import { describe, it, expect } from 'vitest';
import { nextThursday, nextWeekday, THURSDAY, historyCutoff, melbourneTodayISO } from './dates';

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

describe('historyCutoff', () => {
  it('is midnight UTC of the Melbourne date, so it lines up with stored session dates', () => {
    // Session dates are stored at UTC midnight of the Melbourne calendar day.
    const at = new Date('2026-08-11T04:00:00.000Z'); // 2pm Melbourne
    expect(historyCutoff(at).toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('uses the MELBOURNE day, not the UTC one', () => {
    // 11 Aug 22:00 UTC is already 12 Aug in Melbourne (UTC+10).
    const at = new Date('2026-08-11T22:00:00.000Z');
    expect(melbourneTodayISO(at)).toBe('2026-08-12');
    expect(historyCutoff(at).toISOString().slice(0, 10)).toBe('2026-08-12');
  });

  it("counts today's session as history, and tomorrow's not", () => {
    const now = new Date('2026-08-11T04:00:00.000Z');
    const cutoff = historyCutoff(now);
    const todaysSession = new Date('2026-08-11T00:00:00.000Z');
    const tomorrowsSession = new Date('2026-08-12T00:00:00.000Z');
    expect(todaysSession <= cutoff).toBe(true);
    expect(tomorrowsSession <= cutoff).toBe(false);
  });

  it('still counts today all day, whatever the hour in Melbourne', () => {
    for (const hour of ['14:00', '22:00', '02:00']) {
      // 11 Aug in Melbourne spans 10 Aug 14:00 UTC to 11 Aug 14:00 UTC.
      const at = new Date(`2026-08-10T${hour}:00.000Z`);
      const cutoff = historyCutoff(at);
      const sameDay = new Date(`${melbourneTodayISO(at)}T00:00:00.000Z`);
      expect(sameDay <= cutoff).toBe(true);
    }
  });
});
