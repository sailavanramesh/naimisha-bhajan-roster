/**
 * lib/sessionBuilder.ts — the suggestion engine (docs/SPEC.md §4.B).
 *
 * Pure. No Prisma, no clock, no Math.random. Given the same candidates, the
 * same template and the same seed, this returns the same session every time —
 * which is what makes a generated set shareable by URL.
 *
 * Two things confirmed by Sailavan shape this file (SPEC §9):
 *
 *   - The Ganesha opener and the Sai closer are STRONG HABITS, not rules. They
 *     are weights, never filters. Generation must never fail because no
 *     Ganesha bhajan was available.
 *   - The freshness window is ADVISORY. A recently sung bhajan is down-weighted
 *     and flagged, never removed from the pool.
 *
 * "Missing is not excluded": a bhajan with no tempo, no raga or no deity stays
 * eligible everywhere. A third of the masterlist has no tempo at all.
 */

export type Candidate = {
  id: string;
  title: string;
  deities: string[];
  raga: string | null;
  language: string | null;
  tempo: string | null;
  level: string | null;
  beat: string | null;
  hasLyrics: boolean;
  hasAudio: boolean;
  hasReference: boolean;
  /** How many times the group has sung it, ever. */
  timesSung: number;
  /** Days since it was last sung. Null means never sung. */
  lastSungDaysAgo: number | null;
};

export type RuleStrength = 'hard' | 'soft';

export type SlotRuleSpec = {
  /** 1-based. Negative counts from the end: -1 is the final slot. */
  position: number;
  strength: RuleStrength;
  /** Required deity, matched against the bhajan's deity list. */
  deity?: string | null;
  /** Allowed tempi. Empty means no constraint. */
  tempoIn?: string[];
  note?: string | null;
};

export type TemplateSpec = {
  name: string;
  defaultLength: number;
  rules: SlotRuleSpec[];
  /** Festival mode: every slot constrained to this deity, as a HARD rule. */
  singleDeity?: string | null;
};

export type GenerateOptions = {
  seed: string;
  length: number;
  /** Bhajans sung within this many days are down-weighted and flagged. */
  freshnessDays?: number;
  /**
   * Locked slots, as position -> bhajan id.
   *
   * Keyed by POSITION, not order. An array of ids placed at 1..n in array
   * order looks right until you lock a subset: locking slots 1 and 3 would put
   * slot 3's bhajan at position 2 and generate a fresh one for position 3, so
   * "swap this one" appeared to swap everything.
   */
  locked?: ReadonlyMap<number, string>;
};

export type GeneratedSlot = {
  position: number;
  candidate: Candidate;
  /** Why this bhajan is here, in plain words. */
  reasons: string[];
  /** Constraints that had to be relaxed to fill this slot. */
  relaxed: string[];
  /** True when it was sung inside the freshness window. Advisory. */
  recentlySung: boolean;
  locked: boolean;
};

export type GenerationResult = {
  slots: GeneratedSlot[];
  warnings: string[];
  poolSize: number;
};

/** SPEC §9.2: three, not ten. */
export const DEFAULT_LENGTH = 3;
export const DEFAULT_FRESHNESS_DAYS = 90;

/**
 * Tempo ordering, for the "builds, does not start fast" arc.
 * `null` (1,112 of 3,607 bhajans) sorts as unknown and never blocks anything.
 */
export const TEMPO_ORDER = ['Slow', 'Medium Slow', 'Medium', 'Medium Fast', 'Fast'] as const;

export function tempoRank(tempo: string | null | undefined): number | null {
  if (!tempo) return null;
  const i = TEMPO_ORDER.indexOf(tempo.trim() as (typeof TEMPO_ORDER)[number]);
  return i === -1 ? null : i;
}

// ---------------------------------------------------------------------------
// seeded randomness
// ---------------------------------------------------------------------------

