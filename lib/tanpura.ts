/**
 * lib/tanpura.ts — choosing which tanpura recording to play, and how far to
 * detune it, for a given shruti label.
 *
 * Pure. No Web Audio, no DOM, no I/O — so the maths is testable without a
 * browser and the engine in `components/ShrutiPlayer.tsx` stays a thin shell.
 *
 * ## What the written note means, which is not what saOf assumes
 *
 * A label names the note the DRONE sounds, and which drone that is depends on
 * the series:
 *
 *   Pancham — the written note is Sa. `4.5 Pancham / F#` is Sa F#, with Pa
 *             (C#) droning against it.
 *   Madhyam — the written note is MA, a perfect fourth above Sa.
 *             `4.5 Madhyam / B` is Sa F#, with Ma (B) droning against it.
 *
 * The group's own table bears this out: for every step number the Madhyam note
 * is exactly five semitones above the Pancham note, which is what Ma is. The
 * step number alone gives Sa, identically in both series.
 *
 * Sailavan, 2026-08-20, on hearing 4.5 Madhyam / B come out as B: "the 4.5
 * madhyam /B is misleading, the 4.5 madhyam means Sa is F# (4.5) and B is the
 * Ma", and "4.5 pancham would be Sa is F# and Pa is C#".
 *
 * ## Why this correction lives HERE and not in lib/pitch.ts
 *
 * `saOf` still reads the written note as Sa, and the rest of the app still
 * compares pitches that way. Applying this correction there instead was tried
 * and measured against the group's own singing history: it makes each singer's
 * offsets from their reference markedly WORSE — spread 1.02 to 1.59 semitones,
 * and rows where somebody supposedly sang more than three semitones from their
 * reference going from 12 to 59 out of 669. The sung-pitch records therefore
 * behave as though the written note were the pitch, whatever the shruti box
 * does with the same words.
 *
 * Both can be true at once: the sheet compares letters, and the box sounds a
 * fourth below on Madhyam. Only playback has to agree with the box, so only
 * playback is corrected. Widening it is a decision about 709 rows of history
 * and is Sailavan's to make with those numbers in front of him.
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
 * How far the written note sits above Sa, per series. See the note above.
 *
 * Pancham writes Sa itself; Madhyam writes Ma, a perfect fourth up. To sound a
 * Madhyam label the drone therefore has to start five semitones BELOW the note
 * printed on it.
 */
export const NOTE_ABOVE_SA: Readonly<Record<Series, number>> = {
  Pancham: 0,
  Madhyam: 5,
};

/**
 * The Sa a label should actually be sounded at.
 *
 * Deliberately NOT `saOf`: that answers the question the rest of the app asks,
 * which is "what note is written here". This answers "what note should the
 * drone be tuned to", and for Madhyam they differ by a fourth.
 */
export function soundingSa(label?: string | null): number | null {
  const written = saOfAnyPitch(label);
  if (written === null) return null;
  // A bare programme note has no series and is taken at face value.
  const series: Series = /madhyam/i.test(label ?? '') ? 'Madhyam' : 'Pancham';
  return (((written - NOTE_ABOVE_SA[series]) % 12) + 12) % 12;
}

/**
 * The Sa notes we hold recordings at, per series.
 *
 * The two series list DIFFERENT notes, and that is not an oversight. The
 * recordings are the electronic-tanpura pack described in
 * public/audio/tanpura/README.md, which was recorded at whatever pitches its
 * author happened to use — four in the Pancham tuning, only two in Madhyam.
 * `nearestSample` reads whatever each series declares, so this asymmetry costs
 * nothing but accuracy in the thinner series.
 *
 * What it means in practice:
 *
 *   Pancham — worst case 2 semitones of correction (a target on D).
 *   Madhyam — worst case 4 semitones (targets on C# and D).
 *
 * That is a fair trade for now because the group's own data is lopsided the
 * same way: of 688 sung pitches on record, 626 are Pancham and 62 Madhyam. The
 * common case is the accurate one.
 *
 * Adding two Madhyam recordings near C and D# would bring that series to the
 * same 2 semitones. It is a one-line change here plus the files.
 */
export const TANPURA_BASE_NOTES: Readonly<Record<Series, readonly NoteName[]>> = {
  Madhyam: ['F#', 'A'],
  Pancham: ['A', 'C', 'E', 'F#'],
};

/** Where the recordings live, relative to the site root. */
export const TANPURA_DIR = '/audio/tanpura';

/**
 * Uncompressed, deliberately.
 *
 * MP3 and AAC both add encoder delay and padding, and browsers disagree about
 * trimming it on decode — which puts a gap at the loop point of a sound whose
 * whole job is to be continuous. WAV has no such framing, so the loop is
 * sample-exact everywhere. The files are 8 seconds of 16-bit mono at 22.05 kHz,
 * about 350 KB each: more than an MP3, still a fraction of a second on a phone,
 * and fetched once per shruti and then cached.
 */
export const TANPURA_EXT = '.wav';

/**
 * Filename-safe form of a note: `D#` -> `d-sharp`.
 *
 * Spelled out rather than kept as `#` because a `#` in a URL starts the
 * fragment, so `/audio/tanpura/pancham-D#.wav` would request
 * `/audio/tanpura/pancham-D` and 404.
 */
export function noteSlug(note: NoteName): string {
  return note.toLowerCase().replace('#', '-sharp');
}

/** The asset path for one recording, e.g. `/audio/tanpura/pancham-f-sharp.wav`. */
export function tanpuraSrc(series: Series, note: NoteName): string {
  return `${TANPURA_DIR}/${series.toLowerCase()}-${noteSlug(note)}${TANPURA_EXT}`;
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
  const semitone = soundingSa(label);
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
