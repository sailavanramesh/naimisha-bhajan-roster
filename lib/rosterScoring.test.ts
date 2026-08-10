import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  OVERDUE_SATURATION_DAYS,
  VARIETY_WINDOW_DAYS,
  referenceSaFor,
  pitchFit,
  repertoireScore,
  overdueScore,
  loadBalanceScore,
  varietyScore,
  genderClumpPenalty,
  scorePair,
  assignRoster,
  type SingerContext,
  type SlotContext,
} from './rosterScoring';

function singer(over: Partial<SingerContext> = {}): SingerContext {
  return {
    id: over.id ?? 's1',
    name: 'Singer',
    gender: 'Gents',
    repertoireBhajanIds: new Set(),
    sungBhajanIds: new Set(),
    daysSinceLastSang: 30,
    recentCount: 5,
    daysSinceBhajan: new Map(),
    offsetMedian: 0,
    offsetSamples: 20,
    comfortCentre: 0,
    available: true,
    ...over,
  };
}

function slot(over: Partial<SlotContext> = {}): SlotContext {
  return {
    position: 1,
    bhajanId: 'b1',
    bhajanTitle: 'A bhajan',
    raga: 'Kalyani / Yaman',
    referenceSaGents: 0,
    referenceSaLadies: 7,
    ...over,
  };
}

const ctx = (over: Partial<Parameters<typeof scorePair>[2]> = {}) => ({
  groupMean: 5,
  previousGenders: [] as ('Gents' | 'Ladies' | null)[],
  ...over,
});

describe('repertoireScore', () => {
  it('scores highest for a bhajan they have sung', () => {
    expect(repertoireScore(singer({ sungBhajanIds: new Set(['b1']) }), slot())).toBe(1);
  });

  it('scores high for one on their list', () => {
    expect(repertoireScore(singer({ repertoireBhajanIds: new Set(['b1']) }), slot())).toBe(0.8);
  });

  it('scores zero for an unknown bhajan — but does NOT exclude them (SPEC 9.3)', () => {
    expect(repertoireScore(singer(), slot())).toBe(0);
  });

  it('is neutral when the slot has no resolved bhajan', () => {
    expect(repertoireScore(singer(), slot({ bhajanId: null }))).toBe(0.5);
  });
});

describe('overdueScore', () => {
  it('is maximal for someone never rostered', () => {
    expect(overdueScore(singer({ daysSinceLastSang: null }))).toBe(1);
  });

  it('rises with time and saturates', () => {
    expect(overdueScore(singer({ daysSinceLastSang: 0 }))).toBe(0);
    expect(overdueScore(singer({ daysSinceLastSang: OVERDUE_SATURATION_DAYS }))).toBe(1);
    expect(overdueScore(singer({ daysSinceLastSang: OVERDUE_SATURATION_DAYS * 5 }))).toBe(1);
  });
});

describe('loadBalanceScore', () => {
  it('favours the under-used singer', () => {
    expect(loadBalanceScore(singer({ recentCount: 0 }), 10)).toBe(1);
    expect(loadBalanceScore(singer({ recentCount: 10 }), 10)).toBe(0.5);
    expect(loadBalanceScore(singer({ recentCount: 20 }), 10)).toBe(0);
  });

  it('is neutral when nobody has sung', () => {
    expect(loadBalanceScore(singer(), 0)).toBe(0.5);
  });

  it('would separate Prasanna (67 slots) from Triveni (16)', () => {
    const mean = 42;
    expect(loadBalanceScore(singer({ recentCount: 16 }), mean))
      .toBeGreaterThan(loadBalanceScore(singer({ recentCount: 67 }), mean));
  });
});

describe('varietyScore', () => {
  it('is maximal for a bhajan they have never sung', () => {
    expect(varietyScore(singer(), slot())).toBe(1);
  });

  it('penalises a recent repeat and recovers over the window', () => {
    const recent = singer({ daysSinceBhajan: new Map([['b1', 0]]) });
    const old = singer({ daysSinceBhajan: new Map([['b1', VARIETY_WINDOW_DAYS]]) });
    expect(varietyScore(recent, slot())).toBe(0);
    expect(varietyScore(old, slot())).toBe(1);
  });
});

describe('genderClumpPenalty', () => {
  it('does not fire for a run of two', () => {
    expect(genderClumpPenalty(singer({ gender: 'Gents' }), ['Gents'])).toBe(0);
  });

  it('fires when it would make three in a row', () => {
    expect(genderClumpPenalty(singer({ gender: 'Gents' }), ['Gents', 'Gents'])).toBe(1);
  });

  it('resets when the run is broken', () => {
    expect(genderClumpPenalty(singer({ gender: 'Gents' }), ['Gents', 'Ladies'])).toBe(0);
  });

  it('is silent when gender is unknown', () => {
    expect(genderClumpPenalty(singer({ gender: null }), ['Gents', 'Gents'])).toBe(0);
  });
});

describe('pitchFit', () => {
  it('uses the reference for the singer’s own gender', () => {
    expect(referenceSaFor(singer({ gender: 'Ladies' }), slot())).toBe(7);
    expect(referenceSaFor(singer({ gender: 'Gents' }), slot())).toBe(0);
  });

  it('is best when the predicted pitch lands on their comfort centre', () => {
    const s = singer({ offsetMedian: 0, comfortCentre: 0 });
    expect(pitchFit(s, slot({ referenceSaGents: 0 }))).toBe(1);
  });

  it('falls off with distance', () => {
    const near = singer({ offsetMedian: 1, comfortCentre: 0 });
    const far = singer({ offsetMedian: 5, comfortCentre: 0 });
    expect(pitchFit(near, slot())).toBeGreaterThan(pitchFit(far, slot()));
  });

  it('is neutral, not punitive, when there is no data', () => {
    expect(pitchFit(singer({ comfortCentre: null }), slot())).toBe(0.5);
    expect(pitchFit(singer(), slot({ referenceSaGents: null }))).toBe(0.5);
  });

  it('handles the octave wrap', () => {
    // Reference B (11) + 1 = C (0); comfort centre C. Adjacent, so a good fit.
    const s = singer({ offsetMedian: 1, comfortCentre: 0 });
    expect(pitchFit(s, slot({ referenceSaGents: 11 }))).toBe(1);
  });
});

