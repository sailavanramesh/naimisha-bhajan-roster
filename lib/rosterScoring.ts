/**
 * lib/rosterScoring.ts — assigning singers to slots (docs/SPEC.md §4.C).
 *
 * Pure. No Prisma, no clock, no randomness.
 *
 * score = w1·repertoire + w2·overdue + w3·loadBalance + w4·pitchFit
 *       + w5·variety − w6·genderClump
 *
 * Every component returns a value in [0, 1] before weighting, so the weights
 * are directly comparable and a coordinator can reason about them.
 *
 * Two things the real data forced:
 *
 *   - A singer takes two slots in the same session in 50 of the 709 historical
 *     rows, so "one slot each" is a preference, not a rule.
 *   - Repertoire SCORES, it does not filter (SPEC §9.3). A singer may be given
 *     a bhajan they have never sung; that is exactly where predicted pitch
 *     earns its keep.
 */

export type Gender = 'Gents' | 'Ladies';

export type SingerContext = {
  id: string;
  name: string;
  gender: Gender | null;
  /** Bhajan ids on their known or festival list. */
  repertoireBhajanIds: ReadonlySet<string>;
  /** Bhajan ids they have actually sung. */
  sungBhajanIds: ReadonlySet<string>;
  /** Days since they last sang anything. Null means never. */
  daysSinceLastSang: number | null;
  /** Their slot count in the trailing window. */
  recentCount: number;
  /** Days since they last sang THIS bhajan, keyed by bhajan id. */
  daysSinceBhajan: ReadonlyMap<string, number>;
  /** Median semitone offset from their gender reference. */
  offsetMedian: number | null;
  offsetSamples: number;
  /** Modal absolute Sa of their history, 0..11. Null when unknown. */
  comfortCentre: number | null;
  available: boolean;
  unavailableReason?: string | null;
};

export type SlotContext = {
  position: number;
  bhajanId: string | null;
  bhajanTitle: string | null;
  raga: string | null;
  /** Absolute Sa of the gender reference, 0..11. Null when unknown. */
  referenceSaGents: number | null;
  referenceSaLadies: number | null;
};

export type Weights = {
  repertoire: number;
  overdue: number;
  loadBalance: number;
  pitchFit: number;
  variety: number;
  genderClump: number;
};

/**
 * Starting weights. Tunable by the coordinator (SPEC §4.C) — these are a
 * defensible starting point, not a claim about what the group wants.
 * Fairness (overdue + loadBalance) deliberately outweighs repertoire, because
 * the spec's stated problem is that the group reaches for the same few people.
 */
export const DEFAULT_WEIGHTS: Weights = {
  repertoire: 1.0,
  overdue: 1.2,
  loadBalance: 1.5,
  pitchFit: 0.8,
  variety: 0.6,
  genderClump: 1.0,
};

/** Beyond this, "overdue" is saturated — a term away is as overdue as a year. */
export const OVERDUE_SATURATION_DAYS = 120;
/** Repeating a bhajan within this window is penalised. */
export const VARIETY_WINDOW_DAYS = 180;
/** Three consecutive slots of one gender starts to read as a clump. */
export const GENDER_CLUMP_RUN = 3;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function wrap(d: number): number {
  const m = ((d % 12) + 12) % 12;
  return m > 6 ? m - 12 : m;
}

export type ComponentScores = {
  repertoire: number;
  overdue: number;
  loadBalance: number;
  pitchFit: number;
  variety: number;
  genderClump: number;
};

/** Reference Sa that applies to this singer for this slot. */
export function referenceSaFor(singer: SingerContext, slot: SlotContext): number | null {
  return singer.gender === 'Ladies' ? slot.referenceSaLadies : slot.referenceSaGents;
}

/**
 * How well the pitch this singer would need fits where they usually sit.
 * SPEC: `1 / (1 + |predictedPitch − theirComfortMedian|)`.
 */
export function pitchFit(singer: SingerContext, slot: SlotContext): number {
  const reference = referenceSaFor(singer, slot);
  if (reference === null || singer.comfortCentre === null || singer.offsetMedian === null) {
    // No basis to judge. Neutral rather than punitive — absence of data is not
    // evidence of a bad fit.
    return 0.5;
  }
  const predicted = ((reference + singer.offsetMedian) % 12 + 12) % 12;
  const distance = Math.abs(wrap(predicted - singer.comfortCentre));
  return 1 / (1 + distance);
}

export function repertoireScore(singer: SingerContext, slot: SlotContext): number {
  if (!slot.bhajanId) return 0.5;
  if (singer.sungBhajanIds.has(slot.bhajanId)) return 1;
  if (singer.repertoireBhajanIds.has(slot.bhajanId)) return 0.8;
  return 0;
}

