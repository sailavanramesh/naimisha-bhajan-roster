import { describe, it, expect } from 'vitest';
import { suggestPitch } from './suggestedPitch';

describe('suggestPitch', () => {
  it('uses the pitch on their list when that is all there is', () => {
    const r = suggestPitch({ listPitch: '2 Pancham / D' });
    expect(r).toMatchObject({ pitch: '2 Pancham / D', source: 'list', conflicted: false });
  });

  it('uses what they have sung it at when there is no list entry', () => {
    const r = suggestPitch({ sungPitches: ['5 Pancham / G'] });
    expect(r).toMatchObject({ pitch: '5 Pancham / G', source: 'sung', conflicted: false });
  });

  it('takes the LOWER when the list and their history disagree', () => {
    const r = suggestPitch({ listPitch: '5 Pancham / G', sungPitches: ['2 Pancham / D'] });
    expect(r.pitch).toBe('2 Pancham / D');
    expect(r.source).toBe('sung');
    expect(r.conflicted).toBe(true);
    expect(r.considered).toEqual(['5 Pancham / G', '2 Pancham / D']);
  });

  it('takes the lower across several sung pitches', () => {
    const r = suggestPitch({ sungPitches: ['5 Pancham / G', '3 Pancham / E', '6 Pancham / A'] });
    expect(r.pitch).toBe('3 Pancham / E');
    expect(r.conflicted).toBe(true);
  });

  it('does NOT call two names for the same Sa a conflict', () => {
    // Same step number, so one pitch under two names (CLAUDE.md rule 2):
    // 1 Madhyam / F is Sa C with F droning, 1 Pancham / C is Sa C with G.
    const r = suggestPitch({ listPitch: '1 Madhyam / F', sungPitches: ['1 Pancham / C'] });
    expect(r.conflicted).toBe(false);
    expect(r.pitch).toBe('1 Madhyam / F');
  });

  it('DOES call the same letter in two series a conflict, because it is not one pitch', () => {
    // 1 Madhyam / F is Sa C; 4 Pancham / F is Sa F. A fourth apart.
    const r = suggestPitch({ listPitch: '1 Madhyam / F', sungPitches: ['4 Pancham / F'] });
    expect(r.conflicted).toBe(true);
  });

  it('prefers anything real over a prediction', () => {
    const r = suggestPitch({ sungPitches: ['6 Pancham / A'], predicted: '2 Pancham / D' });
    expect(r).toMatchObject({ pitch: '6 Pancham / A', source: 'sung' });
  });

  it('falls back to the prediction when they have never sung it', () => {
    const r = suggestPitch({ predicted: '2 Pancham / D', reference: '1 Pancham / C' });
    expect(r).toMatchObject({ pitch: '2 Pancham / D', source: 'predicted', conflicted: false });
  });

  it('falls back to the bare reference when there is no prediction either', () => {
    const r = suggestPitch({ reference: '1 Pancham / C' });
    expect(r).toMatchObject({ pitch: '1 Pancham / C', source: 'reference' });
  });

  it('returns nothing when it knows nothing', () => {
    expect(suggestPitch({})).toMatchObject({ pitch: null, source: 'none' });
  });

  it('ignores blanks and unparseable labels rather than choosing them', () => {
    const r = suggestPitch({ listPitch: '  ', sungPitches: [null, '', 'not a pitch', '4 Pancham / F'] });
    expect(r).toMatchObject({ pitch: '4 Pancham / F', source: 'sung', conflicted: false });
  });

  it('never lets a blank look like the bottom of the ladder', () => {
    const r = suggestPitch({ listPitch: '', sungPitches: ['5 Pancham / G'] });
    expect(r.pitch).toBe('5 Pancham / G');
  });

  it('deduplicates identical strings before deciding there is a conflict', () => {
    const r = suggestPitch({ sungPitches: ['2 Pancham / D', '2 Pancham / D'] });
    expect(r.conflicted).toBe(false);
  });
});