describe('scorePair', () => {
  it('gives every pair a reason', () => {
    const r = scorePair(singer(), slot(), ctx());
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('prefers an overdue, under-used singer over a busy recent one', () => {
    const overdue = singer({ id: 'a', daysSinceLastSang: 200, recentCount: 1 });
    const busy = singer({ id: 'b', daysSinceLastSang: 2, recentCount: 20 });
    expect(scorePair(overdue, slot(), ctx()).score).toBeGreaterThan(
      scorePair(busy, slot(), ctx()).score,
    );
  });

  it('respects custom weights', () => {
    const knows = singer({ sungBhajanIds: new Set(['b1']) });
    const base = scorePair(knows, slot(), ctx()).score;
    const heavy = scorePair(knows, slot(), ctx({
      weights: { ...DEFAULT_WEIGHTS, repertoire: 10 },
    })).score;
    expect(heavy).toBeGreaterThan(base);
  });
});

describe('assignRoster', () => {
  const slots = [slot({ position: 1 }), slot({ position: 2, bhajanId: 'b2' }), slot({ position: 3, bhajanId: 'b3' })];

  const roster = () => [
    singer({ id: 'a', name: 'Ashwin', gender: 'Gents', recentCount: 20, daysSinceLastSang: 3 }),
    singer({ id: 'b', name: 'Triveni', gender: 'Ladies', recentCount: 2, daysSinceLastSang: 200 }),
    singer({ id: 'c', name: 'Rhuben', gender: 'Gents', recentCount: 5, daysSinceLastSang: 60 }),
    singer({ id: 'd', name: 'Anvita', gender: 'Ladies', recentCount: 8, daysSinceLastSang: 20 }),
  ];

  it('fills every slot', () => {
    const r = assignRoster(roster(), slots);
    expect(r.assignments).toHaveLength(3);
    expect(r.assignments.every((a) => a.singer !== null)).toBe(true);
  });

  it('does not use one singer twice when there are enough people', () => {
    const ids = assignRoster(roster(), slots).assignments.map((a) => a.singer!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excludes unavailable singers and says so', () => {
    const people = roster().map((s) => (s.id === 'b' ? { ...s, available: false } : s));
    const r = assignRoster(people, slots);
    expect(r.assignments.every((a) => a.singer?.id !== 'b')).toBe(true);
    expect(r.warnings.join(' ')).toContain('Triveni');
  });

  it('gives the most overdue, least-used singer a slot', () => {
    const r = assignRoster(roster(), slots);
    expect(r.assignments.some((a) => a.singer?.name === 'Triveni')).toBe(true);
  });

  it('NEVER moves a pinned assignment', () => {
    const pins = new Map([[2, 'a']]);
    const r = assignRoster(roster(), slots, { pins });
    const pinned = r.assignments.find((a) => a.position === 2)!;
    expect(pinned.singer!.id).toBe('a');
    expect(pinned.pinned).toBe(true);
    expect(pinned.reasons).toContain('Pinned by you');
  });

  it('keeps a pinned singer even when unavailable, and warns', () => {
    const people = roster().map((s) => (s.id === 'a' ? { ...s, available: false } : s));
    const r = assignRoster(people, slots, { pins: new Map([[1, 'a']]) });
    expect(r.assignments[0].singer!.id).toBe('a');
    expect(r.warnings.join(' ')).toContain('unavailable');
  });

  it('warns and doubles up when there are fewer singers than slots', () => {
    const two = roster().slice(0, 2);
    const r = assignRoster(two, slots);
    expect(r.warnings.join(' ')).toContain('somebody sings twice');
    expect(r.assignments.every((a) => a.singer !== null)).toBe(true);
  });

  it('handles nobody being available without throwing', () => {
    const none = roster().map((s) => ({ ...s, available: false }));
    const r = assignRoster(none, slots);
    expect(r.assignments.every((a) => a.singer === null)).toBe(true);
    expect(r.warnings.join(' ')).toContain('No singers are available');
  });

  it('avoids three consecutive singers of the same voice when it can', () => {
    const people = [
      singer({ id: 'g1', name: 'G1', gender: 'Gents' }),
      singer({ id: 'g2', name: 'G2', gender: 'Gents' }),
      singer({ id: 'g3', name: 'G3', gender: 'Gents' }),
      singer({ id: 'l1', name: 'L1', gender: 'Ladies' }),
    ];
    const r = assignRoster(people, slots);
    const g = r.assignments.map((a) => a.singer!.gender);
    expect(g.every((x, i) => !(i >= 2 && x === g[i - 1] && x === g[i - 2]))).toBe(true);
  });

  it('gives every filled slot an explanation', () => {
    for (const a of assignRoster(roster(), slots).assignments) {
      expect(a.reasons.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    const a = assignRoster(roster(), slots).assignments.map((x) => x.singer!.id);
    const b = assignRoster(roster(), slots).assignments.map((x) => x.singer!.id);
    expect(a).toEqual(b);
  });
});
