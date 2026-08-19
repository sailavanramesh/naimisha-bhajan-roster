/**
 * lib/tanpura.ts — choosing which tanpura recording to play, and how far to
 * detune it, for a given shruti label.
 *
 * Pure. No Web Audio, no DOM, no I/O — so the maths is testable without a
 * browser and the engine in `components/ShrutiPlayer.tsx` stays a thin shell.
 *
 * ## How this sits with the pitch model
 *
 * CLAUDE.md rule 2 says Madhyam vs Pancham is display metadata and does not
 * change the pitch. That stays exactly true here: Sa is read by `saOf`, from
 * the note after the slash, and nothing else. `1 Madhyam / F` and
 * `4 Pancham / F` sound at the same Sa, as they must.
 *
 * What the series DOES pick is which accompanying string the tanpura sounds
 * against that Sa — Ma in the Madhyam tuning, Pa in the Pancham tuning. That
 * is what the shruti box does with the same setting, and it is the whole
 * reason the group writes the series down. So the series selects the
 * RECORDING; the note selects the PITCH. Rule 2 is untouched: no label is ever
 * converted to the other series, and the two series never disagree about Sa.
 *
 * ## Why nearest-sample-plus-detune
 *
 * A tanpura sample played back at a different rate shifts pitch and duration
 * together, and stops sounding like a tanpura once it is stretched far — the
 * jivari buzz smears. So we ship several recordings per series and always pick
 * the closest one, leaving only a small correction.
 *
 * The base notes are a CONSTANT here, not a code assumption: `nearestSample`
 * works for any set from one recording upward, so adding recordings later
 * narrows the worst-case detune without a code change. With the four base
 * notes below, nothing is ever shifted more than 1.5 semitones.
 */

import { saOf, PITCH_CLASS, NOTE_NAMES, type NoteName, type Series } from './pitch';

/**
 * The Sa notes we hold recordings at, per series.
 *
 * Four, evenly spaced three semitones apart, so the worst case is a 1.5
 * semitone correction in either direction — about 9% of playback rate, which a
 * drone carries without obvious artefacts.
 *
 * Both series list the same notes. They need not: `nearestSample` reads
 * whatever each series declares, so a series with more recordings simply gets
 * better coverage.
 */
export const TANPURA_BASE_NOTES: Readonly<Record<Series, readonly NoteName[]>> = {
  Madhyam: ['C', 'D#', 'F#', 'A'],
  Pancham: ['C', 'D#', 'F#', 'A'],
};

/** Where the recordings live, relative to the site root. */
export const TANPURA_DIR = '/audio/tanpura';

/**
 * Filename-safe form of a note: `D#` -> `d-sharp`.
 *
 * Spelled out rather than kept as `#` because a `#` in a URL starts the
 * fragment, so `/audio/tanpura/pancham-D#.mp3` would request
 * `/audio/tanpura/pancham-D` and 404.
 */
export function noteSlug(note: NoteName): string {
  return note.toLowerCase().replace('#', '-sharp');
}

/** The asset path for one recording, e.g. `/audio/tanpura/pancham-d-sharp.mp3`. */
export function tanpuraSrc(series: Series, note: NoteName): string {
  return `${TANPURA_DIR}/${series.toLowerCase()}-${noteSlug(note)}.mp3`;
}

/** Every recording the app expects to exist. Used by the asset check script. */
export function allTanpuraSrcs(): string[] {
  return (Object.keys(TANPURA_BASE_NOTES) as Series[]).flatMap((series) =>
    TANPURA_BASE_NOTES[series].map((note) => tanpuraSrc(series, note)),
  );
}

/**
 * A pitch written as a bare note, with no series and no slash: `A#`.
 *
 * This is how ProgramItem stores pitch — see the note on `pitchNote` in
 * schema.prisma, which says "Programs record pitch as the note alone". The
 * schema comment points at a `saOfNote` in lib/pitch.ts for reading it, but no
 * such function exists in the repo, so `saOf` (which requires the slash)
 * returns null for every programme pitch. Hence this.
 */
