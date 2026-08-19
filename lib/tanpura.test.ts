import { describe, it, expect } from 'vitest';
import {
  TANPURA_BASE_NOTES,
  noteSlug,
  tanpuraSrc,
  allTanpuraSrcs,
  shortestShift,
  nearestSample,
  tanpuraVoice,
  saOfAnyPitch,
} from './tanpura';
import { NOTE_NAMES, saOf } from './pitch';

/**
 * The 24 labels the group actually uses. Copied from lib/pitch.test.ts so this
 * file fails on its own terms if the tanpura maths stops covering the real set.
 */
const ALL_LABELS = [
  '1 Madhyam / F', '1.5 Madhyam / F#', '2 Madhyam / G', '2.5 Madhyam / G#',
  '3 Madhyam / A', '3.5 Madhyam / A#', '4 Madhyam / B', '4.5 Madhyam / C',
  '5 Madhyam / C#', '5.5 Madhyam / D', '6 Madhyam / D#', '6.5 Madhyam / E',
  '1 Pancham / C', '1.5 Pancham / C#', '2 Pancham / D', '2.5 Pancham / D#',
  '3 Pancham / E', '3.5 Pancham / F', '4 Pancham / F#', '4.5 Pancham / G',
  '5 Pancham / G#', '5.5 Pancham / A', '6 Pancham / A#', '6.5 Pancham / B',
];

