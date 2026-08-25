import { describe, it, expect } from 'vitest';
import {
  PITCH_CLASS,
  NOTE_NAMES,
  saOf,
  parsePitchLabel,
  semitoneDelta,
  tablaSemitone,
  tablaPitchOf,
  median,
  mean,
  percentile,
  offsetProfile,
  isConfident,
  transposeLabel,
  predictPitch,
  MIN_CONFIDENT_SAMPLES,
  seriesLadder,
  stepWithinSeries,
  pitchRank,
  lowestPitch,
  stepNote,
} from './pitch';

/**
 * The 24 pitch labels exactly as they appear in the `Lookup tables` sheet of
 * data/roster.xlsx, with the tabla pitch the group recorded against each.
 * Copied verbatim — this is the fixture that proves "tabla = Sa + 7".
 */
const LOOKUP: ReadonlyArray<readonly [string, string]> = [
  ['1 Madhyam / F', 'C'],
  ['1 Pancham / C', 'G'],
  ['1.5 Madhyam / F#', 'C#'],
  ['1.5 Pancham / C#', 'G#'],
  ['2 Madhyam / G', 'D'],
  ['2 Pancham / D', 'A'],
  ['2.5 Madhyam / G#', 'D#'],
  ['2.5 Pancham / D#', 'A#'],
  ['3 Madhyam / A', 'E'],
  ['3 Pancham / E', 'B'],
  ['4 Madhyam / A#', 'F'],
  ['4 Pancham / F', 'C'],
  ['4.5 Madhyam / B', 'F#'],
  ['4.5 Pancham / F#', 'C#'],
  ['5 Madhyam / C', 'G'],
  ['5 Pancham / G', 'D'],
  ['5.5 Madhyam / C#', 'G#'],
  ['5.5 Pancham / G#', 'D#'],
  ['6 Madhyam / D', 'A'],
  ['6 Pancham / A', 'E'],
  ['6.5 Madhyam / D#', 'A#'],
  ['6.5 Pancham / A#', 'F'],
  ['7 Madhyam / E', 'B'],
  ['7 Pancham / B', 'F#'],
];

const ALL_LABELS = LOOKUP.map(([label]) => label);

