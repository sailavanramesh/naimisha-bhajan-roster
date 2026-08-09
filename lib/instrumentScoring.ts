/**
 * lib/instrumentScoring.ts — fair rotation for instruments (docs/SPEC.md §4.F).
 *
 * Pure. "Same fair-rotation scoring as singers, simplified": no pitch fit and
 * no gender clumping, so this is eligibility, experience, overdue and load.
 *
 * **Eligibility is data, not code.** It lives in the `InstrumentPerson` table
 * keyed by the instrument names the roster actually uses, so a coordinator can
 * edit it. `scripts/seedEligibility.ts` fills in the defaults; nothing here
 * hard-codes who may play what.
 *
 * Eligibility is a PREFERENCE, not a gate. The lookup imported from the
 * spreadsheet named 16 people while 33 have actually played, so filtering on
 * it would exclude half the people who really do this. Being listed scores
 * higher; not being listed never excludes.
 */

export const INSTRUMENTS = [
  'Harmonium',
  'Chorus Mic',
  'Tabla',
  'Cymbals (Male)',
  'Cymbals (Female)',
  'Tambourine',
  'Ghanjira (small)',
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

/**
 * Instruments with no eligibility rows at all: nobody is more or less
 * eligible, so the term goes neutral rather than zeroing everyone out. This is
 * a safety net for a newly added instrument, not a special case for any
 * particular one — Chorus Mic and both Cymbals roles are seeded with the
 * singer list by `scripts/seedEligibility.ts`.
 */

export type PlayerContext = {
  name: string;
  /** Instruments they appear against in the eligibility lookup. */
  listedFor: ReadonlySet<string>;
  /** Instruments they have actually played, from history. */
  playedInstruments: ReadonlySet<string>;
  /** Days since they last played anything. Null means never. */
  daysSinceLastPlayed: number | null;
  /** Their assignment count in the trailing window. */
  recentCount: number;
};

export type InstrumentWeights = {
  eligibility: number;
  experience: number;
  overdue: number;
  loadBalance: number;
};

export const DEFAULT_INSTRUMENT_WEIGHTS: InstrumentWeights = {
  eligibility: 1.2,
  experience: 0.8,
  overdue: 1.0,
  loadBalance: 1.4,
};

export const OVERDUE_SATURATION_DAYS = 120;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function eligibilityScore(
  player: PlayerContext,
  instrument: string,
  instrumentsWithLists?: ReadonlySet<string>,
): number {
  // No list exists for this instrument at all — stay neutral.
  if (instrumentsWithLists && !instrumentsWithLists.has(instrument)) return 0.5;
  return player.listedFor.has(instrument) ? 1 : 0;
}

export function experienceScore(player: PlayerContext, instrument: string): number {
  return player.playedInstruments.has(instrument) ? 1 : 0;
}

export function overdueScore(player: PlayerContext): number {
  if (player.daysSinceLastPlayed === null) return 1;
  return clamp01(player.daysSinceLastPlayed / OVERDUE_SATURATION_DAYS);
}

export function loadBalanceScore(player: PlayerContext, groupMean: number): number {
  if (groupMean <= 0) return 0.5;
  return clamp01(1 - player.recentCount / groupMean / 2);
}

export type InstrumentPick = {
  instrument: string;
  player: PlayerContext | null;
  score: number;
  reasons: string[];
  pinned: boolean;
};

export function scorePlayer(
  player: PlayerContext,
  instrument: string,
  ctx: {
    groupMean: number;
    weights?: InstrumentWeights;
    /** Which instruments have any eligibility rows. Omit to assume all do. */
    instrumentsWithLists?: ReadonlySet<string>;
  },
): { score: number; reasons: string[] } {
  const w = ctx.weights ?? DEFAULT_INSTRUMENT_WEIGHTS;
  const eligible = eligibilityScore(player, instrument, ctx.instrumentsWithLists);
  const experience = experienceScore(player, instrument);
  const overdue = overdueScore(player);
  const load = loadBalanceScore(player, ctx.groupMean);

  const score =
    w.eligibility * eligible +
    w.experience * experience +
    w.overdue * overdue +
    w.loadBalance * load;

  const reasons: string[] = [];
  if (eligible === 1) reasons.push('on the eligibility list');
  else if (eligible === 0.5) reasons.push('no eligibility list for this one');
  else if (experience === 1) reasons.push('not listed, but has played it');
  else reasons.push('has not played this before');

  if (player.daysSinceLastPlayed === null) reasons.push('never rostered on an instrument');
  else if (player.daysSinceLastPlayed >= OVERDUE_SATURATION_DAYS)
    reasons.push(`not played in ${Math.round(player.daysSinceLastPlayed / 30)} months`);

  if (load >= 0.75) reasons.push('under-used');
  else if (load <= 0.25) reasons.push('already busy');

  return { score, reasons };
}

export type AssignInstrumentOptions = {
  weights?: InstrumentWeights;
  /** instrument -> player name. Never re-solved away. */
  pins?: ReadonlyMap<string, string>;
  /** Allow one person on two instruments in the same session. Default false. */
  allowDoubling?: boolean;
  /** Which instruments have any eligibility rows. Omit to assume all do. */
  instrumentsWithLists?: ReadonlySet<string>;
};

/**
 * Greedy rotation. One person per instrument, and by default one instrument
 * per person — with the same escape hatch as the singer roster: if there are
 * fewer players than instruments, somebody doubles up rather than a slot
 * going empty.
 */
export function assignInstruments(
  instruments: readonly string[],
  players: readonly PlayerContext[],
  options: AssignInstrumentOptions = {},
): { picks: InstrumentPick[]; warnings: string[] } {
  const weights = options.weights ?? DEFAULT_INSTRUMENT_WEIGHTS;
  const pins = options.pins ?? new Map<string, string>();
  const warnings: string[] = [];

  if (players.length === 0) {
    return {
      picks: instruments.map((instrument) => ({
        instrument, player: null, score: 0, reasons: [], pinned: false,
      })),
      warnings: ['Nobody is available to play.'],
    };
  }

  const groupMean =
    players.reduce((sum, p) => sum + p.recentCount, 0) / Math.max(1, players.length);

  const used = new Set<string>();
  const picks: InstrumentPick[] = [];

  for (const instrument of instruments) {
    const pinnedName = pins.get(instrument);
    if (pinnedName) {
      const player = players.find((p) => p.name === pinnedName) ?? null;
      if (player) {
        used.add(player.name);
        picks.push({ instrument, player, score: 0, reasons: ['Pinned by you'], pinned: true });
        continue;
      }
      warnings.push(`${instrument} was pinned to an unknown player; the pin was ignored.`);
    }

    const pool =
      options.allowDoubling || used.size >= players.length
        ? players
        : players.filter((p) => !used.has(p.name));

    let best: { player: PlayerContext; score: number; reasons: string[] } | null = null;
    for (const player of pool) {
      const { score, reasons } = scorePlayer(player, instrument, {
        groupMean, weights, instrumentsWithLists: options.instrumentsWithLists,
      });
      if (!best || score > best.score) best = { player, score, reasons };
    }

    if (!best) {
      picks.push({ instrument, player: null, score: 0, reasons: [], pinned: false });
      continue;
    }
    used.add(best.player.name);
    picks.push({ instrument, player: best.player, score: best.score, reasons: best.reasons, pinned: false });
  }

  if (players.length < instruments.length) {
    warnings.push(
      `${instruments.length} instruments but only ${players.length} players, so somebody plays twice.`,
    );
  }

  return { picks, warnings };
}
