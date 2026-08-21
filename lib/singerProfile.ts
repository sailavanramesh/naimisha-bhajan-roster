/**
 * lib/singerProfile.ts — turning a singer's history into a pitch profile.
 *
 * Pure. No Prisma import. The database layer lives in lib/pitchQueries.ts and
 * hands these functions plain rows.
 *
 * The reference a delta is measured against is, in order of preference:
 *   1. the recommendation recorded on the slot at the time
 *      (`historicalRecommendedPitch`), then
 *   2. the masterlist reference for the singer's gender.
 *
 * They agree on 617 of the 618 rows where both exist, so this is not a
 * meaningful modelling choice — but preferring the recorded one keeps these
 * profiles consistent with the CLAUDE.md offset table, which is defined that
 * way and is pinned by tests/singerOffsets.test.ts.
 */

import {
  saOf,
  writtenDelta,
  median,
  mean,
  percentile,
  offsetProfile,
  isConfident,
  transposeLabel,
  predictPitch,
  NOTE_NAMES,
  type OffsetProfile,
  type NoteName,
} from './pitch';

export type SungRow = {
  singerName: string;
  gender: 'Gents' | 'Ladies' | null;
  /** What they actually sang at. */
  confirmedPitch: string | null;
  /** The recommendation recorded on the slot at the time. */
  historicalRecommendedPitch: string | null;
  /** Masterlist reference for this singer's gender, if the bhajan resolved. */
  masterlistReference: string | null;
  bhajanId: string | null;
  bhajanTitle: string | null;
  raga: string | null;
  date: Date;
};

/** The reference a row's offset is measured against, or null if unusable. */
export function referenceFor(row: SungRow): string | null {
  return row.historicalRecommendedPitch ?? row.masterlistReference ?? null;
}

/**
 * Signed semitone offset for one row, or null if it cannot be computed.
 *
 * Measured on the WRITTEN NOTE, not on Sa — `writtenDelta`, not
 * `semitoneDelta`. The long version is on `writtenDelta` in lib/pitch.ts; the
 * short version is that the history mixes the two series, the sheet was filled
 * in by comparing letters, and measuring these on Sa made every Madhyam
 * reference paired with a Pancham sung pitch read five semitones out. That is
 * what turned Prithvi's Pahadi median into +6 and predicted 7 Madhyam / E from
 * a reference of 4 Madhyam / A#.
 *
 * Applying the offset needs no matching change: `transposeLabel` snaps to the
 * reference's own series, and within one series adding n to Sa and adding n to
 * the written note land on the same label.
 */
export function offsetFor(row: SungRow): number | null {
  return writtenDelta(row.confirmedPitch, referenceFor(row));
}

export type SingerProfile = {
  singerName: string;
  gender: 'Gents' | 'Ladies' | null;
  /** Offsets from the reference, one per usable row. */
  offsets: number[];
  overall: OffsetProfile;
  /** Per-raga profiles, only where there are enough observations. */
  byRaga: Map<string, OffsetProfile>;
  /** Absolute Sa comfort band, as pitch classes. Null when there is no data. */
  comfort: ComfortBand | null;
};

export type ComfortBand = {
  /** Central pitch class the band is anchored on. */
  centre: number;
  low: number;
  high: number;
  centreNote: NoteName;
  lowNote: NoteName;
  highNote: NoteName;
  /** Width in semitones, 0..12. */
  width: number;
  n: number;
};

/** SPEC 4.D: per-raga profiles need at least this many observations. */
export const MIN_RAGA_SAMPLES = 5;

/** Wrap a semitone difference into [-6, +6]. */
function wrap(d: number): number {
  const m = ((d % 12) + 12) % 12;
  return m > 6 ? m - 12 : m;
}

/**
 * The p10–p90 band of a singer's absolute Sa.
 *
 * Pitch classes are circular, so a naive percentile over 0..11 gives nonsense
 * the moment a singer straddles B/C — the same two notes would read as an
 * eleven-semitone spread. Instead each observation is expressed as its signed
 * distance from the singer's most common Sa, percentiles are taken in that
 * rotated frame where the values are linear, and the result is rotated back.
 */
export function comfortBand(saValues: readonly number[]): ComfortBand | null {
  if (saValues.length === 0) return null;

  // Anchor on the mode; it is stabler than the mean for a small, lumpy sample.
  const counts = new Map<number, number>();
  for (const sa of saValues) counts.set(sa, (counts.get(sa) ?? 0) + 1);
  let centre = saValues[0];
  let best = -1;
  for (const [sa, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > best) { best = count; centre = sa; }
  }

  const rotated = saValues.map((sa) => wrap(sa - centre));
  const low = percentile(rotated, 0.1)!;
  const high = percentile(rotated, 0.9)!;

  const norm = (v: number) => ((v % 12) + 12) % 12;
  const lowPc = norm(centre + low);
  const highPc = norm(centre + high);

  return {
    centre,
    low: lowPc,
    high: highPc,
    centreNote: NOTE_NAMES[centre],
    lowNote: NOTE_NAMES[lowPc],
    highNote: NOTE_NAMES[highPc],
    width: high - low,
    n: saValues.length,
  };
}

