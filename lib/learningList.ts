import { Gender, RepertoireKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { suggestPitch, type PitchSource } from "@/lib/suggestedPitch";
import { predictForSinger } from "@/lib/singerProfile";
import { getSingerProfile } from "@/lib/pitchQueries";
import { historyCutoff } from "@/lib/dates";

/**
 * lib/learningList.ts — one person's list, assembled once, ready to filter.
 *
 * Split out of components/LearningList.tsx on 2026-09-01. The component was a
 * server component that fetched AND rendered, which was fine while the list was
 * three accordions of plain markup. It stopped being fine the moment the list
 * needed a search box and filters: those have to run in the browser (see
 * components/LearningListView.tsx for why), and a client component cannot reach
 * Prisma. So the fetching lives here, the rendering lives there, and this
 * module's job is to hand over a plain serialisable array with every field the
 * filters ask about ALREADY on each row.
 *
 * That last part is the point. A filter that has to go back to the server to
 * find out a bhajan's raga is a filter nobody will use twice. Deity, raga,
 * tempo, when it was last sung and what the app would suggest for it are all
 * computed here, in the same handful of queries that were already running, and
 * travel with the row.
 */

/** What a suggested shruti was derived from. Re-exported so the view can name it. */
export type { PitchSource };

export type ListRow = {
  id: string;
  title: string;
  /** Null when the entry never resolved to a masterlist bhajan. */
  bhajanId: string | null;
  kind: RepertoireKind;
  note: string | null;
  /** The shruti this singer decided on. Their own claim. */
  preferredPitch: string | null;
  /** What the app would suggest, computed WITHOUT `preferredPitch`. */
  hintPitch: string | null;
  hintSource: PitchSource | null;
  deities: string[];
  raga: string | null;
  tempo: string | null;
  /** ISO date (UTC calendar date) they last sang it on the roster, if ever. */
  lastSungISO: string | null;
  /** How many times it appears in their history. */
  timesSung: number;
  isFestival: boolean;
  updatedAtISO: string;
};

export type LearningListData = {
  rows: ListRow[];
  /** Every shruti label the app knows, for the picker on a card. */
  shrutiLabels: string[];
};

/**
 * Everything one singer's list needs, in four queries.
 *
 * The shape of the work is unchanged from the component this came out of — the
 * same four round trips, the same two that can run in parallel — so moving it
 * here cost nothing. What is new is that the per-row derivations (`hintFor`,
 * `lastSung`) now run once here and are written onto the row, rather than being
 * recomputed inside the render.
 */
export async function learningListFor(
  singerId: string,
  singerName: string,
): Promise<LearningListData> {
  const [entries, labels, singer] = await Promise.all([
    prisma.singerRepertoire.findMany({
      where: {
        singerId,
        kind: {
          in: [RepertoireKind.wantToLearn, RepertoireKind.learning, RepertoireKind.known],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      include: { bhajan: { include: { deities: { include: { deity: true } } } } },
    }),
    prisma.pitchLabel.findMany({
      orderBy: [{ step: "asc" }, { series: "asc" }],
      select: { label: true },
    }),
    prisma.singer.findUnique({ where: { id: singerId }, select: { gender: true } }),
  ]);

  /*
   * WHAT WOULD THIS PERSON SING EACH OF THESE AT, AND WHEN DID THEY LAST?
   *
   * One query for the whole list — every slot this singer has filled for any
   * bhajan on it — rather than one per row. Only what has actually happened: a
   * pitch typed onto next Thursday is a plan, and a plan is not evidence of
   * anything (lib/dates.ts).
   */
  const bhajanIds = entries.map((e) => e.bhajanId).filter((x): x is string => Boolean(x));
  const [sung, profileRow] = await Promise.all([
    bhajanIds.length > 0
      ? prisma.sessionSlot.findMany({
          where: {
            singerId,
            bhajanId: { in: bhajanIds },
            session: { date: { lte: historyCutoff() } },
          },
          select: { bhajanId: true, confirmedPitch: true, session: { select: { date: true } } },
        })
      : Promise.resolve([]),
    getSingerProfile(singerId, singerName),
  ]);

  const sungPitches = new Map<string, string[]>();
  const lastSung = new Map<string, Date>();
  const timesSung = new Map<string, number>();
  for (const s of sung) {
    if (!s.bhajanId) continue;
    if (s.confirmedPitch) {
      sungPitches.set(s.bhajanId, [...(sungPitches.get(s.bhajanId) ?? []), s.confirmedPitch]);
    }
    /*
     * A pitch is NOT required for the count or the date. A slot can record that
     * somebody sang without anybody having written the shruti down, and that
     * still happened — which is why these two maps are filled outside the
     * `confirmedPitch` guard above and `sungPitches` is filled inside it.
     */
    timesSung.set(s.bhajanId, (timesSung.get(s.bhajanId) ?? 0) + 1);
    const at = s.session.date;
    const best = lastSung.get(s.bhajanId);
    if (!best || at > best) lastSung.set(s.bhajanId, at);
  }

  const labelStrings = labels.map((l) => l.label);

  const rows: ListRow[] = entries.map((e) => {
    /*
     * The hint, computed WITHOUT the saved value, deliberately. Feeding
     * `preferredPitch` back in would make the hint agree with the field it sits
     * beside every time, which tells nobody anything; leaving it out keeps it a
     * second opinion, and lets a saved shruti be checked against what the singer
     * has actually done. That check is now a filter — see "disagrees".
     */
    let hintPitch: string | null = null;
    let hintSource: PitchSource | null = null;
    if (e.bhajan) {
      const reference =
        singer?.gender === Gender.Ladies
          ? e.bhajan.referenceLadiesPitch
          : e.bhajan.referenceGentsPitch;
      const predicted = predictForSinger(
        profileRow.profile,
        reference,
        e.bhajan.raga,
        labelStrings,
      );
      const hint = suggestPitch({
        sungPitches: sungPitches.get(e.bhajan.id) ?? [],
        predicted: predicted.predicted ? predicted.label : null,
        reference,
      });
      if (hint.pitch) {
        hintPitch = hint.pitch;
        hintSource = hint.source;
      }
    }

    const sungAt = e.bhajanId ? lastSung.get(e.bhajanId) ?? null : null;

    return {
      id: e.id,
      title: e.title,
      bhajanId: e.bhajanId,
      kind: e.kind,
      note: e.note,
      preferredPitch: e.preferredPitch,
      hintPitch,
      hintSource,
      deities: e.bhajan?.deities.map((d) => d.deity.name) ?? [],
      raga: e.bhajan?.raga ?? null,
      tempo: e.bhajan?.tempo ?? null,
      // `Session.date` is a calendar date stored at UTC midnight, so it is
      // sliced in UTC and formatted in UTC by the view. See CLAUDE.md.
      lastSungISO: sungAt ? sungAt.toISOString().slice(0, 10) : null,
      timesSung: e.bhajanId ? timesSung.get(e.bhajanId) ?? 0 : 0,
      isFestival: e.isFestival,
      updatedAtISO: e.updatedAt.toISOString(),
    };
  });

  return { rows, shrutiLabels: labelStrings };
}
