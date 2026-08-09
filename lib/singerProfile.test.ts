import { describe, it, expect } from 'vitest';
import {
  referenceFor,
  offsetFor,
  comfortBand,
  buildSingerProfile,
  buildAllProfiles,
  predictForSinger,
  isOutsideComfort,
  MIN_RAGA_SAMPLES,
  type SungRow,
} from './singerProfile';

const LABELS = [
  '1 Madhyam / F', '1 Pancham / C', '1.5 Madhyam / F#', '1.5 Pancham / C#',
  '2 Madhyam / G', '2 Pancham / D', '2.5 Madhyam / G#', '2.5 Pancham / D#',
  '3 Madhyam / A', '3 Pancham / E', '4 Madhyam / A#', '4 Pancham / F',
  '4.5 Madhyam / B', '4.5 Pancham / F#', '5 Madhyam / C', '5 Pancham / G',
  '5.5 Madhyam / C#', '5.5 Pancham / G#', '6 Madhyam / D', '6 Pancham / A',
  '6.5 Madhyam / D#', '6.5 Pancham / A#', '7 Madhyam / E', '7 Pancham / B',
];

function row(over: Partial<SungRow> = {}): SungRow {
  return {
    singerName: 'Test',
    gender: 'Gents',
    confirmedPitch: '1 Pancham / C',
    historicalRecommendedPitch: '1 Pancham / C',
    masterlistReference: '1 Pancham / C',
    bhajanId: 'b1',
    bhajanTitle: 'A bhajan',
    raga: 'Kalyani / Yaman',
    date: new Date('2026-01-01'),
    ...over,
  };
}

describe('referenceFor', () => {
  it('prefers the recorded recommendation', () => {
    expect(referenceFor(row({
      historicalRecommendedPitch: '2 Pancham / D',
      masterlistReference: '1 Pancham / C',
    }))).toBe('2 Pancham / D');
  });

  it('falls back to the masterlist reference', () => {
    expect(referenceFor(row({
      historicalRecommendedPitch: null,
      masterlistReference: '1 Pancham / C',
    }))).toBe('1 Pancham / C');
  });

  it('is null when neither exists', () => {
    expect(referenceFor(row({ historicalRecommendedPitch: null, masterlistReference: null }))).toBeNull();
  });
});

describe('offsetFor', () => {
  it('measures the confirmed pitch against the reference', () => {
    expect(offsetFor(row({
      confirmedPitch: '2 Pancham / D',
      historicalRecommendedPitch: '1 Pancham / C',
    }))).toBe(2);
  });

  it('is null without a confirmed pitch', () => {
    expect(offsetFor(row({ confirmedPitch: null }))).toBeNull();
  });
});

describe('comfortBand', () => {
  it('is null with no data', () => {
    expect(comfortBand([])).toBeNull();
  });

  it('collapses to a point when every observation is the same', () => {
    const band = comfortBand([7, 7, 7, 7])!;
    expect(band.low).toBe(7);
    expect(band.high).toBe(7);
    expect(band.width).toBe(0);
    expect(band.centreNote).toBe('G');
  });

  it('does not blow up across the B/C boundary', () => {
    // Eleven at B (11) and one at C (0). These are adjacent semitones, so the
    // band must be narrow — a naive percentile over 0..11 would report ~11.
    const band = comfortBand([11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 0])!;
    expect(band.centre).toBe(11);
    expect(band.width).toBeLessThanOrEqual(1);
  });

  it('reports the band in absolute pitch classes', () => {
    const band = comfortBand([5, 5, 5, 5, 6, 6, 7, 7, 7, 7])!;
    expect(band.n).toBe(10);
    expect(band.lowNote).toBe('F');
    expect(band.highNote).toBe('G');
  });
});

