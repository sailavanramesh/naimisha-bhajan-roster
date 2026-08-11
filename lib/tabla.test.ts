import { describe, it, expect } from 'vitest';
import { recommendTablaForLabel, tablasForSession, DEGREE_PREFERENCE } from './tabla';
import { ragaScale } from './ragaScales';
import { NOTE_NAMES } from './pitch';

/** What the ashram owns, as pitch classes. */
const ASHRAM = ['C', 'C#', 'D', 'E'].map((n) => NOTE_NAMES.indexOf(n as never));
const scale = (name: string) => ragaScale(name);

describe('degree preference', () => {
  it('prefers the fourth over the third — the raga Desh case', () => {
    const order = DEGREE_PREFERENCE.map((d) => d.key);
    expect(order.indexOf('ma')).toBeLessThan(order.indexOf('ga'));
  });

  it('never offers the second, the seventh or the tritone', () => {
    const offered = DEGREE_PREFERENCE.flatMap((d) => d.semitones);
    for (const clashing of [1, 2, 6, 11]) expect(offered).not.toContain(clashing);
  });
});

describe('recommendTabla — the common cases', () => {
  it('uses Sa when the ashram owns it', () => {
    const r = recommendTablaForLabel('2 Pancham / D', scale('Desh'), ASHRAM);
    expect(r).toMatchObject({ note: 'D', degree: 'sa', confidence: 'certain' });
  });

  it('uses the fifth when Sa is not owned — the traditional second choice', () => {
    // Sa = G, fifth = D.
    const r = recommendTablaForLabel('5 Pancham / G', scale('Shankarabharanam'), ASHRAM);
    expect(r).toMatchObject({ note: 'D', degree: 'pa' });
  });

  it('uses the fourth when neither Sa nor the fifth is owned', () => {
    // Sa = G#, fifth = D# (not owned), fourth = C#.
    const r = recommendTablaForLabel('5.5 Pancham / G#', scale('Charukeshi'), ASHRAM);
    expect(r).toMatchObject({ note: 'C#', degree: 'ma' });
  });

  it('uses the fourth for B, the other common gap', () => {
    // Sa = B, fifth = F# (not owned), fourth = E.
    const r = recommendTablaForLabel('7 Pancham / B', scale('Mohanam'), ASHRAM);
    // Mohanam has no Ma at all, so the fourth is unavailable to it.
    expect(r.degree).not.toBe('ma');
  });

  it('does take the fourth for B in a raga that HAS a natural fourth', () => {
    const r = recommendTablaForLabel('7 Pancham / B', scale('Keeravani'), ASHRAM);
    expect(r).toMatchObject({ note: 'E', degree: 'ma' });
  });
});

describe('recommendTabla — the third depends on which third the raga uses', () => {
  // Sa = A#. Major third = D, minor third = C#. The ashram owns both.
  it('takes the MAJOR third for a raga with shuddha Ga', () => {
    const r = recommendTablaForLabel('6.5 Pancham / A#', scale('Shankarabharanam'), ASHRAM);
    expect(r).toMatchObject({ note: 'D', degree: 'ga' });
  });

  it('takes the MINOR third for a raga with komal Ga', () => {
    const r = recommendTablaForLabel('6.5 Pancham / A#', scale('Jaunpuri'), ASHRAM);
    expect(r).toMatchObject({ note: 'C#', degree: 'ga' });
  });
});

describe('recommendTabla — ragas that omit a degree', () => {
  it('skips the fifth in Malkauns, which has none', () => {
    expect(scale('Hindolam / Malkauns')).not.toContain(7);
    // Sa = F: fifth would be C (owned), but Malkauns has no Pa.
    const r = recommendTablaForLabel('1 Madhyam / F', scale('Hindolam / Malkauns'), ASHRAM);
    expect(r.degree).not.toBe('pa');
  });

  it('skips the natural fourth in Kalyani, where the fourth is sharp', () => {
    expect(scale('Kalyani / Yaman')).not.toContain(5);
    // Sa = G#: the natural fourth would be C#, which the ashram owns.
    const r = recommendTablaForLabel('5.5 Pancham / G#', scale('Kalyani / Yaman'), ASHRAM);
    expect(r.degree).not.toBe('ma');
  });
});

describe('recommendTabla — when nothing fits', () => {
  /*
   * D# is the hard tonic: Sa, fifth, fourth and both thirds all miss. It is
   * rescued only by the sixth (C) or the flat seventh (C#), which is why those
   * two degrees are in the preference list at all.
   */
  it('rescues D# with the sixth when the raga has one', () => {
    const r = recommendTablaForLabel('2.5 Pancham / D#', scale('Shankarabharanam'), ASHRAM);
    expect(r).toMatchObject({ note: 'C', degree: 'dha' });
  });

  it('rescues D# with the flat seventh when the raga has no sixth', () => {
    // Sa, R, g, m, P, n — a Dha-less set with komal ni. D# + 10 = C#.
    const r = recommendTablaForLabel('2.5 Pancham / D#', [0, 2, 3, 5, 7, 10], ASHRAM);
    expect(r).toMatchObject({ note: 'C#', degree: 'ni' });
  });

  it('reports no tabla when the raga has neither a sixth nor a flat seventh', () => {
    // Hamsadhwani: S R G P N. Nothing it contains lands on C, C#, D or E.
    const r = recommendTablaForLabel('2.5 Pancham / D#', scale('Hamsadhwani'), ASHRAM);
    expect(r.note).toBeNull();
    expect(r.confidence).toBe('none');
    expect(r.why).toContain('no tabla fits');
  });

  it('suggests a semitone either way that does work', () => {
    const r = recommendTablaForLabel('2.5 Pancham / D#', scale('Hamsadhwani'), ASHRAM);
    expect(r.alternativesIfNone.length).toBeGreaterThan(0);
  });
});

