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

const FIELDS = [
  { key: "raga", label: "same raga" },
  { key: "deity", label: "same deity" },
  { key: "tempo", label: "same tempo" },
  { key: "beat", label: "same beat" },
  { key: "tags", label: "shared tags" },
  { key: "level", label: "same level" },
  { key: "language", label: "same language" },
] as const satisfies ReadonlyArray<{ key: keyof typeof WEIGHTS; label: string }>;

/**
 * A bhajan with its fields already normalised into sets.
 *
 * Comparing every bhajan against every anchor rebuilt these sets on both sides
 * of each comparison — for one singer that was about half a million
 * comparisons and seven million Set allocations, and it dominated the time to
 * open a singer's suggestions. Preparing each bhajan once turns that into
 * (anchors + pool) allocations instead of (anchors x pool).
 */
export type PreparedBhajan = {
  features: BhajanFeatures;
  sets: ReadonlyArray<ReadonlySet<string>>;
};

function toSet(values: readonly (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    const n = norm(v ?? null);
    if (n !== null) out.add(n);
  }
  return out;
}

export function prepare(f: BhajanFeatures): PreparedBhajan {
  return {
    features: f,
    sets: [
      toSet(ragaParts(f.raga)),
      toSet(f.deities),
      toSet([f.tempo]),
      toSet([f.beat]),
      toSet(f.tags ?? []),
      toSet([f.level]),
      toSet([f.language]),
    ],
  };
}

/** Jaccard over two prepared sets, or null when either side is unknown. */
function setOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number | null {
  if (a.size === 0 || b.size === 0) return null;
  let shared = 0;
  // Iterate the smaller side.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? null : shared / union;
}

/** Score two already-prepared bhajans. */
export function scorePrepared(a: PreparedBhajan, b: PreparedBhajan): Similarity {
  let weighted = 0;
  let total = 0;
  const reasons: string[] = [];

  for (let i = 0; i < FIELDS.length; i++) {
    const value = setOverlap(a.sets[i], b.sets[i]);
    if (value === null) continue; // unknown on one side — no evidence either way
    const w = WEIGHTS[FIELDS[i].key];
    weighted += value * w;
    total += w;
    if (value > 0) reasons.push(FIELDS[i].label);
  }

  if (total === 0) return { score: 0, reasons: [] };
  return { score: weighted / total, reasons };
}

/** Score two bhajans, 0..1, with the fields that drove it. */
export function similarity(a: BhajanFeatures, b: BhajanFeatures): Similarity {
  return scorePrepared(prepare(a), prepare(b));
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

  const preparedAnchors = anchors.map(prepare);

  const scored: SimilarBhajan[] = [];
  for (const candidate of pool) {
    if (anchorIds.has(candidate.id) || exclude.has(candidate.id)) continue;

    const prepared = prepare(candidate);
    let best: Similarity = { score: 0, reasons: [] };
    for (const anchor of preparedAnchors) {
      const s = scorePrepared(anchor, prepared);
      if (s.score > best.score) best = s;
    }
    if (best.score < minScore) continue;
    scored.push({ ...candidate, ...best });
  }

  scored.sort((x, y) => y.score - x.score || x.title.localeCompare(y.title));
  return scored.slice(0, count);
}
