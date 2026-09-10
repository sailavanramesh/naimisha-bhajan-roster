/**
 * lib/tabla.ts — which tabla to tune, and to what.
 *
 * Pure. No Prisma import.
 *
 * The ashram owns a small set of tablas. A bhajan's Sa may or may not be one of
 * them, so the player needs telling which drum to bring and where to tune it.
 *
 * ## The order: Sa, then Pa, then Ma
 *
 * Sailavan, 2026-09-10: "it should be the Pa over Ma in ragas where Pa exists
 * in the Raga. If only Ma in the Raga, then Ma."
 *
 * The second sentence needs no code of its own — it is what the raga check
 * below already does. Every degree is tested against `ragaSemitones`, so a raga
 * with no Pa simply falls through to Ma without being asked to. Malkauns has no
 * Pa; Hamsadhwani has no Ma. Where the raga's notes are unknown the answer is
 * marked `assumed` rather than `certain`, so it can be shown as a guess.
 *
 * ## THIS REVERSED ON 2026-09-10, and the old reasoning is worth keeping
 *
 * Ma came first until then, on Sailavan's instruction of 2026-08-20: "4.5
 * madhyam should prioritise the Sa, then Ma, then it depends on the raga to
 * decide which note is next best." What prompted the change was two rows on one
 * session — Yaman Kalyan and Desh, both at Sa G — being given the fourth where
 * he wanted the fifth. Desh is the honest case: its shudh Ma is a real, strong
 * note, so the rule was reasoning correctly from correct data and still giving
 * the wrong answer. That is a preference, not a bug, and it turned out to be
 * general rather than about Desh.
 *
 * Measured over the 672 sung records with a confirmed pitch, against the C, C#,
 * D and E the ashram holds:
 *
 *                    Ma first      Pa first
 *   Sa itself          346           346
 *   the fifth (Pa)      76           177
 *   the fourth (Ma)    171            70
 *   a third              18            18
 *   a sixth              30            30
 *   a flat seventh       10            10
 *   nothing usable       21            21
 *
 * 101 of 672 rows (15%) change drum. **Coverage is identical** — the same 21
 * rows fit no drum either way — so the choice was purely musical and nothing
 * practical was traded for it.
 *
 * One thing the reversal quietly fixed: `yaman` and `yaman kalyan` disagreed,
 * because lib/ragaScales.ts lists BOTH fourths for the latter (true of the
 * raga, where shudh Ma is an ornamental touch in descent, but not something
 * anyone would tune a drum to). Under Pa-first they agree again. `shuddha
 * sarang` and `bihag` are the other two entries carrying both fourths.
 */

import { saOf, NOTE_NAMES, type NoteName } from "./pitch";

/**
 * What the ashram owns.
 *
 * A constant rather than a table: four drums that change about never. If the
 * centre buys a fifth, this line is the change.
 *
 * Lives here, in the pure module, because the roster grid needs it in the
 * BROWSER to recompute a row's tabla as the pitch is edited — anything it
 * imports must not drag Prisma into the client bundle.
 */
export const ASHRAM_TABLAS: readonly NoteName[] = ["C", "C#", "D", "E"];
export const ASHRAM_TABLA_PC: readonly number[] = ASHRAM_TABLAS.map((n) => NOTE_NAMES.indexOf(n));

/** Normalisation shared by the raga table and the override keys. */
export function overrideKey(raga: string | null | undefined): string {
  return (raga ?? "").replace(/^\s*~\s*/, "").trim().toLowerCase();
}

/**
 * Apply a coordinator's override, falling back to the rule.
 *
 * `overrides` is keyed "<ragaKey>|<sa>", with "" for "any raga at this Sa".
 * A key present with a null value means "nothing fits" was recorded on
 * purpose, which is different from no answer having been given.
 */
export function tablaWithOverride(
  label: string | null | undefined,
  raga: string | null | undefined,
  ragaSemitones: readonly number[] | null,
  overrides: Readonly<Record<string, string | null>>,
): { note: NoteName | null; overridden: boolean } {
  const sa = saOf(label);
  if (sa === null) return { note: null, overridden: false };

  for (const key of [`${overrideKey(raga)}|${sa}`, `|${sa}`]) {
    if (key in overrides) {
      return { note: (overrides[key] as NoteName | null) ?? null, overridden: true };
    }
  }
  return {
    note: recommendTablaForLabel(label, ragaSemitones, ASHRAM_TABLA_PC).note,
    overridden: false,
  };
}

/**
 * Degrees a tabla may sensibly be tuned to, best first.
 *
 * Sa, then the fifth, then the fourth — see the order at the top of the file.
 * Both of those beat the third: raga Desh is the example Sailavan gave for that
 * part, its third being absent going up and present coming down, and tuning to
 * it "doesn't sound right" where a fourth or fifth does.
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

/** Is this stored string still one of the degrees the rule knows? */
export function isDegreeKey(value: string): value is DegreeKey {
  return DEGREE_PREFERENCE.some((d) => d.key === value);
}

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

/**
 * One degree considered, and what became of it.
 *
 * The point of keeping these is that the answer stops being an assertion.
 * Sailavan, 2026-09-10, asked for "that amount of the working being visible...
 * so its not manually being changed everytime and the rule can cover more
 * scenarios" — and a rule you can read is a rule you can correct at the right
 * level, rather than one you patch per bhajan forever.
 *
 * There is one step per FORM of a degree, not per degree: a third can be major
 * or minor and the raga decides which, so both are worth showing.
 */