/** FNV-1a, so a human-friendly seed string maps to a 32-bit state. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. Small, fast, and good enough for choosing bhajans. */
export function makeRng(seed: string): () => number {
  let a = hashSeed(seed) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one index in proportion to weight. Returns -1 for an empty pool. */
export function weightedPick(weights: readonly number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (total <= 0) return weights.length > 0 ? Math.floor(rng() * weights.length) : -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (r < w) return i;
    r -= w;
  }
  return weights.length - 1;
}

// ---------------------------------------------------------------------------
// weighting
// ---------------------------------------------------------------------------

/**
 * How strongly a soft slot rule is preferred, as a probability.
 *
 * The Ganesha opener holds in 140 of 188 real sessions — about 0.74 — so the
 * default is set a little above that, since a coordinator who picked the
 * template is asking for the shape.
 */
export const SOFT_RULE_PREFERENCE = 0.85;

/**
 * w = freshness × novelty × completeness (SPEC §4.B).
 *
 * Freshness never reaches zero: the window is advisory, so a bhajan sung last
 * week is unlikely but not impossible.
 *
 * Novelty is deliberately gentler than `1 / (1 + timesSung)`. The masterlist
 * holds 3,607 bhajans of which the group has ever sung only a few hundred, so a
 * linear novelty term made "never sung" candidates outnumber and outweigh the
 * repertoire so heavily that every generated session was three songs nobody
 * knew. The square root keeps the preference — a never-sung bhajan still beats
 * one sung twenty times — without erasing the group's own material.
 */
export function candidateWeight(c: Candidate, freshnessDays: number): number {
  const freshness =
    c.lastSungDaysAgo === null
      ? 1
      : Math.max(0.05, Math.min(1, c.lastSungDaysAgo / Math.max(1, freshnessDays)));
  const novelty = 1 / Math.sqrt(1 + c.timesSung);
  const completeness =
    1 + (c.hasLyrics ? 0.15 : 0) + (c.hasAudio ? 0.15 : 0) + (c.hasReference ? 0.2 : 0);
  return freshness * novelty * completeness;
}

export function matchesDeity(c: Candidate, deity: string | null | undefined): boolean {
  if (!deity) return true;
  return c.deities.some((d) => d.toLowerCase() === deity.toLowerCase());
}

export function matchesTempo(c: Candidate, tempoIn: string[] | undefined): boolean {
  if (!tempoIn || tempoIn.length === 0) return true;
  if (!c.tempo) return false;
  return tempoIn.some((t) => t.toLowerCase() === c.tempo!.trim().toLowerCase());
}

/** Resolve a rule position (which may be negative) against a session length. */
export function resolvePosition(position: number, length: number): number {
  return position < 0 ? length + position + 1 : position;
}

export function ruleForSlot(
  template: TemplateSpec,
  position: number,
  length: number,
): SlotRuleSpec | undefined {
  return template.rules.find((r) => resolvePosition(r.position, length) === position);
}

// ---------------------------------------------------------------------------
// generation
// ---------------------------------------------------------------------------

type Chosen = { candidate: Candidate; position: number };

/**
 * The order constraints are given up in when a slot cannot be filled.
 *
 * Built per slot rather than as a constant, because a relaxation that is
 * reported but was never actually in force is a lie to the coordinator. A soft
 * slot rule never filters, so it can never be relaxed; only a hard one appears
 * here, and only when it actually constrains something.
 */
function relaxationLadder(rule: SlotRuleSpec | undefined): string[] {
  const ladder: string[] = [];
  if (rule?.strength === 'hard') {
    if (rule.tempoIn?.length) ladder.push('slot tempo rule');
    if (rule.deity) ladder.push('slot deity rule');
  }
  ladder.push('at most 2 per deity', 'no repeated raga');
  return ladder;
}

