import { describe, it, expect } from 'vitest';
import {
  makeRng,
  weightedPick,
  candidateWeight,
  matchesDeity,
  matchesTempo,
  tempoRank,
  resolvePosition,
  ruleForSlot,
  generateSession,
  DEFAULT_LENGTH,
  type Candidate,
  type TemplateSpec,
} from './sessionBuilder';

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: over.id ?? `c${Math.abs(hash(JSON.stringify(over)))}`,
    title: 'A bhajan',
    deities: ['Sai'],
    raga: null,
    language: 'Sanskrit / Hindi',
    tempo: 'Medium',
    level: null,
    beat: null,
    hasLyrics: true,
    hasAudio: false,
    hasReference: true,
    timesSung: 0,
    lastSungDaysAgo: null,
    ...over,
  };
}
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** A pool big enough that diversity constraints have room to work. */
function pool(n: number, over: (i: number) => Partial<Candidate> = () => ({})): Candidate[] {
  return Array.from({ length: n }, (_, i) =>
    candidate({
      id: `b${i}`,
      title: `Bhajan ${i}`,
      raga: `Raga ${i}`,
      deities: [['Sai', 'Krishna', 'Shiva', 'Rama', 'Devi', 'Ganesha'][i % 6]],
      language: i % 3 === 0 ? 'English' : 'Sanskrit / Hindi',
      ...over(i),
    }),
  );
}

