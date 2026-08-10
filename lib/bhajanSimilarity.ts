/**
 * lib/bhajanSimilarity.ts — "find me bhajans like this one".
 *
 * Pure. No Prisma import.
 *
 * Similarity is computed over what the masterlist already records: deity,
 * raga, tempo, beat, language, level and tags. Deliberately NOT text
 * embeddings — that would mean a third-party API, which sits outside the
 * centre's Azure sponsorship, and the resemblance that matters here is
 * musical rather than semantic. Two bhajans in Kalyani at the same tempo
 * genuinely belong near each other; two with similar words do not.
 *
 * Every feature is categorical, so this is a weighted overlap (a Jaccard-style
 * score per field, combined by weight) rather than a cosine over a dense
 * vector. Same idea, but it degrades sensibly when fields are missing — which
 * matters here, because the masterlist has real gaps: 565 bhajans have no
 * raga, 1,115 no tempo, 583 no beat (CLAUDE.md).
 */

export type BhajanFeatures = {
  id: string;
  title: string;
  deities: readonly string[];
  raga: string | null;
  tempo: string | null;
  beat: string | null;
  language: string | null;
  level: string | null;
  tags?: readonly string[];
};

/**
 * How much each field counts.
 *
 * Raga leads because it is the strongest musical statement a bhajan makes, and
 * a singer comfortable in one raga is usually comfortable in it again. Deity
 * is next: it decides where a bhajan can sit in a session at all. Language is
 * weighted low on purpose — it is the field most likely to be the ONLY thing
 * two bhajans share, and letting it dominate would return a wall of
 * "also in Sanskrit".
 */
export const WEIGHTS = {
  raga: 3.0,
  deity: 2.5,
  tempo: 1.2,
  beat: 1.0,
  tags: 1.0,
  level: 0.6,
  language: 0.5,
} as const;

function norm(value: string | null | undefined): string | null {
  const s = (value ?? "").trim().toLowerCase();
  return s === "" ? null : s;
}

/**
 * Overlap between two sets, 0..1, or null when either side is empty.
 *
 * Null rather than 0 is the important part: an unknown raga is not evidence of
 * dissimilarity, so it must drop out of the average instead of dragging the
 * score down. Scoring a missing field as zero would rank fully-described
 * bhajans below sparse ones for no musical reason.
 */
function overlap(a: readonly string[], b: readonly string[]): number | null {
  const setA = new Set(a.map(norm).filter((x): x is string => x !== null));
  const setB = new Set(b.map(norm).filter((x): x is string => x !== null));
  if (setA.size === 0 || setB.size === 0) return null;
  let shared = 0;
  for (const x of setA) if (setB.has(x)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? null : shared / union;
}

/**
 * A raga name is often dual, "Kalyani / Yaman". Comparing the whole string
 * would call those two different from a bhajan listed as plain "Yaman", so
 * split and compare the parts.
 */
function ragaParts(raga: string | null): string[] {
  if (!raga) return [];
  return raga
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
}

export type Similarity = { score: number; reasons: string[] };

/** Score two bhajans, 0..1, with the fields that drove it. */
export function similarity(a: BhajanFeatures, b: BhajanFeatures): Similarity {
  const parts: Array<{ key: keyof typeof WEIGHTS; value: number | null; label: string }> = [
    { key: "raga", value: overlap(ragaParts(a.raga), ragaParts(b.raga)), label: "same raga" },
    { key: "deity", value: overlap(a.deities, b.deities), label: "same deity" },
    { key: "tempo", value: overlap(a.tempo ? [a.tempo] : [], b.tempo ? [b.tempo] : []), label: "same tempo" },
    { key: "beat", value: overlap(a.beat ? [a.beat] : [], b.beat ? [b.beat] : []), label: "same beat" },
    { key: "tags", value: overlap(a.tags ?? [], b.tags ?? []), label: "shared tags" },
    { key: "level", value: overlap(a.level ? [a.level] : [], b.level ? [b.level] : []), label: "same level" },
    {
      key: "language",
      value: overlap(a.language ? [a.language] : [], b.language ? [b.language] : []),
      label: "same language",
    },
  ];

  let weighted = 0;
  let total = 0;
  const reasons: string[] = [];

  for (const part of parts) {
    if (part.value === null) continue; // unknown on one side — no evidence either way
    const w = WEIGHTS[part.key];
    weighted += part.value * w;
    total += w;
    if (part.value > 0) reasons.push(part.label);
  }

  if (total === 0) return { score: 0, reasons: [] };
  return { score: weighted / total, reasons };
}

export type SimilarBhajan = BhajanFeatures & Similarity;

/**
 * The `count` bhajans in `pool` most like any of `anchors`.
 *
 * Scores against the BEST-matching anchor rather than the average, so a
 * suggestion that strongly resembles one bhajan the singer knows is not
 * diluted by being unlike the rest of their repertoire.
 *
 * Anchors, and anything in `exclude`, are never returned.
 */
export function similarBhajans(
  anchors: readonly BhajanFeatures[],
  pool: readonly BhajanFeatures[],
  { count = 8, exclude = new Set<string>(), minScore = 0.25 }: {
    count?: number;
    exclude?: ReadonlySet<string>;
    minScore?: number;
  } = {},
): SimilarBhajan[] {
  if (anchors.length === 0) return [];
  const anchorIds = new Set(anchors.map((a) => a.id));

  const scored: SimilarBhajan[] = [];
  for (const candidate of pool) {
    if (anchorIds.has(candidate.id) || exclude.has(candidate.id)) continue;

    let best: Similarity = { score: 0, reasons: [] };
    for (const anchor of anchors) {
      const s = similarity(anchor, candidate);
      if (s.score > best.score) best = s;
    }
    if (best.score < minScore) continue;
    scored.push({ ...candidate, ...best });
  }

  scored.sort((x, y) => y.score - x.score || x.title.localeCompare(y.title));
  return scored.slice(0, count);
}
