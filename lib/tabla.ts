/**
 * lib/tabla.ts — which tabla to tune, and to what.
 *
 * Pure. No Prisma import.
 *
 * The ashram owns a small set of tablas. A bhajan's Sa may or may not be one of
 * them, so the player needs telling which drum to bring and where to tune it.
 * Today the app prints Sa + 7 — the fifth — which is the traditional second
 * choice but is only an answer when that fifth happens to be a drum they own.
 *
 * Measured over the 639 sung records in the seeded history, against the C, C#,
 * D and E the ashram holds:
 *
 *   Sa itself          49.9%
 *   the fifth (Pa)    +28.5%  ->  78.4%
 *   the fourth (Ma)   +11.9%  ->  90.3%
 *   a third            +3.9%  ->  94.2%
 *   nothing usable      5.8%
 *
 * and only four tonics ever get past Sa and Pa at all: G#, B, A# and D#.
 */

import { saOf, NOTE_NAMES, type NoteName } from "./pitch";

/**
 * Degrees a tabla may sensibly be tuned to, best first.
 *
 * Sailavan: prefer the fourth over the third. Raga Desh is the example — its
 * third is absent going up and present coming down, and tuning to it "doesn't
 * sound right" where the fourth does.
 *
 * `semitones` lists the forms a degree can take. Only forms the raga actually
 * contains are considered, which is what keeps a major third off a komal-Ga
 * raga and a natural fourth off Kalyani, where the fourth is sharp.
 *
 * Degrees NOT here are deliberate: the second and the seventh sit a tone or a
 * semitone from Sa and beat against the drone, and the tritone is the tritone.
 */
export const DEGREE_PREFERENCE = [
  { key: "sa", label: "Sa", description: "the tonic", semitones: [0] },
  { key: "pa", label: "Pa", description: "the fifth", semitones: [7] },
  { key: "ma", label: "Ma", description: "the fourth", semitones: [5] },
  { key: "ga", label: "Ga", description: "the third", semitones: [4, 3] },
  { key: "dha", label: "Dha", description: "the sixth", semitones: [9, 8] },
  { key: "ni", label: "ni", description: "the flat seventh", semitones: [10] },
] as const;

export type DegreeKey = (typeof DEGREE_PREFERENCE)[number]["key"];

/**
 * How much to trust the answer.
 *
 * `certain`  — the raga's notes are known and the degree is in them.
 * `assumed`  — no notes recorded for this raga, so Sa, Pa and Ma were assumed
 *              present. True of most ragas, but not Malkauns (no Pa) or
 *              Kalyani (sharp fourth, no natural Ma), so it is worth saying.
 * `none`     — no drum they own can be tuned sensibly.
 */
export type TablaConfidence = "certain" | "assumed" | "none";

export type TablaChoice = {
  /** The drum to tune, or null when none of them works. */
  note: NoteName | null;
  degree: DegreeKey | null;
  /** Short human phrase: "the fifth of D", "no tabla fits". */
  why: string;
  confidence: TablaConfidence;
  /** Suggestions when nothing fits — Sa values a semitone away that do work. */
  alternativesIfNone: NoteName[];
};

/** Degrees assumed present when a raga's notes are unknown. */
const ASSUMED_SEMITONES = [0, 5, 7];

const pc = (n: number) => ((n % 12) + 12) % 12;

/**
 * Pick the tabla to tune.
 *
 * `ragaSemitones` is the raga's notes as semitones above Sa, or null when it is
 * not recorded — see lib/ragaScales.ts.
 */