export function overdueScore(singer: SingerContext): number {
  if (singer.daysSinceLastSang === null) return 1; // never sung: maximally overdue
  return clamp01(singer.daysSinceLastSang / OVERDUE_SATURATION_DAYS);
}

/** Their recent count against the group mean, inverted. */
export function loadBalanceScore(singer: SingerContext, groupMean: number): number {
  if (groupMean <= 0) return 0.5;
  const ratio = singer.recentCount / groupMean;
  // ratio 0 -> 1, ratio 1 -> 0.5, ratio 2+ -> 0
  return clamp01(1 - ratio / 2);
}

export function varietyScore(singer: SingerContext, slot: SlotContext): number {
  if (!slot.bhajanId) return 1;
  const days = singer.daysSinceBhajan.get(slot.bhajanId);
  if (days === undefined) return 1;
  return clamp01(days / VARIETY_WINDOW_DAYS);
}

/** 1 when placing this singer would extend a same-gender run to GENDER_CLUMP_RUN. */
export function genderClumpPenalty(
  singer: SingerContext,
  previousGenders: readonly (Gender | null)[],
): number {
  if (!singer.gender) return 0;
  let run = 0;
  for (let i = previousGenders.length - 1; i >= 0; i--) {
    if (previousGenders[i] === singer.gender) run++;
    else break;
  }
  return run + 1 >= GENDER_CLUMP_RUN ? 1 : 0;
}

export type PairScore = {
  score: number;
  components: ComponentScores;
  reasons: string[];
};

export function scorePair(
  singer: SingerContext,
  slot: SlotContext,
  ctx: { groupMean: number; previousGenders: readonly (Gender | null)[]; weights?: Weights },
): PairScore {
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const components: ComponentScores = {
    repertoire: repertoireScore(singer, slot),
    overdue: overdueScore(singer),
    loadBalance: loadBalanceScore(singer, ctx.groupMean),
    pitchFit: pitchFit(singer, slot),
    variety: varietyScore(singer, slot),
    genderClump: genderClumpPenalty(singer, ctx.previousGenders),
  };

  const score =
    w.repertoire * components.repertoire +
    w.overdue * components.overdue +
    w.loadBalance * components.loadBalance +
    w.pitchFit * components.pitchFit +
    w.variety * components.variety -
    w.genderClump * components.genderClump;

  return { score, components, reasons: explainPair(singer, slot, components) };
}

/** One line a coordinator can act on. Every assignment carries one. */
function explainPair(
  singer: SingerContext,
  slot: SlotContext,
  c: ComponentScores,
): string[] {
  const reasons: string[] = [];

  if (c.repertoire === 1) reasons.push('has sung this before');
  else if (c.repertoire === 0.8) reasons.push('on their bhajan list');
  else if (slot.bhajanId) reasons.push('new to them');

  if (singer.daysSinceLastSang === null) reasons.push('has never been rostered');
  else if (singer.daysSinceLastSang >= OVERDUE_SATURATION_DAYS)
    reasons.push(`not rostered in ${Math.round(singer.daysSinceLastSang / 30)} months`);
  else if (singer.daysSinceLastSang > 30)
    reasons.push(`last sang ${Math.round(singer.daysSinceLastSang / 7)} weeks ago`);

  if (c.loadBalance >= 0.75) reasons.push('under-used lately');
  else if (c.loadBalance <= 0.25) reasons.push('already busy lately');

  if (singer.offsetSamples >= 5 && singer.offsetMedian !== null && singer.offsetMedian !== 0) {
    const sign = singer.offsetMedian > 0 ? '+' : '';
    reasons.push(`usually sings ${sign}${singer.offsetMedian} from the reference`);
  }

  if (c.variety < 1) reasons.push('sang this one recently');
  if (c.genderClump === 1) reasons.push('would make three of the same voice in a row');

  return reasons;
}

export type Assignment = {
  position: number;
  slot: SlotContext;
  singer: SingerContext | null;
  score: number;
  reasons: string[];
  /** True when a human pinned this and the solver must not move it. */
  pinned: boolean;
};

export type RosterResult = {
  assignments: Assignment[];
  warnings: string[];
};

export type AssignOptions = {
  weights?: Weights;
  /** Singer id pinned to a position. Never re-solved away. */
  pins?: ReadonlyMap<number, string>;
  /** How many slots one singer may take before it costs them. Default 1. */
  softMaxPerSinger?: number;
  /** Penalty applied per extra slot beyond softMaxPerSinger. */
  repeatPenalty?: number;
};

/**
 * Greedy assignment by best score, then a local-swap improvement pass.
 * Sufficient at this scale — eleven singers, three or four slots. The
 * Hungarian algorithm is available if it ever isn't.
 *
 * Unavailable singers are excluded outright: availability is respected, not
 * scored (SPEC §4.C).
 */
