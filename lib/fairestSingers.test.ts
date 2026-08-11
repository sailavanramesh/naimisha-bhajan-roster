import { describe, it, expect } from 'vitest';
import { fairestSingers, DEFAULT_WEIGHTS, type SingerContext } from './rosterScoring';
import { Gender } from '@prisma/client';

const singer = (
  id: string,
  gender: Gender | null,
  over: Partial<SingerContext> = {},
): SingerContext => ({
  id,
  name: id,
  gender,
  repertoireBhajanIds: new Set(),
  sungBhajanIds: new Set(),
  daysSinceLastSang: 30,
  recentCount: 3,
  daysSinceBhajan: new Map(),
  offsetMedian: 0,
  offsetSamples: 10,
  comfortCentre: 0,
  available: true,
  ...over,
});

describe('fairestSingers', () => {
  it('returns the requested number', () => {
    const pool = ['a', 'b', 'c', 'd'].map((id) => singer(id, Gender.Gents));
    expect(fairestSingers(pool, { count: 3 })).toHaveLength(3);
  });

  it('never returns the same person twice', () => {
    const pool = ['a', 'b', 'c'].map((id) => singer(id, Gender.Gents));
    const ids = fairestSingers(pool, { count: 3 }).map((c) => c.singer.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('prefers whoever has waited longest', () => {
    const pool = [
      singer('recent', Gender.Gents, { daysSinceLastSang: 2 }),
      singer('waiting', Gender.Gents, { daysSinceLastSang: 200 }),
    ];
    expect(fairestSingers(pool, { count: 1 })[0].singer.id).toBe('waiting');
  });

  it('prefers whoever has sung least, at equal waiting time', () => {
    const pool = [
      singer('busy', Gender.Gents, { recentCount: 12 }),
      singer('quiet', Gender.Gents, { recentCount: 0 }),
    ];
    expect(fairestSingers(pool, { count: 1 })[0].singer.id).toBe('quiet');
  });

  it('treats somebody who has never sung as maximally overdue', () => {
    const pool = [
      singer('some', Gender.Gents, { daysSinceLastSang: 100 }),
      singer('never', Gender.Gents, { daysSinceLastSang: null, recentCount: 0 }),
    ];
    const first = fairestSingers(pool, { count: 1 })[0];
    expect(first.singer.id).toBe('never');
    expect(first.reasons).toContain('never sung here');
  });

  it('alternates voice rather than handing three slots to one side', () => {
    // Six identical singers, three of each voice. A run of three same-voice
    // must not happen.
    const pool = [
      ...['g1', 'g2', 'g3'].map((id) => singer(id, Gender.Gents)),
      ...['l1', 'l2', 'l3'].map((id) => singer(id, Gender.Ladies)),
    ];
    const picked = fairestSingers(pool, { count: 3 });
    const voices = picked.map((c) => c.singer.gender);
    expect(new Set(voices).size).toBeGreaterThan(1);
  });

  it('honours who is already on the session', () => {
    const pool = ['a', 'b', 'c'].map((id) => singer(id, Gender.Gents));
    const picked = fairestSingers(pool, { count: 3, exclude: new Set(['a']) });
    expect(picked.map((c) => c.singer.id)).not.toContain('a');
    expect(picked).toHaveLength(2);
  });

  it('skips anybody unavailable', () => {
    const pool = [
      singer('away', Gender.Gents, { available: false, daysSinceLastSang: 500 }),
      singer('here', Gender.Gents),
    ];
    expect(fairestSingers(pool, { count: 2 }).map((c) => c.singer.id)).toEqual(['here']);
  });

  it('skips anybody with no recorded voice — they are not a singer', () => {
    const pool = [singer('novoice', null, { daysSinceLastSang: 500 }), singer('ok', Gender.Ladies)];
    expect(fairestSingers(pool, { count: 2 }).map((c) => c.singer.id)).toEqual(['ok']);
  });

  it('returns fewer than asked rather than padding, when the pool is small', () => {
    expect(fairestSingers([singer('only', Gender.Gents)], { count: 3 })).toHaveLength(1);
  });

  it('returns nothing for an empty pool or a zero count', () => {
    expect(fairestSingers([], { count: 3 })).toEqual([]);
    expect(fairestSingers([singer('a', Gender.Gents)], { count: 0 })).toEqual([]);
  });

  it('gives a reason for every pick, so the choice can be argued with', () => {
    const pool = [singer('a', Gender.Gents, { daysSinceLastSang: 300, recentCount: 0 })];
    expect(fairestSingers(pool, { count: 1 })[0].reasons.length).toBeGreaterThan(0);
  });

  it('respects a zeroed fairness weight', () => {
    // With overdue switched off, the long-waiting singer loses its advantage.
    const pool = [
      singer('waiting', Gender.Gents, { daysSinceLastSang: 300, recentCount: 9 }),
      singer('quiet', Gender.Gents, { daysSinceLastSang: 1, recentCount: 0 }),
    ];
    const weights = { ...DEFAULT_WEIGHTS, overdue: 0 };
    expect(fairestSingers(pool, { count: 1, weights })[0].singer.id).toBe('quiet');
  });
});
