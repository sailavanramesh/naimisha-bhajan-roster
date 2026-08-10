/**
 * lib/suggestedPitch.ts — what pitch to offer when a singer takes a bhajan.
 *
 * Pure. No Prisma import.
 *
 * This only ever produces a SUGGESTION. `SessionSlot.confirmedPitch` is the
 * historical record and the most valuable column in the database (CLAUDE.md
 * rule 6), so nothing here may overwrite one that already exists — the caller
 * is responsible for only applying this to an empty slot.
 */

import { lowestPitch, pitchRank } from "./pitch";

export type PitchSource =
  /** They recorded a preferred pitch for this bhajan on their own list. */
  | "list"
  /** They have sung this exact bhajan before. */
  | "sung"
  /** No history for this bhajan; their median offset applied to the reference. */
  | "predicted"
  /** Not enough to say anything about the singer — the bare reference. */
  | "reference"
  | "none";

export type SuggestedPitch = {
  pitch: string | null;
  source: PitchSource;
  /**
   * True when the sources disagreed and the lower was taken. Surfaced in the
   * UI: a disagreement is worth a coordinator's glance, not a silent decision.
   */
  conflicted: boolean;
  /** Every distinct candidate considered, for explaining the choice. */
  considered: string[];
};

export type PitchInputs = {
  /** `SingerRepertoire.preferredPitch` for this singer and bhajan. */
  listPitch?: string | null;
  /** Every `confirmedPitch` this singer has sung this bhajan at. */
  sungPitches?: ReadonlyArray<string | null | undefined>;
  /** Prediction from their offset profile, when there is no direct history. */
  predicted?: string | null;
  /** The plain gender reference, as the last resort. */
  reference?: string | null;
};

/**
 * Resolve the pitch to offer, preferring what the singer has actually
 * committed to over anything computed.
 *
 * When their list and their history disagree, the LOWER wins. That is the safe
 * side of a disagreement: a singer asked to sing below their usual is
 * comfortable, one asked to sing above it may not reach. "Lower" is defined by
 * the group's own printed ladder — see `pitchRank`.
 */
export function suggestPitch(inputs: PitchInputs): SuggestedPitch {
  const direct: string[] = [];

  const list = (inputs.listPitch ?? "").trim();
  if (list && pitchRank(list) !== null) direct.push(list);

  for (const p of inputs.sungPitches ?? []) {
    const s = (p ?? "").trim();
    if (s && pitchRank(s) !== null && !direct.includes(s)) direct.push(s);
  }

  if (direct.length > 0) {
    const chosen = lowestPitch(direct);
    // Distinct RANKS, not distinct strings: "1 Madhyam / F" and "4 Pancham / F"
    // are the same pitch under two names and are not a disagreement.
    const ranks = new Set(direct.map((d) => pitchRank(d)));
    return {
      pitch: chosen,
      source: chosen && chosen === list ? "list" : "sung",
      conflicted: ranks.size > 1,
      considered: direct,
    };
  }

  const predicted = (inputs.predicted ?? "").trim();
  if (predicted) {
    return { pitch: predicted, source: "predicted", conflicted: false, considered: [] };
  }

  const reference = (inputs.reference ?? "").trim();
  if (reference) {
    return { pitch: reference, source: "reference", conflicted: false, considered: [] };
  }

  return { pitch: null, source: "none", conflicted: false, considered: [] };
}

export const SOURCE_LABEL: Record<PitchSource, string> = {
  list: "from their list",
  sung: "sung before",
  predicted: "predicted",
  reference: "reference",
  none: "no pitch",
};
