import { describe, it, expect } from 'vitest';
import { similarity, similarBhajans, type BhajanFeatures } from './bhajanSimilarity';

const b = (id: string, over: Partial<BhajanFeatures> = {}): BhajanFeatures => ({
  id,
  title: id,
  deities: [],
  raga: null,
  tempo: null,
  beat: null,
  language: null,
  level: null,
  ...over,
});

describe('similarity', () => {
  it('scores an identical bhajan 1', () => {
    const x = b('a', { deities: ['Krishna'], raga: 'Kalyani / Yaman', tempo: 'Medium', language: 'Sanskrit' });
    expect(similarity(x, { ...x, id: 'b' }).score).toBeCloseTo(1, 6);
  });

  it('scores a bhajan with nothing in common 0', () => {
    const x = b('a', { deities: ['Krishna'], raga: 'Kalyani', tempo: 'Medium' });
    const y = b('b', { deities: ['Shiva'], raga: 'Bhairavi', tempo: 'Fast' });
    expect(similarity(x, y).score).toBe(0);
  });

  it('matches a dual raga name against either half', () => {
    const dual = b('a', { raga: 'Kalyani / Yaman' });
    const single = b('b', { raga: 'Yaman' });
    expect(similarity(dual, single).score).toBeGreaterThan(0);
  });

  it('IGNORES a field the other side is missing rather than counting it against', () => {
    const full = b('a', { raga: 'Kalyani', deities: ['Krishna'], tempo: 'Medium' });
    const noTempo = b('b', { raga: 'Kalyani', deities: ['Krishna'] });
    const wrongTempo = b('c', { raga: 'Kalyani', deities: ['Krishna'], tempo: 'Fast' });
    // A missing tempo must not score worse than a contradicting one.
    expect(similarity(full, noTempo).score).toBeGreaterThan(similarity(full, wrongTempo).score);
    expect(similarity(full, noTempo).score).toBeCloseTo(1, 6);
  });

  it('scores 0 when nothing at all is known on one side', () => {
    expect(similarity(b('a', { raga: 'Kalyani' }), b('b')).score).toBe(0);
  });

  it('weights raga above language, so a shared language alone is weak', () => {
    const anchor = b('a', { raga: 'Kalyani', language: 'Sanskrit' });
    const sameRaga = b('b', { raga: 'Kalyani', language: 'Tamil' });
    const sameLanguage = b('c', { raga: 'Bhairavi', language: 'Sanskrit' });
    expect(similarity(anchor, sameRaga).score).toBeGreaterThan(similarity(anchor, sameLanguage).score);
  });

  it('is symmetric', () => {
    const x = b('a', { deities: ['Rama'], raga: 'Desh', beat: '8 Beat' });
    const y = b('b', { deities: ['Rama', 'Sai'], raga: 'Desh', tempo: 'Slow' });
    expect(similarity(x, y).score).toBeCloseTo(similarity(y, x).score, 9);
  });

  it('reports which fields drove the score', () => {
    const x = b('a', { deities: ['Krishna'], raga: 'Kalyani' });
    const y = b('b', { deities: ['Krishna'], raga: 'Bhairavi' });
    expect(similarity(x, y).reasons).toContain('same deity');
    expect(similarity(x, y).reasons).not.toContain('same raga');
  });
});

describe('similarBhajans', () => {
  const pool = [
    b('kalyani-krishna', { deities: ['Krishna'], raga: 'Kalyani', tempo: 'Medium' }),
    b('kalyani-shiva', { deities: ['Shiva'], raga: 'Kalyani', tempo: 'Medium' }),
    b('desh-rama', { deities: ['Rama'], raga: 'Desh', tempo: 'Fast' }),
    b('unknown', {}),
  ];

  it('ranks the closest first', () => {
    const anchor = b('anchor', { deities: ['Krishna'], raga: 'Kalyani', tempo: 'Medium' });
    const out = similarBhajans([anchor], pool);
    expect(out[0].id).toBe('kalyani-krishna');
  });

  it('never returns an anchor', () => {
    const anchor = pool[0];
    expect(similarBhajans([anchor], pool).map((x) => x.id)).not.toContain('kalyani-krishna');
  });

  it('honours exclude', () => {
    const anchor = b('anchor', { raga: 'Kalyani' });
    const out = similarBhajans([anchor], pool, { exclude: new Set(['kalyani-krishna']) });
    expect(out.map((x) => x.id)).not.toContain('kalyani-krishna');
  });

  it('scores against the BEST anchor, not the average', () => {
    // 'desh-rama' matches the second anchor exactly and the first not at all.
    const anchors = [b('a1', { raga: 'Kalyani' }), b('a2', { deities: ['Rama'], raga: 'Desh', tempo: 'Fast' })];
    const out = similarBhajans(anchors, pool);
    const desh = out.find((x) => x.id === 'desh-rama');
    expect(desh).toBeDefined();
    expect(desh!.score).toBeCloseTo(1, 6);
  });

  it('drops bhajans below the minimum score', () => {
    const anchor = b('anchor', { raga: 'Kalyani' });
    expect(similarBhajans([anchor], pool, { minScore: 0.99 }).map((x) => x.id)).toEqual([
      'kalyani-krishna',
      'kalyani-shiva',
    ]);
  });

  it('returns nothing when there are no anchors', () => {
    expect(similarBhajans([], pool)).toEqual([]);
  });

  it('respects count', () => {
    const anchor = b('anchor', { raga: 'Kalyani', deities: ['Krishna'], tempo: 'Medium' });
    expect(similarBhajans([anchor], pool, { count: 1, minScore: 0 })).toHaveLength(1);
  });
});