const STANDARD: TemplateSpec = {
  name: 'Standard',
  defaultLength: 3,
  rules: [
    { position: 1, strength: 'soft', deity: 'Ganesha', tempoIn: ['Slow', 'Medium Slow', 'Medium'] },
    { position: -1, strength: 'soft', deity: 'Sai' },
  ],
};

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng('abc');
    const b = makeRng('abc');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs between seeds', () => {
    expect(makeRng('abc')()).not.toBe(makeRng('abd')());
  });

  it('stays in [0, 1)', () => {
    const r = makeRng('seed');
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('weightedPick', () => {
  it('returns -1 for an empty pool', () => {
    expect(weightedPick([], makeRng('x'))).toBe(-1);
  });

  it('never picks a zero-weight entry when others are positive', () => {
    const rng = makeRng('x');
    for (let i = 0; i < 200; i++) {
      expect(weightedPick([0, 5, 0], rng)).toBe(1);
    }
  });

  it('favours the heavier entry', () => {
    const rng = makeRng('bias');
    let heavy = 0;
    for (let i = 0; i < 1000; i++) if (weightedPick([1, 9], rng) === 1) heavy++;
    expect(heavy).toBeGreaterThan(800);
  });

  it('falls back to uniform when all weights are zero', () => {
    expect(weightedPick([0, 0, 0], makeRng('x'))).toBeGreaterThanOrEqual(0);
  });
});

describe('candidateWeight', () => {
  it('favours a bhajan never sung over one sung yesterday', () => {
    const fresh = candidateWeight(candidate({ lastSungDaysAgo: null }), 90);
    const stale = candidateWeight(candidate({ lastSungDaysAgo: 1 }), 90);
    expect(fresh).toBeGreaterThan(stale);
  });

  it('never drops a recently sung bhajan to zero — the window is advisory', () => {
    expect(candidateWeight(candidate({ lastSungDaysAgo: 0 }), 90)).toBeGreaterThan(0);
  });

  it('favours a less-sung bhajan', () => {
    expect(candidateWeight(candidate({ timesSung: 0 }), 90))
      .toBeGreaterThan(candidateWeight(candidate({ timesSung: 10 }), 90));
  });

  it('mildly favours completeness', () => {
    const complete = candidateWeight(candidate({ hasLyrics: true, hasAudio: true, hasReference: true }), 90);
    const bare = candidateWeight(candidate({ hasLyrics: false, hasAudio: false, hasReference: false }), 90);
    expect(complete).toBeGreaterThan(bare);
    expect(complete / bare).toBeLessThan(2); // "mildly"
  });
});

describe('matching helpers', () => {
  it('matchesDeity is case-insensitive and true when unconstrained', () => {
    expect(matchesDeity(candidate({ deities: ['Ganesha'] }), 'ganesha')).toBe(true);
    expect(matchesDeity(candidate({ deities: [] }), null)).toBe(true);
    expect(matchesDeity(candidate({ deities: ['Sai'] }), 'Ganesha')).toBe(false);
  });

  it('matchesTempo is true when unconstrained but false for an unknown tempo', () => {
    expect(matchesTempo(candidate({ tempo: null }), undefined)).toBe(true);
    expect(matchesTempo(candidate({ tempo: null }), ['Medium'])).toBe(false);
    expect(matchesTempo(candidate({ tempo: 'Medium' }), ['Slow', 'Medium'])).toBe(true);
  });

  it('tempoRank orders the arc and shrugs at unknown values', () => {
    expect(tempoRank('Slow')).toBeLessThan(tempoRank('Medium')!);
    expect(tempoRank('Medium')).toBeLessThan(tempoRank('Fast')!);
    expect(tempoRank(null)).toBeNull();
    expect(tempoRank('Medium, Slow')).toBeNull();
  });
});

describe('resolvePosition / ruleForSlot', () => {
  it('counts negative positions from the end', () => {
    expect(resolvePosition(-1, 3)).toBe(3);
    expect(resolvePosition(-2, 5)).toBe(4);
    expect(resolvePosition(1, 3)).toBe(1);
  });

  it('finds the closer rule at the last slot for any length', () => {
    expect(ruleForSlot(STANDARD, 3, 3)?.deity).toBe('Sai');
    expect(ruleForSlot(STANDARD, 10, 10)?.deity).toBe('Sai');
    expect(ruleForSlot(STANDARD, 1, 10)?.deity).toBe('Ganesha');
  });
});

describe('generateSession', () => {
  it('produces the requested number of slots', () => {
    const r = generateSession(pool(60), STANDARD, { seed: 's1', length: DEFAULT_LENGTH });
    expect(r.slots).toHaveLength(3);
  });

  it('is reproducible for the same seed and pool', () => {
    const a = generateSession(pool(60), STANDARD, { seed: 'same', length: 3 });
    const b = generateSession(pool(60), STANDARD, { seed: 'same', length: 3 });
    expect(a.slots.map((s) => s.candidate.id)).toEqual(b.slots.map((s) => s.candidate.id));
  });

  it('gives a different set for a different seed', () => {
    const a = generateSession(pool(60), STANDARD, { seed: 'one', length: 3 });
    const b = generateSession(pool(60), STANDARD, { seed: 'two', length: 3 });
    expect(a.slots.map((s) => s.candidate.id)).not.toEqual(b.slots.map((s) => s.candidate.id));
  });

  it('never repeats a bhajan', () => {
    const r = generateSession(pool(60), STANDARD, { seed: 'x', length: 6 });
    const ids = r.slots.map((s) => s.candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never repeats a raga unless it had to relax', () => {
    const r = generateSession(pool(60), STANDARD, { seed: 'x', length: 5 });
    const ragas = r.slots.filter((s) => !s.relaxed.includes('no repeated raga')).map((s) => s.candidate.raga);
    expect(new Set(ragas).size).toBe(ragas.length);
  });

  it('STILL GENERATES when no Ganesha bhajan exists — the opener is a habit, not a rule', () => {
    const noGanesha = pool(40, () => ({ deities: ['Sai'] }));
    const r = generateSession(noGanesha, STANDARD, { seed: 'x', length: 3 });
    expect(r.slots).toHaveLength(3);
    // A soft rule must never appear as a relaxation: it never filtered.
    expect(r.slots.flatMap((s) => s.relaxed)).not.toContain('slot deity rule');
  });

  it('prefers a Ganesha opener when one is available', () => {
    // Across many seeds the opener should be Ganesha far more often than the
    // 1-in-6 the pool composition would give by chance.
    let ganesha = 0;
    for (let i = 0; i < 60; i++) {
      const r = generateSession(pool(60), STANDARD, { seed: `seed-${i}`, length: 3 });
      if (r.slots[0]?.candidate.deities.includes('Ganesha')) ganesha++;
    }
    expect(ganesha).toBeGreaterThan(30);
  });

  /**
   * REGRESSION. The synthetic pool above is 1-in-6 Ganesha and evenly sung,
   * which hid two failures that only appeared against the real masterlist:
   * 240 of 3,607 bhajans are Ganesha (about 7%), and roughly 3,000 have never
   * been sung. A weight multiplier for the soft rule lost to sheer numbers, and
   * a linear novelty term made every generated session three songs nobody knew.
   */
  describe('against realistic pool proportions', () => {
    const realistic = (): Candidate[] =>
      Array.from({ length: 1200 }, (_, i) =>
        candidate({
          id: `r${i}`,
          title: `Bhajan ${i}`,
          raga: `Raga ${i % 400}`,
          // ~7% Ganesha, as in the masterlist.
          deities: [i % 14 === 0 ? 'Ganesha' : ['Sai', 'Krishna', 'Shiva', 'Rama', 'Devi'][i % 5]],
          // ~1 in 6 has ever been sung, as in the masterlist.
          timesSung: i % 6 === 0 ? 1 + (i % 9) : 0,
          lastSungDaysAgo: i % 6 === 0 ? 100 + (i % 300) : null,
          tempo: ['Slow', 'Medium Slow', 'Medium', 'Medium Fast', 'Fast'][i % 5],
        }),
      );

    it('still opens on Ganesha most of the time at 7% of the pool', () => {
      let ganesha = 0;
      for (let i = 0; i < 80; i++) {
        const r = generateSession(realistic(), STANDARD, { seed: `real-${i}`, length: 3 });
        if (r.slots[0]?.candidate.deities.includes('Ganesha')) ganesha++;
      }
      // The habit holds in 140 of 188 real sessions (~74%). Well above chance
      // (7%), and never 100% — it is a habit, not a rule.
      expect(ganesha).toBeGreaterThan(56);
      expect(ganesha).toBeLessThan(80);
    });

    it('does not produce sessions made entirely of never-sung bhajans', () => {
      let allNew = 0;
      for (let i = 0; i < 80; i++) {
        const r = generateSession(realistic(), STANDARD, { seed: `mix-${i}`, length: 3 });
        if (r.slots.every((s) => s.candidate.timesSung === 0)) allNew++;
      }
      // Some all-new sets are fine and even desirable; all of them are not.
      expect(allNew).toBeLessThan(70);
    });

    it('still favours a less-sung bhajan over a heavily sung one', () => {
      expect(candidateWeight(candidate({ timesSung: 0 }), 90))
        .toBeGreaterThan(candidateWeight(candidate({ timesSung: 20 }), 90));
    });
  });

  it('keeps bhajans with no tempo eligible', () => {
    const noTempo = pool(40, () => ({ tempo: null }));
    const r = generateSession(noTempo, STANDARD, { seed: 'x', length: 3 });
    expect(r.slots).toHaveLength(3);
  });

  it('does not exclude a recently sung bhajan, but flags it', () => {
    const recent = pool(12, () => ({ lastSungDaysAgo: 3 }));
    const r = generateSession(recent, STANDARD, { seed: 'x', length: 3 });
    expect(r.slots).toHaveLength(3);
    expect(r.slots.every((s) => s.recentlySung)).toBe(true);
  });

  it('warns when the pool is thinner than 3x the slot count', () => {
    const r = generateSession(pool(5), STANDARD, { seed: 'x', length: 3 });
    expect(r.warnings.some((w) => w.includes('fewer than 3×'))).toBe(true);
  });

  it('returns nothing and says so for an empty pool', () => {
    const r = generateSession([], STANDARD, { seed: 'x', length: 3 });
    expect(r.slots).toHaveLength(0);
    expect(r.warnings.join(' ')).toContain('No bhajans match');
  });

  it('keeps a locked bhajan at ITS OWN position, not at index order', () => {
    // REGRESSION. Locks used to be placed at 1..n in array order, so locking
    // slots 1 and 3 put slot 3's bhajan at position 2 and generated a fresh one
    // for position 3 — "swap this one" appeared to swap everything.
    const p = pool(60);
    const first = generateSession(p, STANDARD, { seed: 'base', length: 3 });
    const ids = first.slots.map((s) => s.candidate.id);

    // Swap slot 2: lock 1 and 3 where they are, new seed.
    const swapped = generateSession(p, STANDARD, {
      seed: 'base-2',
      length: 3,
      locked: new Map([
        [1, ids[0]],
        [3, ids[2]],
      ]),
    });
    const after = swapped.slots.map((s) => s.candidate.id);

    expect(after[0]).toBe(ids[0]);
    expect(after[2]).toBe(ids[2]);
    expect(after[1]).not.toBe(ids[1]);
    expect(new Set(after).size).toBe(3);
  });

  it('honours locks and marks them', () => {
    const p = pool(60);
    const r = generateSession(p, STANDARD, { seed: 'x', length: 3, locked: new Map([[1, 'b7']]) });
    expect(r.slots[0].candidate.id).toBe('b7');
    expect(r.slots[0].locked).toBe(true);
    expect(r.slots[0].reasons).toContain('Locked by you');
  });

  it('re-rolling with a new seed keeps the locked slot', () => {
    const p = pool(60);
    const a = generateSession(p, STANDARD, { seed: 'one', length: 3, locked: new Map([[1, 'b7']]) });
    const b = generateSession(p, STANDARD, { seed: 'two', length: 3, locked: new Map([[1, 'b7']]) });
    expect(a.slots[0].candidate.id).toBe('b7');
    expect(b.slots[0].candidate.id).toBe('b7');
    expect(a.slots[1].candidate.id).not.toBe(b.slots[1].candidate.id);
  });

  it('ignores a locked id that is not in the pool', () => {
    const r = generateSession(pool(60), STANDARD, { seed: 'x', length: 3, locked: new Map([[1, 'nope']]) });
    expect(r.slots).toHaveLength(3);
    expect(r.slots.every((s) => !s.locked)).toBe(true);
  });

  it('gives every slot a reason', () => {
    const r = generateSession(pool(60), STANDARD, { seed: 'x', length: 3 });
    for (const s of r.slots) expect(s.reasons.length).toBeGreaterThan(0);
  });

  it('reports relaxations honestly when a hard rule cannot be met', () => {
    const hardTemplate: TemplateSpec = {
      name: 'Impossible',
      defaultLength: 2,
      rules: [{ position: 1, strength: 'hard', deity: 'Jehovah' }],
    };
    const noJehovah = pool(20, () => ({ deities: ['Sai'] }));
    const r = generateSession(noJehovah, hardTemplate, { seed: 'x', length: 2 });
    expect(r.slots).toHaveLength(2);
    expect(r.slots[0].relaxed).toContain('slot deity rule');
    expect(r.warnings.some((w) => w.includes('relaxing'))).toBe(true);
  });

  it('festival mode constrains every slot to one deity', () => {
    const festival: TemplateSpec = { name: 'Festival', defaultLength: 3, rules: [], singleDeity: 'Shiva' };
    const p = pool(60, (i) => ({ deities: i % 2 === 0 ? ['Shiva'] : ['Krishna'] }));
    const r = generateSession(p, festival, { seed: 'x', length: 3 });
    expect(r.slots).toHaveLength(3);
    expect(r.slots.every((s) => s.candidate.deities.includes('Shiva'))).toBe(true);
  });

  it('caps a deity at two appearances across the set', () => {
    const p = pool(60, (i) => ({ deities: i < 30 ? ['Sai'] : ['Krishna'] }));
    const r = generateSession(p, { name: 'Free', defaultLength: 4, rules: [] }, { seed: 'x', length: 4 });
    const counts = new Map<string, number>();
    for (const s of r.slots) {
      if (s.relaxed.includes('at most 2 per deity')) continue;
      for (const d of s.candidate.deities) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
  });
});
