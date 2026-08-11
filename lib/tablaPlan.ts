import { prisma } from "@/lib/db";
import { saOf, type NoteName } from "@/lib/pitch";
import { ragaScale } from "@/lib/ragaScales";
import {
  recommendTablaForLabel,
  tablasForSession,
  ASHRAM_TABLAS,
  ASHRAM_TABLA_PC,
  overrideKey,
  type TablaChoice,
} from "@/lib/tabla";

export { ASHRAM_TABLAS, overrideKey };

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
};

/**
 * Work out the tabla for every slot in a session, applying overrides.
 *
 * An override wins outright. It is keyed on (raga, Sa) with "" meaning any
 * raga, so the more specific decision is preferred and a blanket one still
 * catches the rest.
 */
export async function planTablas(sessionId: string): Promise<{
  slots: PlannedSlot[];
  calls: ReturnType<typeof tablasForSession>["calls"];
  unresolved: ReturnType<typeof tablasForSession>["unresolved"];
}> {
  const rows = await prisma.sessionSlot.findMany({
    where: { sessionId },
    orderBy: [{ position: "asc" }],
    select: {
      position: true,
      confirmedPitch: true,
      bhajanTitle: true,
      festivalBhajanTitle: true,
      bhajan: { select: { title: true, raga: true } },
    },
  });

  const overrides = await prisma.tablaOverride.findMany();
  const byKey = new Map(overrides.map((o) => [`${o.raga}|${o.sa}`, o]));

  const slots: PlannedSlot[] = rows.map((r) => {
    const raga = r.bhajan?.raga ?? null;
    const title = r.bhajan?.title ?? r.bhajanTitle ?? r.festivalBhajanTitle ?? "—";
    const sa = saOf(r.confirmedPitch);

    const computed = recommendTablaForLabel(r.confirmedPitch, ragaScale(raga), ASHRAM_TABLA_PC);

    // Most specific first: this raga at this Sa, then any raga at this Sa.
    const hit =
      sa === null
        ? undefined
        : byKey.get(`${overrideKey(raga)}|${sa}`) ?? byKey.get(`|${sa}`);

    if (!hit) {
      return { position: r.position, title, raga, confirmedPitch: r.confirmedPitch, choice: computed, overridden: false, overrideReason: null, sa };
    }

    const note = (hit.note ?? null) as NoteName | null;
    return {
      position: r.position,
      title,
      raga,
      confirmedPitch: r.confirmedPitch,
      choice: {
        note,
        degree: null,
        why: note ? `set by hand — tune to ${note}` : "set by hand — no tabla for this",
        confidence: note ? "certain" : "none",
        alternativesIfNone: note ? [] : computed.alternativesIfNone,
      },
      overridden: true,
      overrideReason: hit.reason ?? null,
      sa,
    };
  });

  const { calls, unresolved } = tablasForSession(
    slots.map((s) => ({ title: s.title, choice: s.choice })),
  );
  return { slots, calls, unresolved };
}
