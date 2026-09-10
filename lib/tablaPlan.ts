import { prisma } from "@/lib/db";
import { saOf, type NoteName } from "@/lib/pitch";
import { ragaScale } from "@/lib/ragaScales";
import {
  recommendTablaForLabel,
  tablasForSession,
  ASHRAM_TABLAS,
  ASHRAM_TABLA_PC,
  overrideKey,
  isDegreeKey,
  type DegreeKey,
  type TablaChoice,
} from "@/lib/tabla";

export { ASHRAM_TABLAS, overrideKey };

/** What settled this row's answer. Shown, because it decides where to correct it. */
export type DecidedBy = "rule" | "raga" | "hand";

export type PlannedSlot = {
  position: number;
  title: string;
  raga: string | null;
  confirmedPitch: string | null;
  choice: TablaChoice;
  /** True when a coordinator's decision produced this, not the rule. */
  overridden: boolean;
  overrideReason: string | null;
  /** For the override control: the Sa this bhajan is at. */
  sa: number | null;
  /** The raga's notes as semitones above Sa, or null when not recorded. */
  ragaSemitones: readonly number[] | null;
  /** Which layer answered: the standard order, a raga rule, or a hand-set note. */
  decidedBy: DecidedBy;
  /** The raga rule in force, if any. */
  ragaRule: { degree: DegreeKey; reason: string | null } | null;
};

/**
 * Work out the tabla for every slot in a session.
 *
 * ## Three layers, most specific first
 *
 *   1. a HAND-SET note for (raga, Sa) — or for any raga at that Sa;
 *   2. a RAGA RULE, which reorders the degrees for that raga at every pitch;
 *   3. the standard order in lib/tabla.ts.
 *
 * They answer different questions and that is why there are three. A hand-set
 * note settles one pitch and cannot generalise, because the right drum changes
 * with Sa. A raga rule generalises across pitches, because a degree does. The
 * standard order is what applies when nobody has said otherwise.
 *
 * `decidedBy` travels with each slot so the panel can say which layer answered
 * — without that, a correction gets made at whichever level is nearest to hand
 * rather than the one that would stop the question recurring.
 */
export async function planTablas(sessionId: string): Promise<{
  slots: PlannedSlot[];
  calls: ReturnType<typeof tablasForSession>["calls"];
  unresolved: ReturnType<typeof tablasForSession>["unresolved"];
}> {
  /*
   * One wave. Round trips are what the burstable database's throttling
   * multiplies (CLAUDE.md), and none of these three depends on another.
   */
  const [rows, overrides, ragaRules] = await Promise.all([
    prisma.sessionSlot.findMany({
      where: { sessionId },
      orderBy: [{ position: "asc" }],
      select: {
        position: true,
        confirmedPitch: true,
        bhajanTitle: true,
        festivalBhajanTitle: true,
        bhajan: { select: { title: true, raga: true } },
      },
    }),
    prisma.tablaOverride.findMany(),
    prisma.tablaRagaRule.findMany(),
  ]);

  const byKey = new Map(overrides.map((o) => [`${o.raga}|${o.sa}`, o]));
  const rulesByRaga = new Map(ragaRules.map((r) => [r.raga, r]));

  const slots: PlannedSlot[] = rows.map((r) => {
    const raga = r.bhajan?.raga ?? null;
    const title = r.bhajan?.title ?? r.bhajanTitle ?? r.festivalBhajanTitle ?? "—";
    const sa = saOf(r.confirmedPitch);
    const ragaSemitones = ragaScale(raga);

    /*
     * A stored degree is a plain string, and the set of degree keys is code.
     * Anything unrecognised is ignored rather than trusted — a rule written
     * against a degree that no longer exists must not silently become "no
     * preference at all and also no way to tell".
     */
    const stored = rulesByRaga.get(overrideKey(raga));
    const ragaRule =
      stored && isDegreeKey(stored.degree)
        ? { degree: stored.degree, reason: stored.reason ?? null }
        : null;

    const computed = recommendTablaForLabel(
      r.confirmedPitch,
      ragaSemitones,
      ASHRAM_TABLA_PC,
      ragaRule?.degree ?? null,
    );

    // Most specific first: this raga at this Sa, then any raga at this Sa.
    const hit =
      sa === null ? undefined : byKey.get(`${overrideKey(raga)}|${sa}`) ?? byKey.get(`|${sa}`);

    const common = {
      position: r.position,
      title,
      raga,
      confirmedPitch: r.confirmedPitch,
      sa,
      ragaSemitones,
      ragaRule,
    };

    if (!hit) {
      return {
        ...common,
        choice: computed,
        overridden: false,
        overrideReason: null,
        decidedBy: ragaRule && computed.degree === ragaRule.degree ? "raga" : "rule",
      };
    }

    const note = (hit.note ?? null) as NoteName | null;
    return {
      ...common,
      choice: {
        note,
        degree: null,
        why: note ? `set by hand — tune to ${note}` : "set by hand — no tabla for this",
        confidence: note ? "certain" : "none",
        alternativesIfNone: note ? [] : computed.alternativesIfNone,
        /*
         * The working the RULE would have produced still travels, so a reader
         * can see what a hand-set answer is overriding. An override with no
         * visible alternative is the thing that gets left in place for years
         * after the rule that needed correcting was fixed.
         */
        steps: computed.steps,
      },
      overridden: true,
      overrideReason: hit.reason ?? null,
      decidedBy: "hand",
    };
  });

  const { calls, unresolved } = tablasForSession(
    slots.map((s) => ({ title: s.title, choice: s.choice })),
  );
  return { slots, calls, unresolved };
}