const BARE_NOTE_RE = /^\s*([A-G]#?)\s*$/i;

/**
 * Sa from either spelling: a full shruti label, or a bare note.
 *
 * Tries the label form FIRST, so nothing about rule 1 changes for the labels
 * that have a slash — a bare note is only ever a fallback for the programme
 * side, never a second way to read a label.
 */
export function saOfAnyPitch(value?: string | null): number | null {
  const fromLabel = saOf(value);
  if (fromLabel !== null) return fromLabel;

  const m = BARE_NOTE_RE.exec((value ?? '').trim());
  if (!m) return null;
  const semitone = PITCH_CLASS[m[1].toUpperCase() as NoteName];
  return semitone === undefined ? null : semitone;
}

export type TanpuraVoice = {
  /** The recording to play. */
  src: string;
  series: Series;
  /** Sa of the chosen recording, as a pitch class. */
  baseSemitone: number;
  /** Sa we actually want, as a pitch class. */
  targetSemitone: number;
  /** Sa we actually want, as a note name — for labelling the control. */
  note: NoteName;
  /** Semitones to shift the recording, wrapped to [-6, +6]. */
  detune: number;
  /**
   * What to set on `AudioBufferSourceNode.playbackRate`.
   *
   * Equal temperament: one semitone is a factor of 2^(1/12).
   */
  playbackRate: number;
};

/**
 * Shortest chromatic distance from `from` to `to`, wrapped to [-6, +6].
 *
 * The same wrap `semitoneDelta` uses, but over pitch classes we already hold
 * as numbers rather than over two labels to parse.
 */
export function shortestShift(from: number, to: number): number {
  const d = (((to - from) % 12) + 12) % 12;
  return d > 6 ? d - 12 : d;
}

/**
 * The base recording closest to `semitone` for a series, and the shift needed.
 *
 * Ties — a target exactly between two recordings, possible only with an even
 * spacing — go to the LOWER shift, i.e. we prefer speeding a recording up. A
 * tanpura shifted up keeps its buzz better than one dragged down, which starts
 * to sound like a slack string.
 */
export function nearestSample(
  series: Series,
  semitone: number,
): { note: NoteName; detune: number } | null {
  const bases = TANPURA_BASE_NOTES[series];
  if (!bases || bases.length === 0) return null;

  let best: { note: NoteName; detune: number } | null = null;
  for (const note of bases) {
    const detune = shortestShift(NOTE_NAMES.indexOf(note), semitone);
    if (
      best === null ||
      Math.abs(detune) < Math.abs(best.detune) ||
      (Math.abs(detune) === Math.abs(best.detune) && detune > best.detune)
    ) {
      best = { note, detune };
    }
  }
  return best;
}

/**
 * Everything needed to sound one shruti label.
 *
 * Returns null when the label has no parseable note — the same "we do not
 * know" the rest of the pitch code returns, so a missing or malformed pitch
 * simply shows no play control rather than playing something wrong.
 *
 * Accepts a full shruti label (`2 Pancham / D`) or a bare note (`D`), because
 * the roster writes the first and a programme item writes the second. A label
 * with a malformed step or series still plays, because `saOf` is deliberately
 * lenient about everything but the note. Where no series can be read — a bare
 * note, or a mangled one — it falls back to Pancham, the group's more common
 * tuning.
 */
export function tanpuraVoice(label?: string | null): TanpuraVoice | null {
  const semitone = saOfAnyPitch(label);
  if (semitone === null) return null;

  const series: Series = /madhyam/i.test(label ?? '') ? 'Madhyam' : 'Pancham';
  const nearest = nearestSample(series, semitone);
  if (!nearest) return null;

  return {
    src: tanpuraSrc(series, nearest.note),
    series,
    baseSemitone: NOTE_NAMES.indexOf(nearest.note),
    targetSemitone: semitone,
    note: NOTE_NAMES[semitone],
    detune: nearest.detune,
    playbackRate: Math.pow(2, nearest.detune / 12),
  };
}
