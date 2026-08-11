import { prisma } from "@/lib/db";
import { RepertoireKind, Gender } from "@prisma/client";
import { similarBhajans, type BhajanFeatures } from "@/lib/bhajanSimilarity";
import { suggestPitch } from "@/lib/suggestedPitch";
import { getPitchLabels, getSingerProfile } from "@/lib/pitchQueries";
import { getBhajanPool } from "@/lib/bhajanPool";
import { melbourneTodayISO } from "@/lib/dates";
import { predictForSinger } from "@/lib/singerProfile";
import { balancedRepertoireOrder } from "@/lib/repertoireOrder";
import type { Suggestion, SuggestionGroup } from "./AddSingerPanel";

/**
 * Build the singer-first suggestions for the assign page.
 *
 * Kept out of page.tsx because it is the substantial half of that route and
 * page.tsx is already doing the fairness assignment.
 *
 * The similarity pool is every bhajan with at least one musical field
 * recorded. Loading it in full is deliberate: it is ~3,600 rows of six short
 * columns, cheap next to the round trips a per-candidate query would cost, and
 * the scoring is a pure function over the lot.
 */
export async function buildSuggestions(opts: {
  sessionId: string;
  singerId: string;
  singerName: string;
  gender: Gender | null;
}): Promise<SuggestionGroup[]> {
  const { sessionId, singerId, gender } = opts;

  const [repertoire, sung, sessionSlots, pool, rungs, profiles] = await Promise.all([
    prisma.singerRepertoire.findMany({
      where: { singerId },
      include: { bhajan: { include: { deities: { include: { deity: true } } } } },
    }),
    prisma.sessionSlot.findMany({
      where: { singerId, bhajanId: { not: null } },
      select: { bhajanId: true, confirmedPitch: true, session: { select: { date: true } } },
    }),
    prisma.sessionSlot.findMany({
      where: { sessionId },
      include: { bhajan: { include: { deities: { include: { deity: true } } } } },
    }),
    // Cached in process: the masterlist changes a few times a month and this
    // read was ~1.5s of the ~1.7s it took to open a singer's suggestions.
    getBhajanPool(),
    getPitchLabels(),
    // One singer's profile, not all of them. The page only needs this person.
    getSingerProfile(singerId, opts.singerName),
  ]);

  const labels = rungs.map((r) => r.label);
  const profile = profiles.profile;

  const features = new Map<string, BhajanFeatures>();
  const referenceOf = new Map<string, string | null>();
  const ragaOf = new Map<string, string | null>();
  for (const b of pool) {
    features.set(b.id, {
      id: b.id,
      title: b.title,
      deities: b.deities,
      raga: b.raga,
      tempo: b.tempo,
      beat: b.beat,
      language: b.language,
      level: b.level,
    });
    referenceOf.set(
      b.id,
      gender === Gender.Ladies ? b.referenceLadiesPitch : b.referenceGentsPitch,
    );
    ragaOf.set(b.id, b.raga);
  }

  /** Every pitch this singer has sung a given bhajan at. */
  const sungPitches = new Map<string, string[]>();
  for (const s of sung) {
    if (!s.bhajanId || !s.confirmedPitch) continue;
    const list = sungPitches.get(s.bhajanId) ?? [];
    list.push(s.confirmedPitch);
    sungPitches.set(s.bhajanId, list);
  }

  /** How long ago this singer last sang each bhajan. Null means never. */
  const daysSince = new Map<string, number>();
  const todayMs = Date.parse(`${melbourneTodayISO()}T00:00:00.000Z`);
  for (const s of sung) {
    if (!s.bhajanId) continue;
    const days = Math.round((todayMs - s.session.date.getTime()) / 86_400_000);
    const best = daysSince.get(s.bhajanId);
    if (best === undefined || days < best) daysSince.set(s.bhajanId, days);
  }

  const listPitches = new Map<string, string | null>();
  for (const r of repertoire) {
    if (r.bhajanId) listPitches.set(r.bhajanId, r.preferredPitch);
  }

  // Never suggest something already in this session.
  const alreadyHere = new Set(
    sessionSlots.map((s) => s.bhajanId).filter((x): x is string => Boolean(x)),
  );

  const toSuggestion = (bhajanId: string, reasons: string[]): Suggestion | null => {
    const f = features.get(bhajanId);
    if (!f) return null;

    const reference = referenceOf.get(bhajanId) ?? null;
    const predicted = predictForSinger(profile, reference, ragaOf.get(bhajanId) ?? null, labels);

    return {
      bhajanId,
      title: f.title,
      deities: [...f.deities],
      raga: f.raga,
      reasons,
      pitch: suggestPitch(
        {
          listPitch: listPitches.get(bhajanId) ?? null,
          sungPitches: sungPitches.get(bhajanId) ?? [],
          predicted: predicted.predicted ? predicted.label : null,
          reference,
        },
      ),
    };
  };

  const KIND_LABEL: Record<RepertoireKind, string> = {
    known: "knows it",
    festival: "festival",
    learning: "learning",
    wantToLearn: "wants to learn",
  };

  /*
   * Their whole list, in a useful order — not the first twelve alphabetically.
   *
   * All of it is sent: the largest repertoire here is 93 rows of four short
   * fields, which is nothing next to the 3,600-row pool already being loaded,
   * and it is what lets the panel search the lot without another round trip.
   * The panel shows a dozen and reveals the rest on demand.
   */
  const fromList: Suggestion[] = balancedRepertoireOrder(
    repertoire
      .filter((r) => r.bhajanId && !alreadyHere.has(r.bhajanId))
      .map((r) => ({
        id: r.bhajanId!,
        kindRank: rank(r.kind),
        daysSinceSung: daysSince.get(r.bhajanId!) ?? null,
        deity: features.get(r.bhajanId!)?.deities[0] ?? null,
        kind: r.kind,
      })),
  )
    .map((r) => toSuggestion(r.id, [KIND_LABEL[r.kind]]))
    .filter((x): x is Suggestion => x !== null);

  // Anchors for "more like what they know": their list plus what they have sung.
  const anchorIds = new Set<string>([
    ...repertoire.map((r) => r.bhajanId).filter((x): x is string => Boolean(x)),
    ...sungPitches.keys(),
  ]);
  const anchors = [...anchorIds].map((id) => features.get(id)).filter((x): x is BhajanFeatures => Boolean(x));

  const exclude = new Set<string>([...alreadyHere, ...anchorIds]);

  const likeTheirs = similarBhajans(anchors, pool.map((b) => features.get(b.id)!), {
    count: 8,
    exclude,
  }).map((s) => toSuggestion(s.id, s.reasons)).filter((x): x is Suggestion => x !== null);

  const sessionAnchors = sessionSlots
    .map((s) => (s.bhajanId ? features.get(s.bhajanId) : null))
    .filter((x): x is BhajanFeatures => Boolean(x));

  const likeSession = similarBhajans(sessionAnchors, pool.map((b) => features.get(b.id)!), {
    count: 8,
    exclude: new Set([...exclude, ...likeTheirs.map((s) => s.bhajanId)]),
  }).map((s) => toSuggestion(s.id, s.reasons)).filter((x): x is Suggestion => x !== null);

  return [
    {
      key: "list",
      heading: "On their list",
      blurb:
        "What they have told us they know, are learning, or want to learn — what they have " +
        "not sung for the longest first.",
      items: fromList,
    },
    {
      key: "like-theirs",
      heading: "Close to what they know",
      blurb: "Matched on raga, deity, tempo and beat against their own repertoire.",
      items: likeTheirs,
    },
    {
      key: "like-session",
      heading: "Fits this session",
      blurb: "Matched against the bhajans already in this session.",
      items: likeSession,
    },
  ];
}

/** known < festival < learning < wantToLearn, readiest first. */
function rank(kind: RepertoireKind): number {
  switch (kind) {
    case RepertoireKind.known:
      return 0;
    case RepertoireKind.festival:
      return 1;
    case RepertoireKind.learning:
      return 2;
    default:
      return 3;
  }
}