/** Build one singer's profile from their rows. */
export function buildSingerProfile(singerName: string, rows: readonly SungRow[]): SingerProfile {
  const offsets: number[] = [];
  const saValues: number[] = [];
  const byRagaOffsets = new Map<string, number[]>();
  let gender: 'Gents' | 'Ladies' | null = null;

  for (const row of rows) {
    if (row.gender) gender = row.gender;
    const offset = offsetFor(row);
    if (offset === null) continue;
    offsets.push(offset);

    const sa = saOf(row.confirmedPitch);
    if (sa !== null) saValues.push(sa);

    const raga = (row.raga ?? '').trim();
    if (raga) {
      if (!byRagaOffsets.has(raga)) byRagaOffsets.set(raga, []);
      byRagaOffsets.get(raga)!.push(offset);
    }
  }

  const byRaga = new Map<string, OffsetProfile>();
  for (const [raga, values] of byRagaOffsets) {
    if (values.length < MIN_RAGA_SAMPLES) continue;
    byRaga.set(raga, offsetProfile(values));
  }

  return {
    singerName,
    gender,
    offsets,
    overall: offsetProfile(offsets),
    byRaga,
    comfort: comfortBand(saValues),
  };
}

/** Group rows by singer and build every profile. */
export function buildAllProfiles(rows: readonly SungRow[]): Map<string, SingerProfile> {
  const bySinger = new Map<string, SungRow[]>();
  for (const row of rows) {
    if (!bySinger.has(row.singerName)) bySinger.set(row.singerName, []);
    bySinger.get(row.singerName)!.push(row);
  }
  const out = new Map<string, SingerProfile>();
  for (const [name, singerRows] of bySinger) {
    out.set(name, buildSingerProfile(name, singerRows));
  }
  return out;
}

export type PitchPrediction = {
  /** The label to show. Null when there is no reference to work from. */
  label: string | null;
  /** True when an offset was applied; false means this is the bare reference. */
  predicted: boolean;
  /** Sample size behind the prediction. */
  n: number;
  /** Which profile was used. */
  basis: 'raga' | 'overall' | 'reference';
  /** Semitones applied, 0 when not predicted. */
  offset: number;
  /** True when the prediction falls outside the singer's comfort band. */
  outsideComfort: boolean;
};

/**
 * Predict what this singer will want to sing a bhajan at.
 *
 * Prefers a raga-specific profile where one exists, falls back to the overall
 * profile, and falls back again to the plain reference when there is not
 * enough history to say anything honest.
 */
export function predictForSinger(
  profile: SingerProfile | undefined,
  reference: string | null | undefined,
  raga: string | null | undefined,
  availableLabels: readonly string[] = [],
): PitchPrediction {
  const ref = (reference ?? '').trim() || null;
  if (!profile || !ref) {
    return { label: ref, predicted: false, n: profile?.overall.n ?? 0, basis: 'reference', offset: 0, outsideComfort: false };
  }

  const ragaKey = (raga ?? '').trim();
  const ragaProfile = ragaKey ? profile.byRaga.get(ragaKey) : undefined;
  const chosen = ragaProfile && isConfident(ragaProfile) ? ragaProfile : profile.overall;
  const basis: PitchPrediction['basis'] =
    ragaProfile && isConfident(ragaProfile) ? 'raga' : 'overall';

  const result = predictPitch(ref, chosen, availableLabels);
  if (!result.predicted) {
    return { label: result.label, predicted: false, n: result.n, basis: 'reference', offset: 0, outsideComfort: false };
  }

  const offset = chosen.median ?? 0;
  return {
    label: result.label,
    predicted: true,
    n: result.n,
    basis,
    offset,
    outsideComfort: isOutsideComfort(profile.comfort, result.label),
  };
}

/**
 * Whether a proposed pitch sits outside the singer's comfort band.
 *
 * SPEC 4.D wants this flagged *before* the session, not after. Two cautions,
 * both learned from the real data (see PROGRESS.md, OPEN-QUESTIONS):
 *
 * 1. Use it on a pitch a HUMAN proposed — a coordinator override, or a
 *    confirmed pitch being entered. Applying it to `predictForSinger`'s own
 *    output is meaningless: that output is the singer's median offset applied
 *    to the reference, so it is inside their band by construction.
 *
 * 2. The band is wide. Measured over the seeded history it spans 5–10
 *    semitones per singer, because absolute Sa is driven by which bhajan is
 *    being sung, not by the singer's voice. The tight, singer-specific
 *    quantity is the OFFSET, not the Sa. Treat a hit as weak evidence.
 */
export function isOutsideComfort(band: ComfortBand | null, label: string | null): boolean {
  if (!band || !label) return false;
  const sa = saOf(label);
  if (sa === null) return false;
  const d = wrap(sa - band.centre);
  const low = wrap(band.low - band.centre);
  const high = wrap(band.high - band.centre);
  return d < low || d > high;
}

/** Re-exported so pages can build ladders without importing two modules. */
export { median, mean, transposeLabel, isConfident };