function violatesDiversity(
  c: Candidate,
  chosen: readonly Chosen[],
  disabled: ReadonlySet<string>,
  singleDeity: string | null | undefined,
): string | null {
  if (!disabled.has('no repeated raga') && c.raga) {
    const clash = chosen.some(
      (x) => x.candidate.raga && x.candidate.raga.toLowerCase() === c.raga!.toLowerCase(),
    );
    if (clash) return 'no repeated raga';
  }
  if (!disabled.has('at most 2 per deity')) {
    for (const d of c.deities) {
      // Festival mode constrains the whole session to one deity, so capping
      // that deity at two would make a 3-slot festival session impossible.
      if (singleDeity && d.toLowerCase() === singleDeity.toLowerCase()) continue;
      const count = chosen.filter((x) => x.candidate.deities.includes(d)).length;
      if (count >= 2) return 'at most 2 per deity';
    }
  }
  return null;
}

export function generateSession(
  pool: readonly Candidate[],
  template: TemplateSpec,
  options: GenerateOptions,
): GenerationResult {
  const length = Math.max(1, options.length);
  const freshnessDays = options.freshnessDays ?? DEFAULT_FRESHNESS_DAYS;
  const rng = makeRng(options.seed);
  const warnings: string[] = [];

  if (pool.length < 3 * length) {
    warnings.push(
      `Only ${pool.length} bhajans match the filters — fewer than 3× the ${length} slots. ` +
        `The set will be less varied; loosen whichever filter is doing the damage.`,
    );
  }
  if (pool.length === 0) {
    return { slots: [], warnings: [...warnings, 'No bhajans match the current filters.'], poolSize: 0 };
  }

  const byId = new Map(pool.map((c) => [c.id, c]));
  const chosen: Chosen[] = [];
  const used = new Set<string>();
  const slots: GeneratedSlot[] = [];

  // Locked slots keep their place and are never re-rolled.
  const lockedByPosition = new Map<number, string>();
  for (const [pos, id] of options.locked ?? []) {
    if (pos >= 1 && pos <= length && byId.has(id)) lockedByPosition.set(pos, id);
  }
  // Reserve every locked bhajan up front, so a generated slot cannot pick the
  // same one and end up with a duplicate earlier in the set.
  for (const id of lockedByPosition.values()) used.add(id);

  for (let position = 1; position <= length; position++) {
    const rule = template.rules.length ? ruleForSlot(template, position, length) : undefined;

    const lockedId = lockedByPosition.get(position);
    if (lockedId) {
      const candidate = byId.get(lockedId)!;
      chosen.push({ candidate, position });
      slots.push({
        position,
        candidate,
        reasons: ['Locked by you'],
        relaxed: [],
        recentlySung: candidate.lastSungDaysAgo !== null && candidate.lastSungDaysAgo < freshnessDays,
        locked: true,
      });
      continue;
    }

    const disabled = new Set<string>();
    const ladder = relaxationLadder(rule);
    let picked: Candidate | null = null;
    const relaxed: string[] = [];

    // Filter, and if nothing survives, relax one constraint at a time and say
    // so. Soft rules never filter — they only weight — so the ladder only ever
    // touches hard constraints.
    for (;;) {
      const eligible = pool.filter((c) => {
        if (used.has(c.id)) return false;
        if (template.singleDeity && !matchesDeity(c, template.singleDeity)) return false;
        if (rule?.strength === 'hard') {
          if (!disabled.has('slot deity rule') && !matchesDeity(c, rule.deity)) return false;
          if (!disabled.has('slot tempo rule') && !matchesTempo(c, rule.tempoIn)) return false;
        }
        if (violatesDiversity(c, chosen, disabled, template.singleDeity)) return false;
        return true;
      });

      if (eligible.length > 0) {
        // A soft rule is a PREFERENCE, and it has to behave like one whatever
        // the pool composition is. A weight multiplier cannot do that: only 240
        // of 3,607 bhajans are Ganesha, so even a large multiplier lost to the
        // sheer number of non-matching candidates and the opener almost never
        // appeared. Instead, draw from the matching subset most of the time and
        // from the whole pool otherwise — the habit holds without ever becoming
        // a rule, and generation still succeeds when nothing matches.
        let drawFrom = eligible;
        if (rule?.strength === 'soft') {
          const matching = eligible.filter(
            (c) =>
              (!rule.deity || matchesDeity(c, rule.deity)) &&
              (!rule.tempoIn?.length || matchesTempo(c, rule.tempoIn)),
          );
          if (matching.length > 0 && rng() < SOFT_RULE_PREFERENCE) drawFrom = matching;
        }

        const weights = drawFrom.map((c) => {
          let w = candidateWeight(c, freshnessDays);
          // Keep the tempo arc weakly non-decreasing through the middle slots.
          const prev = chosen[chosen.length - 1]?.candidate;
          const prevRank = tempoRank(prev?.tempo ?? null);
          const thisRank = tempoRank(c.tempo);
          if (prevRank !== null && thisRank !== null && thisRank < prevRank) w *= 0.5;
          return w;
        });
        const idx = weightedPick(weights, rng);
        picked = drawFrom[idx] ?? null;
        break;
      }

      const next = ladder.find((r) => !disabled.has(r));
      if (!next) break;
      disabled.add(next);
      relaxed.push(next);
    }

    if (!picked) {
      warnings.push(
        `Could not fill slot ${position}: the candidate pool ran out even after relaxing every constraint.`,
      );
      break;
    }

    used.add(picked.id);
    chosen.push({ candidate: picked, position });
    if (relaxed.length) {
      warnings.push(`Slot ${position} required relaxing: ${relaxed.join(', ')}.`);
    }
    slots.push({
      position,
      candidate: picked,
      reasons: explain(picked, rule, freshnessDays),
      relaxed,
      recentlySung: picked.lastSungDaysAgo !== null && picked.lastSungDaysAgo < freshnessDays,
      locked: false,
    });
  }

  const distinctDeities = new Set(slots.flatMap((s) => s.candidate.deities));
  if (length >= 4 && distinctDeities.size < 4) {
    warnings.push(
      `Only ${distinctDeities.size} distinct deities across ${length} slots; the target is at least 4.`,
    );
  }
  const languages = new Set(slots.map((s) => s.candidate.language).filter(Boolean));
  if (length >= 2 && languages.size < 2) {
    warnings.push('Every bhajan in this set is in the same language.');
  }

  return { slots, warnings, poolSize: pool.length };
}