describe('saOf', () => {
  it('reads Sa from the letter in Pancham, where the letter IS Sa', () => {
    expect(saOf('2 Pancham / D')).toBe(PITCH_CLASS.D);
    expect(saOf('1.5 Pancham / C#')).toBe(PITCH_CLASS['C#']);
  });

  it('reads Sa a fourth BELOW the letter in Madhyam, where the letter is Ma', () => {
    // "1 Madhyam / F" is Sa C with F droning a fourth above it.
    expect(saOf('1 Madhyam / F')).toBe(PITCH_CLASS.C);
    expect(saOf('4.5 Madhyam / B')).toBe(PITCH_CLASS['F#']);
    expect(saOf('7 Madhyam / E')).toBe(PITCH_CLASS.B);
  });

  it('gives the same Sa for the same STEP in either series (CLAUDE.md rule 2)', () => {
    // The number is Sa; the series only decides what drones against it.
    for (const [step, madhyam, pancham] of [
      ['1', '1 Madhyam / F', '1 Pancham / C'],
      ['2.5', '2.5 Madhyam / G#', '2.5 Pancham / D#'],
      ['4.5', '4.5 Madhyam / B', '4.5 Pancham / F#'],
      ['7', '7 Madhyam / E', '7 Pancham / B'],
    ]) {
      expect(saOf(madhyam), `step ${step}`).toBe(saOf(pancham));
    }
  });

  it('puts the written note a fourth above Sa for every Madhyam label', () => {
    for (const label of ALL_LABELS.filter((l) => /madhyam/i.test(l))) {
      const written = PITCH_CLASS[/\/\s*([A-G]#?)\s*$/.exec(label)![1] as keyof typeof PITCH_CLASS];
      expect((saOf(label)! + 5) % 12, label).toBe(written);
    }
  });

  it('ignores surrounding whitespace', () => {
    expect(saOf('  2 Pancham / D  ')).toBe(PITCH_CLASS.D);
    expect(saOf('2 Pancham /D')).toBe(PITCH_CLASS.D);
  });

  it('returns null for absent or unparseable input', () => {
    for (const bad of [null, undefined, '', '   ', 'Pancham', '2 Pancham / H', 'D']) {
      expect(saOf(bad as string | null)).toBeNull();
    }
  });
});

describe('parsePitchLabel', () => {
  it('parses every label in the lookup table', () => {
    for (const [label] of LOOKUP) {
      const p = parsePitchLabel(label);
      expect(p, label).not.toBeNull();
      expect(p!.raw).toBe(label);
    }
  });

  it('splits step, series and note, and resolves Sa', () => {
    // `note` is the note as WRITTEN — here the Ma. `semitone`/`saNote` are Sa.
    expect(parsePitchLabel('2.5 Madhyam / G#')).toMatchObject({
      step: 2.5,
      series: 'Madhyam',
      note: 'G#',
      semitone: PITCH_CLASS['D#'],
      saNote: 'D#',
    });
    expect(parsePitchLabel('2.5 Pancham / D#')).toMatchObject({
      step: 2.5,
      series: 'Pancham',
      note: 'D#',
      semitone: PITCH_CLASS['D#'],
      saNote: 'D#',
    });
  });

  it('is stricter than saOf and rejects partial labels', () => {
    expect(parsePitchLabel('/ D')).toBeNull();
    expect(parsePitchLabel('2 Kharaj / D')).toBeNull();
    // saOf still recovers the pitch from the same string.
    expect(saOf('/ D')).toBe(PITCH_CLASS.D);
  });
});

describe('semitoneDelta', () => {
  it('is zero across series when the STEP is the same', () => {
    expect(semitoneDelta('1 Madhyam / F', '1 Pancham / C')).toBe(0);
    expect(semitoneDelta('4.5 Madhyam / B', '4.5 Pancham / F#')).toBe(0);
  });

  it('is signed: positive means sung higher', () => {
    expect(semitoneDelta('2 Pancham / D', '1 Pancham / C')).toBe(2);
    expect(semitoneDelta('1 Pancham / C', '2 Pancham / D')).toBe(-2);
  });

  it('wraps to the shortest distance in [-6, +6]', () => {
    // C -> B is +11 naively, but -1 is the shorter way round.
    expect(semitoneDelta('7 Pancham / B', '1 Pancham / C')).toBe(-1);
    // The tritone is the boundary case and resolves to +6, not -6.
    expect(semitoneDelta('4.5 Pancham / F#', '1 Pancham / C')).toBe(6);
  });

  it('never returns a value outside [-6, +6] for any pair of labels', () => {
    for (const [a] of LOOKUP) {
      for (const [b] of LOOKUP) {
        const d = semitoneDelta(a, b)!;
        expect(d).toBeGreaterThanOrEqual(-6);
        expect(d).toBeLessThanOrEqual(6);
      }
    }
  });

  it('returns null when either side is unparseable', () => {
    expect(semitoneDelta(null, '1 Pancham / C')).toBeNull();
    expect(semitoneDelta('1 Pancham / C', '')).toBeNull();
  });
});

describe('tabla pitch', () => {
  it('is Sa + 7 semitones for all 24 labels', () => {
    for (const [label] of LOOKUP) {
      expect(tablaPitchOf(label), label).toBe(NOTE_NAMES[(saOf(label)! + 7) % 12]);
    }
  });

  /**
   * The sheet's own tabla column, and where it parts company with rule 1.
   *
   * It is the WRITTEN note + 7 in all 24 rows. For Pancham that is Sa + 7 and
   * agrees. For Madhyam, where the written note is Ma, it comes out a fourth
   * high — it lands on Sa itself rather than a fifth above it.
   *
   * Asserted rather than quietly ignored, because it is the strongest evidence
   * against rule 1 as it now stands, and because anybody who reads
   * `PitchLabel.tablaPitch` directly will get the old answer for half the
   * table. Derive it with `tablaPitchOf`; never read the column.
   */
  it('disagrees with the sheet on every Madhyam row, and agrees on every Pancham one', () => {
    for (const [label, sheetTabla] of LOOKUP) {
      const derived = tablaPitchOf(label)!;
      if (/madhyam/i.test(label)) {
        expect(derived, `${label} should NOT match the sheet`).not.toBe(sheetTabla);
        // The sheet's value is Sa, a fourth below where the tabla belongs.
        expect(sheetTabla, `${label} sheet value`).toBe(NOTE_NAMES[saOf(label)!]);
      } else {
        expect(derived, `${label} should match the sheet`).toBe(sheetTabla);
      }
    }
  });

  it('wraps around the octave', () => {
    expect(tablaSemitone(PITCH_CLASS.F)).toBe(PITCH_CLASS.C);
    expect(tablaSemitone(PITCH_CLASS.B)).toBe(PITCH_CLASS['F#']);
  });

  it('returns null when there is no parseable pitch', () => {
    expect(tablaPitchOf('nonsense')).toBeNull();
  });
});

describe('statistics', () => {
  it('median takes the middle value for odd counts', () => {
    expect(median([1, 5, 2])).toBe(2);
  });

  it('median averages the two middle values for even counts', () => {
    expect(median([0, 1, 2, 3])).toBe(1.5);
    expect(median([0, 1])).toBe(0.5);
  });

  it('does not mutate its input', () => {
    const xs = [3, 1, 2];
    median(xs);
    percentile(xs, 0.5);
    expect(xs).toEqual([3, 1, 2]);
  });

  it('mean handles negatives', () => {
    expect(mean([-1, 0, 1])).toBe(0);
    expect(mean([-2, -1])).toBe(-1.5);
  });

  it('returns null rather than NaN for empty input', () => {
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
    expect(percentile([], 0.5)).toBeNull();
  });

  it('percentile uses nearest-rank and clamps at the ends', () => {
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(percentile(xs, 0)).toBe(0);
    expect(percentile(xs, 0.1)).toBe(0);
    expect(percentile(xs, 0.9)).toBe(8);
    expect(percentile(xs, 1)).toBe(9);
  });
});

describe('offsetProfile', () => {
  it('summarises a singer’s deltas', () => {
    const p = offsetProfile([0, 1, 1, 1, 2]);
    expect(p.n).toBe(5);
    expect(p.median).toBe(1);
    expect(p.mean).toBe(1);
    expect(p.comfortLow).toBe(0);
    expect(p.comfortHigh).toBe(2);
  });

  it('is not confident below the sample threshold', () => {
    const thin = offsetProfile(new Array(MIN_CONFIDENT_SAMPLES - 1).fill(1));
    const enough = offsetProfile(new Array(MIN_CONFIDENT_SAMPLES).fill(1));
    expect(isConfident(thin)).toBe(false);
    expect(isConfident(enough)).toBe(true);
  });

  it('handles an empty history without throwing', () => {
    const p = offsetProfile([]);
    expect(p).toMatchObject({ n: 0, median: null, mean: null });
    expect(isConfident(p)).toBe(false);
  });
});

describe('transposeLabel', () => {
  it('keeps the reference series when a label exists in it', () => {
    // C + 2 = D. Pancham reference should stay Pancham.
    expect(transposeLabel('1 Pancham / C', 2, ALL_LABELS)).toBe('2 Pancham / D');
    // F + 2 = G. Madhyam reference should stay Madhyam.
    expect(transposeLabel('1 Madhyam / F', 2, ALL_LABELS)).toBe('2 Madhyam / G');
  });

  it('is identity for a zero shift', () => {
    for (const [label] of LOOKUP) {
      expect(transposeLabel(label, 0, ALL_LABELS), label).toBe(label);
    }
  });

  it('wraps across the octave boundary', () => {
    expect(transposeLabel('7 Pancham / B', 1, ALL_LABELS)).toBe('1 Pancham / C');
  });

  it('falls back to a bare note name when no label matches', () => {
    expect(transposeLabel('1 Pancham / C', 2, [])).toBe('D');
  });

  it('returns null when the reference is unparseable', () => {
    expect(transposeLabel(null, 1, ALL_LABELS)).toBeNull();
  });

  it('round-trips: shifting by d then -d returns the original', () => {
    for (const [label] of LOOKUP) {
      for (const d of [-6, -3, -1, 1, 3, 6]) {
        const there = transposeLabel(label, d, ALL_LABELS);
        const back = transposeLabel(there, -d, ALL_LABELS);
        expect(back, `${label} ${d}`).toBe(label);
      }
    }
  });
});

describe('predictPitch', () => {
  const confident = offsetProfile(new Array(20).fill(1));
  const thin = offsetProfile([1, 1]);

  it('shifts the reference by the median offset when confident', () => {
    const r = predictPitch('1 Pancham / C', confident, ALL_LABELS);
    expect(r).toMatchObject({ label: '1.5 Pancham / C#', predicted: true, n: 20 });
  });

  it('returns the plain reference, flagged as not predicted, when data is thin', () => {
    const r = predictPitch('1 Pancham / C', thin, ALL_LABELS);
    expect(r).toMatchObject({ label: '1 Pancham / C', predicted: false, n: 2 });
  });

  it('reports the sample size behind the prediction', () => {
    expect(predictPitch('1 Pancham / C', confident, ALL_LABELS).n).toBe(20);
    expect(predictPitch(null, confident, ALL_LABELS).n).toBe(20);
  });

  it('never invents a pitch when there is no reference', () => {
    expect(predictPitch(null, confident, ALL_LABELS).label).toBeNull();
    expect(predictPitch('  ', confident, ALL_LABELS).label).toBeNull();
  });
});

describe('note tables', () => {
  it('NOTE_NAMES is the inverse of PITCH_CLASS', () => {
    expect(NOTE_NAMES).toHaveLength(12);
    for (const [note, pc] of Object.entries(PITCH_CLASS)) {
      expect(NOTE_NAMES[pc]).toBe(note);
    }
  });
});

/*
 * Ladder helpers, exercised against ALL_LABELS above — the group's real 24
 * labels, not an invented set.
 */
describe('seriesLadder', () => {
  it('gives twelve rungs per series', () => {
    expect(seriesLadder(ALL_LABELS, 'Madhyam')).toHaveLength(12);
    expect(seriesLadder(ALL_LABELS, 'Pancham')).toHaveLength(12);
  });

  it('orders Madhyam F through E', () => {
    expect(seriesLadder(ALL_LABELS, 'Madhyam')).toEqual([
      '1 Madhyam / F', '1.5 Madhyam / F#', '2 Madhyam / G', '2.5 Madhyam / G#',
      '3 Madhyam / A', '4 Madhyam / A#', '4.5 Madhyam / B', '5 Madhyam / C',
      '5.5 Madhyam / C#', '6 Madhyam / D', '6.5 Madhyam / D#', '7 Madhyam / E',
    ]);
  });

  it('every rung is exactly one semitone above the last, in both series', () => {
    for (const series of ['Madhyam', 'Pancham'] as const) {
      const ladder = seriesLadder(ALL_LABELS, series);
      for (let i = 1; i < ladder.length; i++) {
        const a = saOf(ladder[i - 1])!;
        const b = saOf(ladder[i])!;
        expect(((b - a) % 12 + 12) % 12, `${ladder[i - 1]} -> ${ladder[i]}`).toBe(1);
      }
    }
  });

  it('excludes the other series entirely', () => {
    expect(seriesLadder(ALL_LABELS, 'Pancham').every((l) => l.includes('Pancham'))).toBe(true);
  });

  it('drops duplicate rungs rather than producing a longer ladder', () => {
    expect(seriesLadder([...ALL_LABELS, '1 Madhyam / F'], 'Madhyam')).toHaveLength(12);
  });
});

describe('stepWithinSeries', () => {
  it('goes up one semitone', () => {
    expect(stepWithinSeries('2 Pancham / D', 1, ALL_LABELS)).toBe('2.5 Pancham / D#');
  });

  it('goes down one semitone', () => {
    expect(stepWithinSeries('2 Pancham / D', -1, ALL_LABELS)).toBe('1.5 Pancham / C#');
  });

  it('WRAPS at the top — E to F really is one semitone up', () => {
    expect(stepWithinSeries('7 Madhyam / E', 1, ALL_LABELS)).toBe('1 Madhyam / F');
  });

  it('wraps at the bottom', () => {
    expect(stepWithinSeries('1 Madhyam / F', -1, ALL_LABELS)).toBe('7 Madhyam / E');
  });

  it('NEVER crosses between series — Madhyam stays Madhyam', () => {
    let label: string | null = '1 Madhyam / F';
    for (let i = 0; i < 24; i++) {
      label = stepWithinSeries(label, 1, ALL_LABELS);
      expect(label, `after ${i + 1} steps`).toContain('Madhyam');
    }
  });

  it('returns to where it started after twelve steps', () => {
    let label: string | null = '3 Pancham / E';
    for (let i = 0; i < 12; i++) label = stepWithinSeries(label, 1, ALL_LABELS);
    expect(label).toBe('3 Pancham / E');
  });

  it('up then down is a no-op', () => {
    for (const start of ALL_LABELS) {
      const up = stepWithinSeries(start, 1, ALL_LABELS);
      expect(stepWithinSeries(up, -1, ALL_LABELS), start).toBe(start);
    }
  });

  it('falls back to the recommendation when nothing is confirmed yet', () => {
    expect(stepWithinSeries(null, 1, ALL_LABELS, '2 Pancham / D')).toBe('2.5 Pancham / D#');
    expect(stepWithinSeries('', -1, ALL_LABELS, '2 Pancham / D')).toBe('1.5 Pancham / C#');
  });

  it('prefers the current value over the fallback', () => {
    expect(stepWithinSeries('5 Madhyam / C', 1, ALL_LABELS, '2 Pancham / D')).toBe('5.5 Madhyam / C#');
  });

  it('returns null when there is nothing to step from', () => {
    expect(stepWithinSeries(null, 1, ALL_LABELS, null)).toBeNull();
    expect(stepWithinSeries('not a pitch', 1, ALL_LABELS)).toBeNull();
  });

  it('steps a label whose step number is written oddly, by matching semitone', () => {
    expect(stepWithinSeries('3.5 Madhyam / A#', 1, ALL_LABELS)).toBe('4.5 Madhyam / B');
  });
});


describe('pitchRank / lowestPitch', () => {
  it('ranks by the printed Pancham ladder — C is the floor, B the top', () => {
    expect(pitchRank('1 Pancham / C')).toBe(0);
    expect(pitchRank('7 Pancham / B')).toBe(11);
  });

  it('ranks a Madhyam label with its same-numbered Pancham twin', () => {
    // Same step, same Sa, so the same rank — whatever letters they print.
    expect(pitchRank('1 Madhyam / F')).toBe(pitchRank('1 Pancham / C'));
    expect(pitchRank('4.5 Madhyam / B')).toBe(pitchRank('4.5 Pancham / F#'));
  });

  it('ranks by Sa, not by the letter printed on the label', () => {
    // "1 Madhyam / F" prints an F, above D — but its Sa is C, below D.
    expect(pitchRank('1 Madhyam / F')!).toBeLessThan(pitchRank('2 Pancham / D')!);
    expect(lowestPitch(['2 Pancham / D', '1 Madhyam / F'])).toBe('1 Madhyam / F');
  });

  it('ties EXACTLY when two labels are the same Sa, and never otherwise', () => {
    for (const a of ALL_LABELS) {
      for (const b of ALL_LABELS) {
        expect(pitchRank(a) === pitchRank(b), `${a} vs ${b}`).toBe(saOf(a) === saOf(b));
      }
    }
  });

  it('covers all twelve pitch classes with twelve distinct ranks', () => {
    expect(new Set(ALL_LABELS.map((l) => pitchRank(l))).size).toBe(12);
  });

  it('moves one rung per semitone along a series, wrapping at the ladder ends', () => {
    for (const series of ['Madhyam', 'Pancham'] as const) {
      const ladder = seriesLadder(ALL_LABELS, series);
      for (let i = 1; i < ladder.length; i++) {
        const dr = ((pitchRank(ladder[i])! - pitchRank(ladder[i - 1])!) % 12 + 12) % 12;
        expect(dr, `${ladder[i - 1]} -> ${ladder[i]}`).toBe(1);
      }
    }
  });

  it('picks the lower of two pitches, whichever order they arrive in', () => {
    expect(lowestPitch(['5 Pancham / G', '2 Pancham / D'])).toBe('2 Pancham / D');
    expect(lowestPitch(['2 Pancham / D', '5 Pancham / G'])).toBe('2 Pancham / D');
  });

  it('skips nulls and rubbish rather than letting them win', () => {
    expect(lowestPitch([null, '5 Pancham / G', undefined, 'nonsense'])).toBe('5 Pancham / G');
    expect(lowestPitch([null, undefined])).toBeNull();
    expect(lowestPitch([])).toBeNull();
  });

  it('returns the single candidate when there is no conflict', () => {
    expect(lowestPitch(['3 Pancham / E'])).toBe('3 Pancham / E');
  });
});

/**
 * A half-semitone offset used to produce no suggestion at all.
 *
 * The median of an even number of samples is the average of the middle two, so
 * a singer split between 0 and +1 has a median of exactly 0.5. Nothing in the
 * label table is half way between two pitches, so every candidate missed and
 * the bare-note fallback returned NOTE_NAMES[6.5] — undefined. On production,
 * 2026-08-21, that was 4 of the 27 per-raga profiles: a quarter of raga-based
 * predictions showing nothing.
 */
describe('transposeLabel with a fractional offset', () => {
  const LABELS = [
    '1 Madhyam / F', '1.5 Madhyam / F#', '2 Madhyam / G', '2.5 Madhyam / G#',
    '3 Madhyam / A', '4 Madhyam / A#', '4.5 Madhyam / B', '5 Madhyam / C',
    '5.5 Madhyam / C#', '6 Madhyam / D', '6.5 Madhyam / D#', '7 Madhyam / E',
    '1 Pancham / C', '1.5 Pancham / C#', '2 Pancham / D', '2.5 Pancham / D#',
    '3 Pancham / E', '4 Pancham / F', '4.5 Pancham / F#', '5 Pancham / G',
    '5.5 Pancham / G#', '6 Pancham / A', '6.5 Pancham / A#', '7 Pancham / B',
  ];

  it('always returns a real label, never undefined', () => {
    for (const offset of [0.5, 1.5, -0.5, -1.5, 2.5, 0.25, 0.75]) {
      const out = transposeLabel('4 Madhyam / A#', offset, LABELS);
      expect(typeof out, `offset ${offset}`).toBe('string');
      expect(LABELS, `offset ${offset}`).toContain(out);
    }
  });

  it('rounds a half DOWN, to the lower pitch — the safe side of a guess', () => {
    // Sa of 4 Madhyam / A# is F. +0.5 must not become F#.
    expect(transposeLabel('4 Madhyam / A#', 0.5, LABELS)).toBe('4 Madhyam / A#');
    expect(transposeLabel('4 Madhyam / A#', 1.5, LABELS)).toBe('4.5 Madhyam / B');
    expect(transposeLabel('4 Madhyam / A#', -0.5, LABELS)).toBe('3 Madhyam / A');
  });

  it('leaves whole offsets exactly as they were', () => {
    expect(transposeLabel('4 Madhyam / A#', 0, LABELS)).toBe('4 Madhyam / A#');
    expect(transposeLabel('4 Madhyam / A#', 1, LABELS)).toBe('4.5 Madhyam / B');
    expect(transposeLabel('4 Madhyam / A#', -1, LABELS)).toBe('3 Madhyam / A');
    expect(transposeLabel('1 Pancham / C', 2, LABELS)).toBe('2 Pancham / D');
  });

  it('stays in the reference series, so the group reads its own vocabulary', () => {
    expect(transposeLabel('4 Madhyam / A#', 1, LABELS)).toMatch(/Madhyam/);
    expect(transposeLabel('1 Pancham / C', 1, LABELS)).toMatch(/Pancham/);
  });
});

/**
 * A programme item's pitch is a bare note, so stepping it is a different
 * operation from stepping a shruti label — no step number, no series.
 */
describe('stepNote', () => {
  it('steps up and down by whole semitones', () => {
    expect(stepNote('F', 1)).toBe('F#');
    expect(stepNote('F', -1)).toBe('E');
    expect(stepNote('C', 2)).toBe('D');
    expect(stepNote('A#', 1)).toBe('B');
  });

  it('wraps round the octave, because everything downstream is a pitch class', () => {
    expect(stepNote('B', 1)).toBe('C');
    expect(stepNote('C', -1)).toBe('B');
    expect(stepNote('C', 12)).toBe('C');
    expect(stepNote('C', -13)).toBe('B');
  });

  it('reads a note however it was typed, and rounds a fractional step', () => {
    expect(stepNote(' f# ', 0)).toBe('F#');
    expect(stepNote('f', 1)).toBe('F#');
    expect(stepNote('F', 0.5)).toBe('F#');
  });

  it('is null for anything that is not one of the twelve notes', () => {
    expect(stepNote(null, 1)).toBeNull();
    expect(stepNote('', 1)).toBeNull();
    expect(stepNote('H', 1)).toBeNull();
    // A full shruti label belongs to transposeLabel, not here.
    expect(stepNote('2 Pancham / D', 1)).toBeNull();
  });
});
