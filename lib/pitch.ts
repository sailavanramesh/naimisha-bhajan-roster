/**
 * lib/pitch.ts — the pitch model.
 *
 * Canonical rules live in CLAUDE.md ("The pitch model"). Restated here because
 * getting these wrong makes everything downstream wrong:
 *
 *   1. Absolute Sa comes ONLY from the note letter after the slash.
 *   2. Madhyam vs Pancham is display metadata. It does not change the pitch.
 *      `1 Madhyam / F` and `4 Pancham / F` are the same Sa.
 *   3. Tabla pitch = Sa + 7 semitones. Derived, never stored per row.
 *   4. Deviation between two pitches is the signed shortest distance mod 12,
 *      wrapped to [-6, +6].
 *
 * Everything in this file is pure. No Prisma import, no I/O, no clock.
 */

export const PITCH_CLASS = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
} as const;

export type NoteName = keyof typeof PITCH_CLASS;

/** Reverse of PITCH_CLASS. Sharps only — the group's labels never use flats. */
export const NOTE_NAMES: readonly NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

/** Which drone the shruti box plays against Sa. A convention label, not a pitch. */
export type Series = 'Madhyam' | 'Pancham';

export type PitchLabel = {
  /** The numeric step in the label, e.g. 2 in `2 Pancham / D`. May be fractional. */
  step: number;
  series: Series;
  note: NoteName;
  /** Absolute Sa as a pitch class, 0..11. */
  semitone: number;
  /** The label as written, trimmed. Round-trips for display. */
  raw: string;
};

const LABEL_RE = /^\s*([0-9]+(?:\.[0-9]+)?)\s+(Madhyam|Pancham)\s*\/\s*([A-G]#?)\s*$/i;
const NOTE_SUFFIX_RE = /\/\s*([A-G]#?)\s*$/;

/**
 * Absolute Sa of a pitch label, as a pitch class 0..11.
 *
 * Deliberately lenient: it reads only the note letter after the slash, so it
 * still works on labels whose step or series is malformed. Returns null when
 * there is no parseable note.
 */
export function saOf(label?: string | null): number | null {
  const m = NOTE_SUFFIX_RE.exec((label ?? '').trim());
  if (!m) return null;
  const note = m[1].toUpperCase() as NoteName;
  const pc = PITCH_CLASS[note];
  return pc === undefined ? null : pc;
}

/**
 * Full structured parse of a label such as `2 Pancham / D`.
 *
 * Stricter than `saOf`: returns null unless step, series and note are all
 * present and well formed. Use this when you need to preserve or compare the
 * series; use `saOf` when you only need the pitch.
 */
export function parsePitchLabel(label?: string | null): PitchLabel | null {
  const raw = (label ?? '').trim();
  const m = LABEL_RE.exec(raw);
  if (!m) return null;
  const note = m[3].toUpperCase() as NoteName;
  const semitone = PITCH_CLASS[note];
  if (semitone === undefined) return null;
  const series = (m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) as Series;
  return { step: Number(m[1]), series, note, semitone, raw };
}

/**
 * Semitones from `reference` to `actual`, wrapped to [-6, +6].
 * `+2` means sung two semitones above the reference.
 *
 * Returns null if either side has no parseable note.
 */
export function semitoneDelta(
  actual?: string | null,
  reference?: string | null,
): number | null {
  const a = saOf(actual);
  const r = saOf(reference);
  if (a === null || r === null) return null;
  const d = (a - r + 12) % 12;
  return d > 6 ? d - 12 : d;
}

/** Tabla pitch for a given Sa: always Sa + 7 semitones (a fifth above). */
export function tablaSemitone(sa: number): number {
  return (((sa + 7) % 12) + 12) % 12;
}

/**
 * Tabla note for a pitch label, e.g. `1 Madhyam / F` -> `C`.
 * Returns null when the label has no parseable note.
 */
export function tablaPitchOf(label?: string | null): NoteName | null {
  const sa = saOf(label);
  if (sa === null) return null;
  return NOTE_NAMES[tablaSemitone(sa)];
}

/** Median of a numeric list. Even lengths average the two middle values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Arithmetic mean. Null on an empty list, so callers must handle "no data". */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Nearest-rank percentile, matching the convention used for the comfort band.
 * `p` is a fraction in [0, 1].
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

export type OffsetProfile = {
  n: number;
  median: number | null;
  mean: number | null;
  /** p10–p90 band of the offsets. Null when there is no data. */
  comfortLow: number | null;
  comfortHigh: number | null;
};

/**
 * Below this many observations, an offset is not worth showing as a prediction.
 * SPEC 4.D: "Under 5 data points, show the plain reference and say so."
 */
export const MIN_CONFIDENT_SAMPLES = 5;

/** Summary statistics for one singer's deltas from their gender reference. */
export function offsetProfile(deltas: readonly number[]): OffsetProfile {
  return {
    n: deltas.length,
    median: median(deltas),
    mean: mean(deltas),
    comfortLow: percentile(deltas, 0.1),
    comfortHigh: percentile(deltas, 0.9),
  };
}

/** True when a profile has enough data to be shown as a prediction. */
export function isConfident(profile: OffsetProfile): boolean {
  return profile.n >= MIN_CONFIDENT_SAMPLES;
}

/**
 * Transpose a pitch label by `semitones`, preserving the series and step
 * numbering of the original label where possible.
 *
 * Snapping rule (SPEC 4.D): the predicted pitch is snapped to the nearest label
 * in the SAME series as the reference. `available` is the set of real labels
 * from the PitchLabel table; when a label in the same series matches the target
 * semitone it is returned verbatim, so display stays in the group's own
 * vocabulary. Falls back to a bare note name when nothing matches.
 */
export function transposeLabel(
  reference: string | null | undefined,
  semitones: number,
  available: readonly string[] = [],
): string | null {
  const sa = saOf(reference);
  if (sa === null) return null;
  const target = (((sa + semitones) % 12) + 12) % 12;

  const parsed = parsePitchLabel(reference);
  const candidates = available
    .map(parsePitchLabel)
    .filter((p): p is PitchLabel => p !== null && p.semitone === target);

  if (parsed) {
    const sameSeries = candidates.find((c) => c.series === parsed.series);
    if (sameSeries) return sameSeries.raw;
  }
  if (candidates.length > 0) return candidates[0].raw;

  return NOTE_NAMES[target];
}

/**
 * This singer's predicted pitch for a bhajan they may never have sung:
 * their gender reference shifted by their median offset, snapped back onto a
 * real label. Returns the plain reference when the profile is too thin to
 * trust, so the caller can say so honestly rather than inventing precision.
 */
export function predictPitch(
  reference: string | null | undefined,
  profile: OffsetProfile,
  available: readonly string[] = [],
): { label: string | null; predicted: boolean; n: number } {
  const ref = (reference ?? '').trim() || null;
  if (!ref || !isConfident(profile) || profile.median === null) {
    return { label: ref, predicted: false, n: profile.n };
  }
  return {
    label: transposeLabel(ref, profile.median, available),
    predicted: true,
    n: profile.n,
  };
}