describe('noteSlug / tanpuraSrc', () => {
  it('spells out the sharp, because # would start a URL fragment', () => {
    expect(noteSlug('D#')).toBe('d-sharp');
    expect(noteSlug('C')).toBe('c');
    expect(tanpuraSrc('Pancham', 'D#')).toBe('/audio/tanpura/pancham-d-sharp.wav');
    expect(tanpuraSrc('Madhyam', 'A')).toBe('/audio/tanpura/madhyam-a.wav');
  });

  it('never emits a # or a space in an asset path', () => {
    for (const src of allTanpuraSrcs()) {
      expect(src).not.toMatch(/[#\s]/);
      expect(src).toBe(encodeURI(src));
    }
  });

  it('lists one recording per declared base note', () => {
    const expected =
      TANPURA_BASE_NOTES.Madhyam.length + TANPURA_BASE_NOTES.Pancham.length;
    expect(allTanpuraSrcs()).toHaveLength(expected);
    expect(new Set(allTanpuraSrcs()).size).toBe(expected);
  });

  it('is uncompressed, so the loop point has no codec padding in it', () => {
    for (const src of allTanpuraSrcs()) expect(src.endsWith('.wav')).toBe(true);
  });
});

describe('shortestShift', () => {
  it('wraps to [-6, +6] like semitoneDelta does', () => {
    expect(shortestShift(0, 1)).toBe(1);
    expect(shortestShift(0, 11)).toBe(-1);
    expect(shortestShift(0, 6)).toBe(6);
    expect(shortestShift(0, 7)).toBe(-5);
    expect(shortestShift(9, 0)).toBe(3);
  });

  it('is zero for the same pitch class', () => {
    for (let i = 0; i < 12; i++) expect(shortestShift(i, i)).toBe(0);
  });
});

describe('nearestSample', () => {
  it('picks the recording itself when one sits on the target', () => {
    for (const note of TANPURA_BASE_NOTES.Pancham) {
      const got = nearestSample('Pancham', NOTE_NAMES.indexOf(note));
      expect(got).toEqual({ note, detune: 0 });
    }
  });

  it('holds Pancham — the common case — inside two semitones', () => {
    // 626 of the group's 688 sung pitches are Pancham, so this is the bound
    // that matters. Four recordings at A, C, E, F#.
    for (let semitone = 0; semitone < 12; semitone++) {
      const got = nearestSample('Pancham', semitone);
      expect(got).not.toBeNull();
      expect(Math.abs(got!.detune), `Pancham ${semitone}`).toBeLessThanOrEqual(2);
    }
  });

  it('holds Madhyam inside four semitones, the price of only two recordings', () => {
    // Documented rather than hidden: the Madhyam tuning exists at F# and A
    // only, so the far side of the circle is stretched. Adding recordings near
    // C and D# would bring this to 2 — this bound is what to tighten then.
    for (let semitone = 0; semitone < 12; semitone++) {
      const got = nearestSample('Madhyam', semitone);
      expect(got).not.toBeNull();
      expect(Math.abs(got!.detune), `Madhyam ${semitone}`).toBeLessThanOrEqual(4);
    }
  });

  it('always picks a recording at the minimum distance available', () => {
    for (const series of ['Madhyam', 'Pancham'] as const) {
      for (let semitone = 0; semitone < 12; semitone++) {
        const winner = nearestSample(series, semitone)!;
        const best = Math.min(
          ...TANPURA_BASE_NOTES[series].map((note) =>
            Math.abs(shortestShift(NOTE_NAMES.indexOf(note), semitone)),
          ),
        );
        expect(Math.abs(winner.detune), `${series} ${semitone}`).toBe(best);
      }
    }
  });

  it('breaks a tie upward, preferring to speed a recording up', () => {
    // D (2) is a genuine tie in Pancham: two above C, two below E. A tanpura
    // shifted up keeps its buzz better than one dragged down, so C wins.
    expect(nearestSample('Pancham', NOTE_NAMES.indexOf('D'))).toEqual({
      note: 'C',
      detune: 2,
    });
  });

  it('shifts down by one for B, the nearest recording being C above it', () => {
    expect(nearestSample('Pancham', NOTE_NAMES.indexOf('B'))).toEqual({
      note: 'C',
      detune: -1,
    });
  });
});

describe('tanpuraVoice', () => {
  it('returns null when there is no parseable note', () => {
    expect(tanpuraVoice(null)).toBeNull();
    expect(tanpuraVoice(undefined)).toBeNull();
    expect(tanpuraVoice('')).toBeNull();
    expect(tanpuraVoice('not a pitch')).toBeNull();
    expect(tanpuraVoice('2 Pancham')).toBeNull();
  });

  it('sounds every one of the 24 labels', () => {
    for (const label of ALL_LABELS) {
      const voice = tanpuraVoice(label);
      expect(voice, label).not.toBeNull();
      expect(voice!.targetSemitone).toBe(saOf(label));
      expect(voice!.src).toMatch(/^\/audio\/tanpura\/(madhyam|pancham)-/);
    }
  });

  it('honours CLAUDE.md rule 2: the series never changes Sa', () => {
    // Same note, two series. Same Sa, different recording.
    const madhyam = tanpuraVoice('1 Madhyam / F')!;
    const pancham = tanpuraVoice('3.5 Pancham / F')!;
    expect(madhyam.targetSemitone).toBe(pancham.targetSemitone);
    expect(madhyam.note).toBe(pancham.note);
    expect(madhyam.series).toBe('Madhyam');
    expect(pancham.series).toBe('Pancham');
    expect(madhyam.src).not.toBe(pancham.src);
  });

  it('picks the series recording from the label', () => {
    expect(tanpuraVoice('1 Madhyam / F')!.src).toContain('madhyam-');
    expect(tanpuraVoice('2 Pancham / D')!.src).toContain('pancham-');
  });

  it('falls back to Pancham when the series is unreadable but the note is not', () => {
    // saOf is deliberately lenient — a broken step or series still has a Sa.
    const voice = tanpuraVoice('?? wobble / G')!;
    expect(voice.series).toBe('Pancham');
    expect(voice.note).toBe('G');
  });

  it('converts detune to playback rate in equal temperament', () => {
    for (const label of ALL_LABELS) {
      const v = tanpuraVoice(label)!;
      expect(v.playbackRate).toBeCloseTo(Math.pow(2, v.detune / 12), 10);
    }
    // A semitone up is ~5.95% faster; a semitone down ~5.61% slower.
    expect(Math.pow(2, 1 / 12)).toBeCloseTo(1.0594631, 6);
  });

  it('keeps playback rate inside a range a drone survives', () => {
    // +-4 semitones is 0.794 to 1.26. Nothing may exceed that.
    for (const label of ALL_LABELS) {
      const v = tanpuraVoice(label)!;
      expect(v.playbackRate, label).toBeGreaterThan(0.79);
      expect(v.playbackRate, label).toBeLessThan(1.27);
    }
  });

  it('lands on the pitch it promises', () => {
    // The whole point: base Sa shifted by detune must equal target Sa.
    for (const label of ALL_LABELS) {
      const v = tanpuraVoice(label)!;
      expect((((v.baseSemitone + v.detune) % 12) + 12) % 12).toBe(v.targetSemitone);
    }
  });
});

describe('bare notes, as programmes write them', () => {
  it('reads a bare note, which saOf alone cannot', () => {
    expect(saOf('A#')).toBeNull();
    expect(saOfAnyPitch('A#')).toBe(10);
    expect(saOfAnyPitch('c')).toBe(0);
    expect(saOfAnyPitch(' F# ')).toBe(6);
  });

  it('still prefers the label form when a slash is present', () => {
    expect(saOfAnyPitch('2 Pancham / D')).toBe(saOf('2 Pancham / D'));
  });

  it('rejects things that are not notes', () => {
    for (const bad of ['H', 'Db', '', null, undefined, 'A# B', '2 Pancham']) {
      expect(saOfAnyPitch(bad as string | null)).toBeNull();
    }
  });

  it('plays a programme pitch, defaulting to the Pancham tanpura', () => {
    const voice = tanpuraVoice('A#')!;
    expect(voice).not.toBeNull();
    expect(voice.note).toBe('A#');
    expect(voice.series).toBe('Pancham');
    expect(voice.src).toContain('pancham-');
  });

  it('covers all twelve bare notes', () => {
    for (const note of NOTE_NAMES) {
      const voice = tanpuraVoice(note);
      expect(voice, note).not.toBeNull();
      expect(voice!.note).toBe(note);
    }
  });
});