export type TablaStep = {
  degree: DegreeKey;
  /** "Pa", "Ma" — and "Ga♭" where a degree has two forms. */
  label: string;
  /** "the fifth", "the fourth". */
  description: string;
  /** Semitones above Sa. */
  semitone: number;
  /** The drum this degree asks for at this Sa. */
  note: NoteName;
  /** Is that note in the raga? `null` when the raga's notes are not recorded. */
  inRaga: boolean | null;
  /** Does the ashram own that drum? */
  owned: boolean;
  /** The one that won. */
  chosen: boolean;
  /** Why it was passed over, in words. Null when it was chosen. */
  passed: string | null;
};

export type TablaChoice = {
  /** The drum to tune, or null when none of them works. */
  note: NoteName | null;
  degree: DegreeKey | null;
  /** Short human phrase: "the fifth of D", "no tabla fits". */
  why: string;
  confidence: TablaConfidence;
  /** Suggestions when nothing fits — Sa values a semitone away that do work. */
  alternativesIfNone: NoteName[];
  /** Every degree considered, in the order they were considered. */
  steps: TablaStep[];
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
  preferDegree,
}: {
  /** Pitch class of the bhajan's Sa, 0..11. */
  sa: number | null;
  ragaSemitones: readonly number[] | null;
  /** The drums the ashram owns, as pitch classes. */
  available: readonly number[];
  /** A raga's own preference, tried before the standard order. */
  preferDegree?: DegreeKey | null;
}): TablaChoice {
  const none: TablaChoice = {
    note: null,
    degree: null,
    why: "no pitch recorded",
    confidence: "none",
    alternativesIfNone: [],
    steps: [],
  };
  if (sa === null || available.length === 0) return none;

  const owned = new Set(available.map(pc));
  const inRaga = ragaSemitones ? new Set(ragaSemitones.map(pc)) : null;
  const confidence: TablaConfidence = inRaga ? "certain" : "assumed";

  /*
   * The whole list is walked even after a winner is found, so the working is
   * complete rather than stopping where the answer did. It is six degrees
   * against a set of four drums; the cost is nothing and the panel can then
   * show WHY the ones above the answer were passed over, which is the half that
   * makes the rule arguable instead of merely stated.
   */
  const steps: TablaStep[] = [];
  let winner: { degree: (typeof DEGREE_PREFERENCE)[number]; note: number } | null = null;

  for (const degree of orderedDegrees(preferDegree)) {
    for (const semitone of degree.semitones) {
      // Without a raga we only trust the three degrees nearly every raga has.
      const present = inRaga
        ? inRaga.has(pc(semitone))
        : ASSUMED_SEMITONES.includes(semitone);
      const candidate = pc(sa + semitone);
      const isOwned = owned.has(candidate);
      const takeIt = present && isOwned && winner === null;

      if (takeIt) winner = { degree, note: candidate };

      steps.push({
        degree: degree.key,
        label: formLabel(degree, semitone),
        description: degree.description,
        semitone,
        note: NOTE_NAMES[candidate],
        inRaga: inRaga ? present : null,
        owned: isOwned,
        chosen: takeIt,
        passed: takeIt
          ? null
          : !present
            ? inRaga
              ? "not in this raga"
              : "not one of the three assumed"
            : !isOwned
              ? `the ashram has no ${NOTE_NAMES[candidate]}`
              : "a better degree won",
      });
    }
  }

  if (winner) {
    const { degree, note } = winner;
    return {
      note: NOTE_NAMES[note],
      degree: degree.key,
      why:
        degree.key === "sa"
          ? `Sa — tune to ${NOTE_NAMES[note]}`
          : `${degree.description} of ${NOTE_NAMES[pc(sa)]} — tune to ${NOTE_NAMES[note]}`,
      confidence,
      alternativesIfNone: [],
      steps,
    };
  }

  return {
    note: null,
    degree: null,
    why: `no tabla fits ${NOTE_NAMES[pc(sa)]}`,
    confidence: "none",
    alternativesIfNone: neighbouringSaThatWork(pc(sa), owned, inRaga),
    steps,
  };
}

/**
 * The degree order, with one degree pulled to the front.
 *
 * `preferDegree` is a raga's own rule — "for this raga, try the fourth first" —
 * and it MOVES a degree rather than adding one, so a raga rule can never
 * conjure a note the raga does not contain. The scale check still applies to
 * it, which is what keeps a preference from overriding the music.
 */
function orderedDegrees(
  preferDegree: DegreeKey | null | undefined,
): ReadonlyArray<(typeof DEGREE_PREFERENCE)[number]> {
  if (!preferDegree) return DEGREE_PREFERENCE;
  const first = DEGREE_PREFERENCE.find((d) => d.key === preferDegree);
  if (!first) return DEGREE_PREFERENCE;
  return [first, ...DEGREE_PREFERENCE.filter((d) => d.key !== preferDegree)];
}

/**
 * What to call one FORM of a degree.
 *
 * A third is "Ga" when major and "Ga♭" when minor, and the working has to say
 * which of the two it checked or the two rows read as a duplicate.
 */
function formLabel(degree: (typeof DEGREE_PREFERENCE)[number], semitone: number): string {
  if (degree.semitones.length < 2) return degree.label;
  return semitone === degree.semitones[0] ? degree.label : `${degree.label}♭`;
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
  preferDegree?: DegreeKey | null,
): TablaChoice {
  return recommendTabla({ sa: saOf(label), ragaSemitones, available, preferDegree });
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