/** Per-slot reason string. A list nobody understands is a list nobody trusts. */
function explain(
  c: Candidate,
  rule: SlotRuleSpec | undefined,
  freshnessDays: number,
): string[] {
  const reasons: string[] = [];

  if (rule?.deity && matchesDeity(c, rule.deity)) {
    reasons.push(
      rule.strength === 'soft'
        ? `${rule.deity} ${rule.position === 1 ? 'opener' : 'slot'}, the group's usual habit`
        : `${rule.deity} required here`,
    );
  }
  if (rule?.tempoIn?.length && matchesTempo(c, rule.tempoIn)) {
    reasons.push(`tempo ${c.tempo}`);
  }

  if (c.lastSungDaysAgo === null) {
    reasons.push('never sung before');
  } else if (c.lastSungDaysAgo >= freshnessDays) {
    const months = Math.round(c.lastSungDaysAgo / 30);
    reasons.push(months >= 12 ? `not sung in over a year` : `not sung in about ${months} months`);
  } else {
    reasons.push(`sung ${c.lastSungDaysAgo} days ago`);
  }

  if (c.timesSung === 0) reasons.push('new to the group');
  else if (c.timesSung <= 2) reasons.push(`sung only ${c.timesSung}×`);

  if (!c.hasReference) reasons.push('no reference pitch on file');

  return reasons;
}
