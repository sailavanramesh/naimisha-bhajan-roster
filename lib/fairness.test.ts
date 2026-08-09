import { describe, it, expect } from 'vitest';
import {
  summariseLoad,
  stalenessBucket,
  staleKnownBhajans,
  countBy,
  LOAD_TOLERANCE,
  type SingerLoad,
  type BhajanStaleness,
} from './fairness';

const load = (name: string, count: number): SingerLoad => ({ name, singerId: name, count });

describe('summariseLoad', () => {
  it('computes the group mean', () => {
    const { mean, total } = summariseLoad([load('a', 10), load('b', 20)]);
    expect(total).toBe(30);
    expect(mean).toBe(15);
  });

  it('flags the real Prasanna/Triveni gap', () => {
    // The actual numbers from SPEC §4.E, with the rest of the group around them.
    const { singers } = summariseLoad([
      load('Prasanna', 67),
      load('Triveni', 16),
      load('Sailavan', 40),
      load('Ashwin', 38),
    ]);
    const by = new Map(singers.map((s) => [s.name, s]));
    expect(by.get('Triveni')!.verdict).toBe('under');
    expect(by.get('Prasanna')!.verdict).toBe('over');
    expect(by.get('Sailavan')!.verdict).toBe('balanced');
  });

  it('sorts least-used first, so the under-used are impossible to miss', () => {
    const { singers } = summariseLoad([load('a', 30), load('b', 5), load('c', 15)]);
    expect(singers.map((s) => s.name)).toEqual(['b', 'c', 'a']);
  });

  it('respects the tolerance band exactly', () => {
    const { singers } = summariseLoad([
      load('low', 100 * (1 - LOAD_TOLERANCE)),
      load('high', 100 * (1 + LOAD_TOLERANCE)),
    ]);
    // Both sit exactly on the boundary of a mean of 100, so neither is flagged.
    expect(singers.every((s) => s.verdict === 'balanced')).toBe(true);
  });

  it('says how many slots would bring someone to the mean', () => {
    const { singers } = summariseLoad([load('a', 10), load('b', 20)]);
    const a = singers.find((s) => s.name === 'a')!;
    expect(a.deltaToMean).toBe(5);
  });

  it('handles an empty group and an all-zero group', () => {
    expect(summariseLoad([]).mean).toBe(0);
    const zero = summariseLoad([load('a', 0), load('b', 0)]);
    expect(zero.singers.every((s) => s.verdict === 'balanced')).toBe(true);
  });
});

describe('staleness', () => {
  const b = (over: Partial<BhajanStaleness> = {}): BhajanStaleness => ({
    bhajanId: 'x',
    title: 'A bhajan',
    timesSung: 3,
    lastSungDaysAgo: 30,
    ...over,
  });

  it('buckets by how long ago', () => {
    expect(stalenessBucket(b({ lastSungDaysAgo: null }))).toBe('never');
    expect(stalenessBucket(b({ lastSungDaysAgo: 400 }))).toBe('over-a-year');
    expect(stalenessBucket(b({ lastSungDaysAgo: 200 }))).toBe('six-to-twelve');
    expect(stalenessBucket(b({ lastSungDaysAgo: 10 }))).toBe('recent');
  });

  it('treats never-sung as its own thing, not as stale', () => {
    const stale = staleKnownBhajans([b({ timesSung: 0, lastSungDaysAgo: null })]);
    expect(stale).toHaveLength(0);
  });

  it('lists only bhajans the group knows but has let lapse', () => {
    const stale = staleKnownBhajans([
      b({ bhajanId: '1', timesSung: 5, lastSungDaysAgo: 500 }),
      b({ bhajanId: '2', timesSung: 5, lastSungDaysAgo: 100 }),
      b({ bhajanId: '3', timesSung: 0, lastSungDaysAgo: null }),
    ]);
    expect(stale.map((x) => x.bhajanId)).toEqual(['1']);
  });

  it('sorts the longest-lapsed first', () => {
    const stale = staleKnownBhajans([
      b({ bhajanId: 'a', lastSungDaysAgo: 400 }),
      b({ bhajanId: 'b', lastSungDaysAgo: 900 }),
    ]);
    expect(stale.map((x) => x.bhajanId)).toEqual(['b', 'a']);
  });
});

describe('countBy', () => {
  it('counts multi-valued keys and sorts most-first', () => {
    const rows = [{ d: ['Sai', 'Guru'] }, { d: ['Sai'] }, { d: ['Krishna'] }];
    expect(countBy(rows, (r) => r.d)).toEqual([
      { name: 'Sai', count: 2 },
      { name: 'Guru', count: 1 },
      { name: 'Krishna', count: 1 },
    ]);
  });

  it('ignores blanks', () => {
    expect(countBy([{ d: ['', 'Sai'] }], (r) => r.d)).toEqual([{ name: 'Sai', count: 1 }]);
  });

  it('is stable by name when counts tie', () => {
    const out = countBy([{ d: ['b'] }, { d: ['a'] }], (r) => r.d);
    expect(out.map((x) => x.name)).toEqual(['a', 'b']);
  });
});