export function assignRoster(
  singers: readonly SingerContext[],
  slots: readonly SlotContext[],
  options: AssignOptions = {},
): RosterResult {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const pins = options.pins ?? new Map<number, string>();
  const softMax = options.softMaxPerSinger ?? 1;
  const repeatPenalty = options.repeatPenalty ?? 2;
  const warnings: string[] = [];

  const available = singers.filter((s) => s.available);
  const unavailable = singers.filter((s) => !s.available);
  if (unavailable.length) {
    warnings.push(
      `Unavailable: ${unavailable.map((s) => s.name).join(', ')}. They were not considered.`,
    );
  }
  if (available.length === 0) {
    return {
      assignments: slots.map((slot) => ({
        position: slot.position,
        slot,
        singer: null,
        score: 0,
        reasons: [],
        pinned: false,
      })),
      warnings: [...warnings, 'No singers are available for this date.'],
    };
  }
  if (available.length < slots.length) {
    warnings.push(
      `${slots.length} slots but only ${available.length} available singers, so somebody sings twice.`,
    );
  }

  const groupMean =
    available.reduce((sum, s) => sum + s.recentCount, 0) / Math.max(1, available.length);

  const byId = new Map(available.map((s) => [s.id, s]));
  const useCount = new Map<string, number>();
  const assignments: Assignment[] = [];
  const genders: (Gender | null)[] = [];

  const ordered = [...slots].sort((a, b) => a.position - b.position);

  for (const slot of ordered) {
    const pinnedId = pins.get(slot.position);
    if (pinnedId) {
      // A pinned singer is honoured even if unavailable — a human said so, and
      // silently dropping their choice is exactly what SPEC forbids.
      const singer = byId.get(pinnedId) ?? singers.find((s) => s.id === pinnedId) ?? null;
      if (singer) {
        if (!singer.available) {
          warnings.push(
            `${singer.name} is pinned to slot ${slot.position} but marked unavailable. Kept, because you asked for them.`,
          );
        }
        useCount.set(singer.id, (useCount.get(singer.id) ?? 0) + 1);
        genders.push(singer.gender);
        assignments.push({
          position: slot.position,
          slot,
          singer,
          score: 0,
          reasons: ['Pinned by you'],
          pinned: true,
        });
        continue;
      }
      warnings.push(`Slot ${slot.position} was pinned to an unknown singer; the pin was ignored.`);
    }

    let best: { singer: SingerContext; score: number; reasons: string[] } | null = null;
    for (const singer of available) {
      const used = useCount.get(singer.id) ?? 0;
      const { score, reasons } = scorePair(singer, slot, {
        groupMean,
        previousGenders: genders,
        weights,
      });
      const penalised = score - Math.max(0, used - softMax + 1) * repeatPenalty;
      if (!best || penalised > best.score) {
        best = {
          singer,
          score: penalised,
          reasons: used >= softMax ? [...reasons, 'singing more than once this session'] : reasons,
        };
      }
    }

    if (!best) {
      assignments.push({ position: slot.position, slot, singer: null, score: 0, reasons: [], pinned: false });
      continue;
    }
    useCount.set(best.singer.id, (useCount.get(best.singer.id) ?? 0) + 1);
    genders.push(best.singer.gender);
    assignments.push({
      position: slot.position,
      slot,
      singer: best.singer,
      score: best.score,
      reasons: best.reasons,
      pinned: false,
    });
  }

  return { assignments: improve(assignments, groupMean, weights), warnings };
}

/**
 * Local-swap improvement: try exchanging each unpinned pair and keep the swap
 * when it raises the total. Pinned assignments never move.
 */
function improve(
  assignments: Assignment[],
  groupMean: number,
  weights: Weights,
): Assignment[] {
  const out = [...assignments];
  const total = (list: Assignment[]) =>
    list.reduce((sum, a, i) => {
      if (!a.singer) return sum;
      const previousGenders = list.slice(0, i).map((x) => x.singer?.gender ?? null);
      return sum + scorePair(a.singer, a.slot, { groupMean, previousGenders, weights }).score;
    }, 0);

  let current = total(out);
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (out[i].pinned || out[j].pinned) continue;
      if (!out[i].singer || !out[j].singer) continue;
      const trial = [...out];
      trial[i] = { ...out[i], singer: out[j].singer };
      trial[j] = { ...out[j], singer: out[i].singer };
      const score = total(trial);
      if (score > current + 1e-9) {
        out[i] = trial[i];
        out[j] = trial[j];
        current = score;
      }
    }
  }

  // Reasons were computed against the pre-swap ordering; refresh them.
  return out.map((a, i) => {
    if (!a.singer || a.pinned) return a;
    const previousGenders = out.slice(0, i).map((x) => x.singer?.gender ?? null);
    const { score, reasons } = scorePair(a.singer, a.slot, { groupMean, previousGenders, weights });
    return { ...a, score, reasons };
  });
}