export function recommendTabla({
  sa,
  ragaSemitones,
  available,
}: {
  /** Pitch class of the bhajan's Sa, 0..11. */
  sa: number | null;
  ragaSemitones: readonly number[] | null;
  /** The drums the ashram owns, as pitch classes. */
  available: readonly number[];
}): TablaChoice {
  const none: TablaChoice = {
    note: null,
    degree: null,
    why: "no pitch recorded",
    confidence: "none",
    alternativesIfNone: [],
  };
  if (sa === null || available.length === 0) return none;

  const owned = new Set(available.map(pc));
  const inRaga = ragaSemitones ? new Set(ragaSemitones.map(pc)) : null;
  const confidence: TablaConfidence = inRaga ? "certain" : "assumed";

  for (const degree of DEGREE_PREFERENCE) {
    for (const semitone of degree.semitones) {
      // Without a raga we only trust the three degrees nearly every raga has.
      const present = inRaga
        ? inRaga.has(pc(semitone))
        : ASSUMED_SEMITONES.includes(semitone);
      if (!present) continue;

      const candidate = pc(sa + semitone);
      if (!owned.has(candidate)) continue;

      return {
        note: NOTE_NAMES[candidate],
        degree: degree.key,
        why:
          degree.key === "sa"
            ? `Sa — tune to ${NOTE_NAMES[candidate]}`
            : `${degree.description} of ${NOTE_NAMES[pc(sa)]} — tune to ${NOTE_NAMES[candidate]}`,
        confidence,
        alternativesIfNone: [],
      };
    }
  }

  return {
    note: null,
    degree: null,
    why: `no tabla fits ${NOTE_NAMES[pc(sa)]}`,
    confidence: "none",
    alternativesIfNone: neighbouringSaThatWork(pc(sa), owned, inRaga),
  };
}

/**
 * Sa values a semitone either side that DO have a usable tabla.
 *
 * When nothing fits, the practical fix is to sing a semitone up or down, so
 * saying which direction helps is more use than saying "none".
 */
function neighbouringSaThatWork(
  sa: number,
  owned: ReadonlySet<number>,
  inRaga: ReadonlySet<number> | null,
): NoteName[] {
  const out: NoteName[] = [];
  for (const shift of [-1, 1]) {
    const candidateSa = pc(sa + shift);
    const works = DEGREE_PREFERENCE.some((d) =>
      d.semitones.some((s) => {
        const present = inRaga ? inRaga.has(pc(s)) : ASSUMED_SEMITONES.includes(s);
        return present && owned.has(pc(candidateSa + s));
      }),
    );
    if (works) out.push(NOTE_NAMES[candidateSa]);
  }
  return out;
}

/** Convenience: take a pitch label rather than a pitch class. */
export function recommendTablaForLabel(
  label: string | null | undefined,
  ragaSemitones: readonly number[] | null,
  available: readonly number[],
): TablaChoice {
  return recommendTabla({ sa: saOf(label), ragaSemitones, available });
}

/**
 * Every distinct tabla a session needs, with what each is for.
 *
 * This is the thing the player scans before leaving home.
 */
export type TablaCall = {
  note: NoteName;
  /** Bhajan titles, in session order, that want this drum. */
  forBhajans: string[];
  /** True when any of them rested on an assumed raga rather than a known one. */
  anyAssumed: boolean;
};

export function tablasForSession(
  slots: ReadonlyArray<{ title: string; choice: TablaChoice }>,
): { calls: TablaCall[]; unresolved: Array<{ title: string; choice: TablaChoice }> } {
  const byNote = new Map<NoteName, TablaCall>();
  const unresolved: Array<{ title: string; choice: TablaChoice }> = [];

  for (const slot of slots) {
    if (!slot.choice.note) {
      unresolved.push(slot);
      continue;
    }
    const call = byNote.get(slot.choice.note) ?? {
      note: slot.choice.note,
      forBhajans: [],
      anyAssumed: false,
    };
    call.forBhajans.push(slot.title);
    if (slot.choice.confidence === "assumed") call.anyAssumed = true;
    byNote.set(slot.choice.note, call);
  }

  return {
    calls: [...byNote.values()].sort(
      (a, b) => NOTE_NAMES.indexOf(a.note) - NOTE_NAMES.indexOf(b.note),
    ),
    unresolved,
  };
}
