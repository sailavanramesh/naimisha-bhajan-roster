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
  soundingSa,
} from './tanpura';
import { NOTE_NAMES, saOf } from './pitch';

/**
 * The 24 labels the group actually uses. Copied from lib/pitch.test.ts so this
 * file fails on its own terms if the tanpura maths stops covering the real set.
 */
const ALL_LABELS = [
  '1 Madhyam / F', '1.5 Madhyam / F#', '2 Madhyam / G', '2.5 Madhyam / G#',
  '3 Madhyam / A', '4 Madhyam / A#', '4.5 Madhyam / B', '5 Madhyam / C',
  '5.5 Madhyam / C#', '6 Madhyam / D', '6.5 Madhyam / D#', '7 Madhyam / E',
  '1 Pancham / C', '1.5 Pancham / C#', '2 Pancham / D', '2.5 Pancham / D#',
  '3 Pancham / E', '4 Pancham / F', '4.5 Pancham / F#', '5 Pancham / G',
  '5.5 Pancham / G#', '6 Pancham / A', '6.5 Pancham / A#', '7 Pancham / B',
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
      // Sa as SOUNDED, which for Madhyam is a fourth below the written note.
      expect(voice!.targetSemitone).toBe(soundingSa(label));
      expect(voice!.src).toMatch(/^\/audio\/tanpura\/(madhyam|pancham)-/);
    }
  });

  it('sounds the same Sa for the same STEP in either series', () => {
    // The correction, stated as the group states it: a step number is one Sa,
    // and the series only decides what drones against it.
    for (const [madhyam, pancham] of [
      ['1 Madhyam / F', '1 Pancham / C'],
      ['4.5 Madhyam / B', '4.5 Pancham / F#'],
      ['7 Madhyam / E', '7 Pancham / B'],
      ['2.5 Madhyam / G#', '2.5 Pancham / D#'],
    ]) {
      const m = tanpuraVoice(madhyam)!;
      const p = tanpuraVoice(pancham)!;
      expect(m.targetSemitone, `${madhyam} vs ${pancham}`).toBe(p.targetSemitone);
      expect(m.series).toBe('Madhyam');
      expect(p.series).toBe('Pancham');
    }
  });

  it('sounds 4.5 Madhyam / B at F#, with B as its Ma', () => {
    // The case Sailavan reported: it used to sound B, a fourth too high.
    const v = tanpuraVoice('4.5 Madhyam / B')!;
    expect(v.note).toBe('F#');
    expect(v.series).toBe('Madhyam');
    // Ma is a perfect fourth above Sa, and is the note the label prints.
    expect(NOTE_NAMES[(v.targetSemitone + 5) % 12]).toBe('B');
  });

  it('sounds 1.5 Madhyam / F# at C#, with F# as its Ma', () => {
    const v = tanpuraVoice('1.5 Madhyam / F#')!;
    expect(v.note).toBe('C#');
    expect(NOTE_NAMES[(v.targetSemitone + 5) % 12]).toBe('F#');
  });

  it('leaves Pancham alone — the written note is already Sa', () => {
    const v = tanpuraVoice('4.5 Pancham / F#')!;
    expect(v.note).toBe('F#');
    // Pa, a fifth above, is what drones against it.
    expect(NOTE_NAMES[(v.targetSemitone + 7) % 12]).toBe('C#');
  });

  it('agrees with the rest of the app about Sa', () => {
    // The Madhyam correction moved into lib/pitch.ts on 2026-08-20, so the
    // drone, the ladder, the deviations and the tabla panel now read one Sa.
    for (const label of ALL_LABELS) {
      expect(soundingSa(label), label).toBe(saOf(label));
    }
    expect(soundingSa('4.5 Madhyam / B')).toBe(NOTE_NAMES.indexOf('F#'));
  });

  it('picks the series recording from the label', () => {
    expect(tanpuraVoice('1 Madhyam / F')!.src).toContain('madhyam-');
    expect(tanpuraVoice('2 Pancham / D')!.src).toContain('pancham-');
  });

  it('sounds every Madhyam label a fourth below the note printed on it', () => {
    for (const label of ALL_LABELS.filter((l) => /madhyam/i.test(l))) {
      const printed = NOTE_NAMES.indexOf(
        /\/\s*([A-G]#?)\s*$/.exec(label)![1] as (typeof NOTE_NAMES)[number],
      );
      expect(tanpuraVoice(label)!.targetSemitone, label).toBe((printed - 5 + 12) % 12);
    }
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

describe('what a one-semitone nudge does to playback', () => {
  /**
   * Nudging moves the label by a semitone while the drone is running. Whether
   * that can glide (same recording, ramp the rate) or must crossfade (a
   * different recording) falls out of where the base notes sit. Documented
   * because it is the difference between one continuous sound and two
   * overlapping ones, and the engine picks between them on this basis alone.
   */
  it('mostly glides, and crosses recordings only at the boundaries', () => {
    const glides: string[] = [];
    const crossings: string[] = [];

    for (let semitone = 0; semitone < 12; semitone++) {
      const from = tanpuraVoice(NOTE_NAMES[semitone])!;
      const to = tanpuraVoice(NOTE_NAMES[(semitone + 1) % 12])!;
      (from.src === to.src ? glides : crossings).push(
        `${NOTE_NAMES[semitone]}->${NOTE_NAMES[(semitone + 1) % 12]}`,
      );
    }

    // Four recordings across twelve semitones: four steps must cross, and they
    // are the ones that land on a new nearest recording.
    expect(glides.length + crossings.length).toBe(12);
    expect(crossings.length).toBe(4);
    expect(glides.length).toBe(8);
  });

  it('never crosses recordings when it does not have to', () => {
    // Any step landing on a note whose nearest recording is unchanged must
    // glide — a crossfade there would be two sounds where one would do.
    for (let semitone = 0; semitone < 12; semitone++) {
      const a = NOTE_NAMES[semitone];
      const b = NOTE_NAMES[(semitone + 1) % 12];
      const from = nearestSample('Pancham', semitone)!;
      const to = nearestSample('Pancham', (semitone + 1) % 12)!;
      const sameRecording = tanpuraVoice(a)!.src === tanpuraVoice(b)!.src;
      expect(sameRecording, `${a}->${b}`).toBe(from.note === to.note);
    }
  });
});
