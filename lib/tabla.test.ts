import { describe, it, expect } from 'vitest';
import { recommendTablaForLabel, tablasForSession, DEGREE_PREFERENCE, isDegreeKey } from './tabla';
import { ragaScale } from './ragaScales';
import { NOTE_NAMES } from './pitch';

/** What the ashram owns, as pitch classes. */
const ASHRAM_NOTES = ['C', 'C#', 'D', 'E'] as const;
const ASHRAM = ASHRAM_NOTES.map((n) => NOTE_NAMES.indexOf(n as never));
const scale = (name: string) => ragaScale(name);

describe('degree preference', () => {
  /*
   * REVERSED 2026-09-10. Sailavan: "it should be the Pa over Ma in ragas where
   * Pa exists in the Raga. If only Ma in the Raga, then Ma." The second half
   * needs no rule of its own — the raga check does it — so this is the whole
   * change. See the top of tabla.ts for the numbers.
   */
  it('prefers the fifth over the fourth', () => {
    const order = DEGREE_PREFERENCE.map((d) => d.key);
    expect(order.indexOf('pa')).toBeLessThan(order.indexOf('ma'));
  });

  it('still prefers both of them over the third — the raga Desh case', () => {
    const order = DEGREE_PREFERENCE.map((d) => d.key);
    expect(order.indexOf('pa')).toBeLessThan(order.indexOf('ga'));
    expect(order.indexOf('ma')).toBeLessThan(order.indexOf('ga'));
  });

  it('keeps Sa first of all', () => {
    expect(DEGREE_PREFERENCE[0].key).toBe('sa');
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

  it('uses the FIFTH when Sa is not owned, even where the fourth is also owned', () => {
    // Sa = G. The ashram owns both the fifth (D) and the fourth (C), and the
    // fifth wins as of 2026-09-10. Shankarabharanam has both, so both are real
    // candidates and the order alone decides — which is what makes this the
    // test that would catch the order being flipped back by accident.
    const r = recommendTablaForLabel('5 Pancham / G', scale('Shankarabharanam'), ASHRAM);
    expect(r).toMatchObject({ note: 'D', degree: 'pa' });
  });

  /*
   * THE TWO ROWS THAT PROMPTED THE REVERSAL, pinned as themselves.
   *
   * Both at Sa G on one session, both given the fourth (C) where Sailavan
   * wanted the fifth (D). Desh is the honest case: its shudh Ma is a real,
   * strong note, so the old rule was reasoning correctly from correct data.
   */
  it('gives the fifth for Yaman Kalyan at Sa G', () => {
    const r = recommendTablaForLabel('5 Pancham / G', scale('Yaman Kalyan'), ASHRAM);
    expect(r).toMatchObject({ note: 'D', degree: 'pa' });
  });

  it('gives the fifth for Desh at Sa G', () => {
    const r = recommendTablaForLabel('5 Pancham / G', scale('Desh'), ASHRAM);
    expect(r).toMatchObject({ note: 'D', degree: 'pa' });
  });

  /*
   * And the two spellings of one raga now agree. They did not: `yaman kalyan`
   * lists BOTH fourths in lib/ragaScales.ts — true of the raga, where shudh Ma
   * is an ornamental touch in descent — so under Ma-first it took a note
   * nobody would tune a drum to, while plain `yaman` took the fifth.
   */
  it('agrees between Yaman and Yaman Kalyan', () => {
    const a = recommendTablaForLabel('5 Pancham / G', scale('Yaman'), ASHRAM);
    const b = recommendTablaForLabel('5 Pancham / G', scale('Yaman Kalyan'), ASHRAM);
    expect(a.note).toBe(b.note);
  });

  it('falls to the fourth when the raga has no fifth to offer', () => {
    // Malkauns is Sa ga ma dha ni — no Pa at all. "If only Ma in the Raga,
    // then Ma", without a rule saying so: the scale check does it.
    expect(scale('Hindolam / Malkauns')).not.toContain(7);
    const r = recommendTablaForLabel('5 Pancham / G', scale('Hindolam / Malkauns'), ASHRAM);
    expect(r).toMatchObject({ note: 'C', degree: 'ma' });
  });

  it('takes the fifth where the raga has no fourth', () => {
    // Sa = G in Hamsadhwani, which is Sa Ri Ga Pa Ni — no Ma at all.
    const r = recommendTablaForLabel('5 Pancham / G', scale('Hamsadhwani'), ASHRAM);
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
    // B is Sa G, whose FIFTH is D — so from 2026-09-10 it shares the D drum
    // with bhajan A (Sa D) rather than the C drum with bhajan C. Under the old
    // Ma-first order it took C, and this test read the other way round.
    expect(calls.map((c) => c.note)).toEqual(['C', 'D']);
    expect(calls.find((c) => c.note === 'C')!.forBhajans).toEqual(['C']);
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

/**
 * The shruti ladder's column, which showed Sa + 7 until 2026-08-21.
 *
 * The ladder lists every pitch label, so it is the one place that asks the
 * question for all twelve Sa at once — and therefore the place where the old
 * rule was most visibly wrong: it named a drum for every row, including the
 * five Sa whose fifth is a drum the centre does not own.
 */
describe('the shruti ladder column — every Sa, one raga', () => {
  const PANCHAM = NOTE_NAMES.map((n) => `1 Pancham / ${n}`);

  it('never names a drum the centre does not own', () => {
    for (const label of PANCHAM) {
      const note = recommendTablaForLabel(label, null, ASHRAM).note;
      if (note !== null) expect(ASHRAM_NOTES, label).toContain(note);
    }
  });

  it('disagrees with the old Sa + 7 rule on most of the octave', () => {
    // The old rule: the fifth, whether or not it is a drum in the building.
    const oldRule = (label: string) => {
      const sa = NOTE_NAMES.indexOf(label.split('/')[1].trim() as never);
      return NOTE_NAMES[(sa + 7) % 12];
    };
    const differ = PANCHAM.filter(
      (label) => recommendTablaForLabel(label, null, ASHRAM).note !== oldRule(label),
    );
    /*
     * They agree on 4 of the 12 Sa, up from 2 before the order was reversed on
     * 2026-09-10 — which is the point of the reversal, not a coincidence.
     * Agreement now needs only that the fifth is a drum the centre owns and
     * that Sa is not; it no longer also needs the fourth to be missing.
     *
     * The rules remain different in kind, which is why this test stays: the
     * old one named the fifth whether or not the building held that drum.
     */
    expect(differ.length).toBe(8);
  });

  it('says "none" rather than inventing one, and only where nothing fits', () => {
    // With no raga recorded only Sa, Ma and Pa are assumed available, so a Sa
    // is unusable exactly when none of Sa, Sa+5 and Sa+7 is an owned drum.
    for (const label of PANCHAM) {
      const sa = NOTE_NAMES.indexOf(label.split('/')[1].trim() as never);
      const usable = [0, 5, 7].some((s) => ASHRAM.includes((sa + s) % 12));
      expect(recommendTablaForLabel(label, null, ASHRAM).note === null, label).toBe(!usable);
    }
  });
});

describe('a raga rule — a preference that holds at every pitch', () => {
  /*
   * The mechanism Sailavan asked for: "not just remembering it for that pitch
   * and that raag, but almost for that raag". It stores a DEGREE, because a
   * note cannot generalise across pitches — the fifth of G is D and the fifth
   * of F is C.
   */
  it('pulls its degree to the front, at every Sa', () => {
    const withRule = (label: string) =>
      recommendTablaForLabel(label, scale('Shankarabharanam'), ASHRAM, 'ma');

    // Sa G: the standard order gives the fifth (D); the rule asks for the fourth.
    expect(recommendTablaForLabel('5 Pancham / G', scale('Shankarabharanam'), ASHRAM).degree).toBe('pa');
    expect(withRule('5 Pancham / G')).toMatchObject({ note: 'C', degree: 'ma' });

    // And the SAME rule at another Sa resolves to another drum, which is the
    // whole reason it stores a degree.
    expect(withRule('7 Pancham / B')).toMatchObject({ note: 'E', degree: 'ma' });
  });

  it('cannot conjure a note the raga does not contain', () => {
    // Malkauns has no Pa. A rule asking for one is simply ignored, and the
    // scale check still decides — a preference must never overrule the music.
    expect(scale('Hindolam / Malkauns')).not.toContain(7);
    const r = recommendTablaForLabel('5 Pancham / G', scale('Hindolam / Malkauns'), ASHRAM, 'pa');
    expect(r.degree).not.toBe('pa');
    expect(r).toMatchObject({ note: 'C', degree: 'ma' });
  });

  it('does nothing when its degree is already first', () => {
    const a = recommendTablaForLabel('5 Pancham / G', scale('Desh'), ASHRAM);
    const b = recommendTablaForLabel('5 Pancham / G', scale('Desh'), ASHRAM, 'pa');
    expect(b.note).toBe(a.note);
    expect(b.degree).toBe(a.degree);
  });

  it('ignores a degree it does not recognise', () => {
    expect(isDegreeKey('pa')).toBe(true);
    expect(isDegreeKey('ni')).toBe(true);
    expect(isDegreeKey('tivra-ma')).toBe(false);
    expect(isDegreeKey('')).toBe(false);
  });
});

describe('the working', () => {
  /*
   * The steps are what make the answer arguable rather than asserted — Sailavan
   * asked to see "that amount of the working". They must therefore be COMPLETE:
   * the walk carries on past the winner, so the panel can show what was tried
   * after it as well as what was skipped before it.
   */
  it('records every degree considered, not just the winner', () => {
    const r = recommendTablaForLabel('5 Pancham / G', scale('Shankarabharanam'), ASHRAM);
    const chosen = r.steps.filter((s) => s.chosen);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].degree).toBe('pa');
    // One step per FORM: six degrees, two of which have two forms.
    expect(r.steps.length).toBe(8);
  });

  it('says why each one was passed over', () => {
    const r = recommendTablaForLabel('5 Pancham / G', scale('Shankarabharanam'), ASHRAM);
    const sa = r.steps.find((s) => s.degree === 'sa')!;
    // Sa G: the centre owns no G, which is why the fifth got a look at all.
    expect(sa.owned).toBe(false);
    expect(sa.passed).toBe('the ashram has no G');

    const ma = r.steps.find((s) => s.degree === 'ma')!;
    expect(ma.owned).toBe(true);
    expect(ma.inRaga).toBe(true);
    expect(ma.passed).toBe('a better degree won');
  });

  it('marks a degree the raga does not have', () => {
    const r = recommendTablaForLabel('5 Pancham / G', scale('Hindolam / Malkauns'), ASHRAM);
    const pa = r.steps.find((s) => s.degree === 'pa')!;
    expect(pa.inRaga).toBe(false);
    expect(pa.passed).toBe('not in this raga');
  });

  it('says the raga is unknown rather than pretending to know', () => {
    const r = recommendTablaForLabel('5 Pancham / G', null, ASHRAM);
    expect(r.confidence).toBe('assumed');
    for (const s of r.steps) expect(s.inRaga).toBeNull();
    const ga = r.steps.find((s) => s.degree === 'ga')!;
    expect(ga.passed).toBe('not one of the three assumed');
  });

  it('names both forms of a two-form degree distinctly', () => {
    const r = recommendTablaForLabel('5 Pancham / G', scale('Shankarabharanam'), ASHRAM);
    const thirds = r.steps.filter((s) => s.degree === 'ga').map((s) => s.label);
    expect(thirds).toEqual(['Ga', 'Ga\u266d']);
  });

  it('still records the working when nothing fits', () => {
    const r = recommendTablaForLabel('2.5 Pancham / D#', scale('Hamsadhwani'), ASHRAM);
    expect(r.note).toBeNull();
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.steps.every((s) => !s.chosen)).toBe(true);
  });
});