describe('buildSingerProfile', () => {
  it('computes the overall offset profile', () => {
    const rows = [
      row({ confirmedPitch: '2 Pancham / D' }),  // +2
      row({ confirmedPitch: '1.5 Pancham / C#' }), // +1
      row({ confirmedPitch: '1.5 Pancham / C#' }), // +1
    ];
    const p = buildSingerProfile('Test', rows);
    expect(p.overall.n).toBe(3);
    expect(p.overall.median).toBe(1);
    expect(p.offsets).toEqual([2, 1, 1]);
  });

  it('skips rows that cannot produce an offset', () => {
    const p = buildSingerProfile('Test', [
      row({ confirmedPitch: '2 Pancham / D' }),
      row({ confirmedPitch: null }),
      row({ historicalRecommendedPitch: null, masterlistReference: null }),
    ]);
    expect(p.overall.n).toBe(1);
  });

  it('builds a per-raga profile only above the sample threshold', () => {
    const many = Array.from({ length: MIN_RAGA_SAMPLES }, () =>
      row({ raga: 'Kalyani / Yaman', confirmedPitch: '1.5 Pancham / C#' }));
    const few = Array.from({ length: MIN_RAGA_SAMPLES - 1 }, () =>
      row({ raga: 'Bhairavi', confirmedPitch: '2 Pancham / D' }));
    const p = buildSingerProfile('Test', [...many, ...few]);
    expect(p.byRaga.has('Kalyani / Yaman')).toBe(true);
    expect(p.byRaga.has('Bhairavi')).toBe(false);
    expect(p.byRaga.get('Kalyani / Yaman')!.median).toBe(1);
  });

  it('ignores blank ragas', () => {
    const p = buildSingerProfile('Test', Array.from({ length: 8 }, () => row({ raga: '  ' })));
    expect(p.byRaga.size).toBe(0);
  });

  it('carries the gender through', () => {
    expect(buildSingerProfile('Test', [row({ gender: 'Ladies' })]).gender).toBe('Ladies');
  });
});

describe('buildAllProfiles', () => {
  it('groups by singer', () => {
    const all = buildAllProfiles([
      row({ singerName: 'Prithvi', confirmedPitch: '2 Pancham / D' }),
      row({ singerName: 'Prithvi', confirmedPitch: '2 Pancham / D' }),
      row({ singerName: 'Anvita', confirmedPitch: '1 Pancham / C' }),
    ]);
    expect([...all.keys()].sort()).toEqual(['Anvita', 'Prithvi']);
    expect(all.get('Prithvi')!.overall.n).toBe(2);
    expect(all.get('Anvita')!.overall.median).toBe(0);
  });
});

describe('predictForSinger', () => {
  const confident = buildSingerProfile('Test', Array.from({ length: 20 }, () =>
    row({ confirmedPitch: '1.5 Pancham / C#', raga: null })));   // +1 overall
  const thin = buildSingerProfile('Test', [row({ confirmedPitch: '1.5 Pancham / C#' })]);

  it('applies the overall median when there is no raga profile', () => {
    const p = predictForSinger(confident, '1 Pancham / C', null, LABELS);
    expect(p).toMatchObject({ label: '1.5 Pancham / C#', predicted: true, basis: 'overall', offset: 1 });
  });

  it('prefers a raga-specific profile when one is confident', () => {
    const profile = buildSingerProfile('Test', [
      ...Array.from({ length: 20 }, () => row({ confirmedPitch: '1.5 Pancham / C#', raga: null })),
      ...Array.from({ length: 8 }, () => row({ confirmedPitch: '2 Pancham / D', raga: 'Bhairavi' })),
    ]);
    const p = predictForSinger(profile, '1 Pancham / C', 'Bhairavi', LABELS);
    expect(p.basis).toBe('raga');
    expect(p.offset).toBe(2);
    expect(p.label).toBe('2 Pancham / D');
  });

  it('returns the bare reference when history is too thin', () => {
    const p = predictForSinger(thin, '1 Pancham / C', null, LABELS);
    expect(p).toMatchObject({ label: '1 Pancham / C', predicted: false, basis: 'reference', offset: 0 });
  });

  it('returns the reference unchanged when there is no profile at all', () => {
    const p = predictForSinger(undefined, '1 Pancham / C', null, LABELS);
    expect(p).toMatchObject({ label: '1 Pancham / C', predicted: false, basis: 'reference' });
  });

  it('never invents a pitch without a reference', () => {
    expect(predictForSinger(confident, null, null, LABELS).label).toBeNull();
    expect(predictForSinger(confident, '   ', null, LABELS).label).toBeNull();
  });

  it('preserves the series of the reference', () => {
    const p = predictForSinger(confident, '1 Madhyam / F', null, LABELS);
    expect(p.label).toBe('1.5 Madhyam / F#');
  });
});

describe('isOutsideComfort', () => {
  const band = comfortBand([5, 5, 5, 5, 6, 6, 7, 7, 7, 7])!; // F..G

  it('accepts a pitch inside the band', () => {
    expect(isOutsideComfort(band, '4 Pancham / F')).toBe(false);
    expect(isOutsideComfort(band, '5 Pancham / G')).toBe(false);
  });

  it('flags a pitch below the band', () => {
    expect(isOutsideComfort(band, '3 Pancham / E')).toBe(true);
  });

  it('flags a pitch above the band', () => {
    expect(isOutsideComfort(band, '6 Pancham / A')).toBe(true);
  });

  it('is silent when there is no band or no pitch', () => {
    expect(isOutsideComfort(null, '3 Pancham / E')).toBe(false);
    expect(isOutsideComfort(band, null)).toBe(false);
  });
});
