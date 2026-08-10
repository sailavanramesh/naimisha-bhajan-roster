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
  it('reads Sa from the note letter after the slash', () => {
    expect(saOf('2 Pancham / D')).toBe(PITCH_CLASS.D);
    expect(saOf('1 Madhyam / F')).toBe(PITCH_CLASS.F);
    expect(saOf('1.5 Pancham / C#')).toBe(PITCH_CLASS['C#']);
  });

  it('treats Madhyam and Pancham as the same pitch (CLAUDE.md rule 2)', () => {
    expect(saOf('1 Madhyam / F')).toBe(saOf('4 Pancham / F'));
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

  it('splits step, series and note', () => {
    expect(parsePitchLabel('2.5 Madhyam / G#')).toMatchObject({
      step: 2.5,
      series: 'Madhyam',
      note: 'G#',
      semitone: PITCH_CLASS['G#'],
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
  it('is zero for identical pitches regardless of series', () => {
    expect(semitoneDelta('1 Madhyam / F', '4 Pancham / F')).toBe(0);
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
  it('is Sa + 7 semitones for all 24 labels in the lookup table', () => {
    for (const [label, expectedTabla] of LOOKUP) {
      expect(tablaPitchOf(label), label).toBe(expectedTabla);
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