describe('recommendTabla — unknown raga', () => {
  it('assumes only Sa, the fifth and the fourth, and says so', () => {
    const r = recommendTablaForLabel('5.5 Pancham / G#', null, ASHRAM);
    expect(r).toMatchObject({ note: 'C#', degree: 'ma', confidence: 'assumed' });
  });

  it('never reaches for a third it cannot justify', () => {
    // Sa = A#: only the thirds land on an owned drum, and we do not know which.
    const r = recommendTablaForLabel('6.5 Pancham / A#', null, ASHRAM);
    expect(r.note).toBeNull();
    expect(r.confidence).toBe('none');
  });

  it('handles a missing pitch without crashing', () => {
    expect(recommendTablaForLabel(null, null, ASHRAM).note).toBeNull();
    expect(recommendTablaForLabel('not a pitch', null, ASHRAM).note).toBeNull();
  });
});

describe('tablasForSession', () => {
  it('collapses a session to the distinct drums to bring', () => {
    const slots = [
      { title: 'A', choice: recommendTablaForLabel('2 Pancham / D', scale('Desh'), ASHRAM) },
      { title: 'B', choice: recommendTablaForLabel('5 Pancham / G', scale('Bilawal'), ASHRAM) },
      { title: 'C', choice: recommendTablaForLabel('1 Pancham / C', scale('Bilawal'), ASHRAM) },
    ];
    const { calls, unresolved } = tablasForSession(slots);
    expect(calls.map((c) => c.note)).toEqual(['C', 'D']);
    expect(calls.find((c) => c.note === 'D')!.forBhajans).toEqual(['A', 'B']);
    expect(unresolved).toHaveLength(0);
  });

  it('separates out the ones nothing fits, rather than dropping them', () => {
    const slots = [
      { title: 'Fits', choice: recommendTablaForLabel('2 Pancham / D', scale('Desh'), ASHRAM) },
      { title: 'Does not', choice: recommendTablaForLabel('2.5 Pancham / D#', scale('Hamsadhwani'), ASHRAM) },
    ];
    const { calls, unresolved } = tablasForSession(slots);
    expect(calls).toHaveLength(1);
    expect(unresolved.map((u) => u.title)).toEqual(['Does not']);
  });

  it('flags when any bhajan behind a drum rested on an assumed raga', () => {
    const slots = [{ title: 'X', choice: recommendTablaForLabel('5.5 Pancham / G#', null, ASHRAM) }];
    expect(tablasForSession(slots).calls[0].anyAssumed).toBe(true);
  });
});

/*
 * Confirmed by Sailavan on 2026-08-11, going through each case by hand.
 *
 * These are not my reasoning about the rule — they are the group's answers to
 * "which drum would you actually bring". They pin the behaviour that matters
 * most: every case where the rule goes past Sa and the fifth, which is where
 * it could plausibly be wrong.
 */
describe('confirmed against the group', () => {
  const check = (pitch: string, raga: string, expected: string) =>
    it(`${raga} at ${pitch} -> ${expected}`, () => {
      expect(recommendTablaForLabel(pitch, scale(raga), ASHRAM).note).toBe(expected);
    });

  check('6.5 Pancham / A#', 'Shankarabharanam', 'D');   // major third
  check('6.5 Pancham / A#', 'Jaunpuri', 'C#');          // minor third
  check('5.5 Pancham / G#', 'Kalyani / Yaman', 'C');    // skips the sharp fourth
  check('5.5 Pancham / G#', 'Hindolam / Malkauns', 'C#'); // skips the absent fifth
  check('5.5 Pancham / G#', 'Mohanam / Bhoop', 'C');    // no Ma at all
  check('2.5 Pancham / D#', 'Desh', 'C');               // the sixth
  check('2.5 Pancham / D#', 'Darbari', 'C#');           // the flat seventh

  // Also confirmed: Kalyana Vasantham takes the NATURAL fourth, M1.
  it('Kalyana Vasantham has a natural fourth, so G# resolves to C#', () => {
    expect(scale('Kalyana Vasantham')).toContain(5);
    expect(scale('Kalyana Vasantham')).not.toContain(6);
    expect(recommendTablaForLabel('5.5 Pancham / G#', scale('Kalyana Vasantham'), ASHRAM).note).toBe('C#');
  });
});
