import { describe, it, expect } from 'vitest';
import {
  rosteredNotification,
  publishedNotification,
  shouldNotifyForSession,
  formatSessionDate,
  unavailableWhileRosteredNotification,
} from './notify';

describe('formatSessionDate', () => {
  it('writes the date the way the group reads it', () => {
    expect(formatSessionDate('2026-08-13')).toBe('Thursday 13 August');
  });

  it('does not shift the day across a timezone', () => {
    // Stored as a Melbourne calendar date; must not come out as the 12th.
    expect(formatSessionDate('2026-08-13')).toContain('13');
  });

  it('degrades to the raw value rather than throwing', () => {
    expect(formatSessionDate('nonsense')).toBe('nonsense');
  });
});

describe('rosteredNotification — the one that alerts', () => {
  const base = { sessionId: 's1', dateISO: '2026-08-13' };

  it('alerts, because the singer has to act on it', () => {
    expect(rosteredNotification({ ...base, bhajanTitles: ['Gajanana'] }).alert).toBe(true);
  });

  it('names the bhajan, so it is something you can go and practise', () => {
    const n = rosteredNotification({ ...base, bhajanTitles: ['Gajanana'] });
    expect(n.body).toContain('Gajanana');
    expect(n.body).toContain('Thursday 13 August');
  });

  it('counts them when there are several', () => {
    const n = rosteredNotification({ ...base, bhajanTitles: ['One', 'Two'] });
    expect(n.body).toContain('2 bhajans');
    expect(n.body).toContain('One, Two');
  });

  it('says so plainly when no bhajan has been chosen', () => {
    const n = rosteredNotification({ ...base, bhajanTitles: [] });
    expect(n.body).toContain('No bhajan chosen yet');
  });

  it('ignores blank titles rather than printing an empty one', () => {
    const n = rosteredNotification({ ...base, bhajanTitles: ['', '   '] });
    expect(n.body).toContain('No bhajan chosen yet');
  });

  it('opens the session when tapped', () => {
    expect(rosteredNotification({ ...base, bhajanTitles: [] }).url).toBe('/roster/s1');
  });
});

describe('publishedNotification — the quiet one', () => {
  const base = { sessionId: 's1', dateISO: '2026-08-13' };

  it('does NOT alert: it goes to everybody', () => {
    expect(publishedNotification({ ...base, singerCount: 3 }).alert).toBe(false);
  });

  it('says how many are on, without naming them', () => {
    const n = publishedNotification({ ...base, singerCount: 3 });
    expect(n.body).toContain('3 singers');
    expect(n.body).toContain('Thursday 13 August');
  });

  it('handles one singer without saying "1 singers"', () => {
    expect(publishedNotification({ ...base, singerCount: 1 }).body).toContain('1 singer ');
  });

  it('still reads sensibly with nobody rostered yet', () => {
    expect(publishedNotification({ ...base, singerCount: 0 }).body).toContain('has been set up');
  });

  it('uses a different tag from the rostered one, so neither replaces the other', () => {
    const a = rosteredNotification({ ...base, bhajanTitles: [] });
    const b = publishedNotification({ ...base, singerCount: 1 });
    expect(a.tag).not.toBe(b.tag);
  });
});

describe('shouldNotifyForSession', () => {
  it('notifies for a future session', () => {
    expect(shouldNotifyForSession('2026-08-20', '2026-08-11')).toBe(true);
  });

  it('notifies for today — a roster published on the morning still matters', () => {
    expect(shouldNotifyForSession('2026-08-11', '2026-08-11')).toBe(true);
  });

  it('NEVER notifies for a past session', () => {
    // Filling in last week's pitches is the common edit and must buzz nobody.
    expect(shouldNotifyForSession('2026-08-10', '2026-08-11')).toBe(false);
    expect(shouldNotifyForSession('2025-01-01', '2026-08-11')).toBe(false);
  });
});

describe('unavailableWhileRosteredNotification', () => {
  const input = { singerName: 'Rhuben', sessionId: 'sess-1', dateISO: '2026-08-27' };

  it('names the person and the night, and says what is needed', () => {
    const n = unavailableWhileRosteredNotification(input);
    expect(n.body).toContain('Rhuben');
    expect(n.body).toMatch(/27 August|August 27|Thursday/);
    expect(n.body).toMatch(/somebody else|someone else/i);
  });

  it('lands on the assign page, which is where the gap gets filled', () => {
    expect(unavailableWhileRosteredNotification(input).url).toBe('/roster/sess-1/assign');
  });

  it('is an alert, because a silent empty slot is worse than an obvious one', () => {
    expect(unavailableWhileRosteredNotification(input).alert).toBe(true);
  });

  it('does not let two people dropping out of one night collapse into one', () => {
    const a = unavailableWhileRosteredNotification(input);
    const b = unavailableWhileRosteredNotification({ ...input, singerName: 'Sriraag' });
    expect(a.tag).not.toBe(b.tag);
  });
})

