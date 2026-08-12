/**
 * lib/computeRecommendedPitch.ts — the pitch we suggest for a singer.
 *
 * Pure. No Prisma import.
 *
 * CLAUDE.md rule 5: the recommendation IS the bhajan's reference pitch for
 * that singer's voice — `referenceLadiesPitch` for a Ladies singer,
 * `referenceGentsPitch` for a Gents singer. Derived, never stored.
 *
 * ⚠ THIS WAS WRONG UNTIL 2026-08-12, and wrong in the quiet direction.
 *
 * The old version normalised the gender by sniffing at the string:
 *
 *     if (s.startsWith("f") || s.includes("lady") || …) return "female";
 *
 * The value stored in the database is `Ladies`, the group's own word — and
 * "ladies" does not start with "f", does not contain "female", and does not
 * contain "lady". It fell through every test, came out "unknown", and unknown
 * preferred the GENTS pitch. "Gents" happened to match `includes("gent")`, so
 * the men were right and every woman in the group was shown a man's pitch.
 *
 * Sailavan caught it on Pavitra singing Naam Bhajo Hari Naam Bhajo: the grid
 * offered 3 Pancham / E, the masterlist's Gents value, where her reference is
 * 7 Pancham / B.
 *
 * Nothing stored was corrupted — the recommendation is derived, and the
 * singer-offset profiles compute their own reference (lib/singerProfile.ts)
 * and were never affected. But the "= rec" button copies this value into
 * `confirmedPitch`, which IS real history, so a Ladies singer who took the
 * recommendation would have recorded a Gents pitch.
 *
 * So: match the domain values exactly, and treat anything unrecognised as
 * unknown rather than guessing at it.
 */

export type BhajanPitchInfo = {
  referenceGentsPitch?: string | null;
  referenceLadiesPitch?: string | null;
};

export type Voice = "ladies" | "gents" | "unknown";

/**
 * The two words the group uses, and nothing clever.
 *
 * `Gender` in the schema is exactly `Gents` | `Ladies`, so an exact match is
 * the whole job. The looser spellings are kept only because a hand-typed
 * import could carry them; anything else is `unknown`, which is honest.
 */
export function normaliseVoice(g?: string | null): Voice {
  const s = (g ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "ladies" || s === "lady" || s === "female" || s === "f") return "ladies";
  if (s === "gents" || s === "gent" || s === "male" || s === "m") return "gents";
  return "unknown";
}

/**
 * The reference for that voice.
 *
 * A missing reference for one voice falls back to the other: 589 of the 3,613
 * masterlist rows have no reference pitch at all, and many have only one of
 * the two. Showing the other voice's reference is a worse answer than showing
 * the right one and a better answer than showing nothing, because it is at
 * least the pitch this bhajan is sung around.
 *
 * An unknown voice takes whichever exists, preferring Gents only because
 * something has to come first — it is not a claim about the singer.
 */
function pickFromBhajan(voice: Voice, bhajan?: BhajanPitchInfo | null): string {
  if (!bhajan) return "";
  const gents = (bhajan.referenceGentsPitch ?? "").trim();
  const ladies = (bhajan.referenceLadiesPitch ?? "").trim();

  if (voice === "ladies") return ladies || gents || "";
  if (voice === "gents") return gents || ladies || "";
  return gents || ladies || "";
}

/**
 * Flexible signature, kept because both callers use the positional form:
 *   computeRecommendedPitch({ singerGender, bhajan, confirmedPitch })
 *   computeRecommendedPitch(singerGender, bhajan, confirmedPitch)
 */
export function computeRecommendedPitch(
  arg1:
    | {
        singerGender?: string | null;
        bhajan?: BhajanPitchInfo | null;
        confirmedPitch?: string | null;
      }
    | string
    | null
    | undefined,
  bhajan?: BhajanPitchInfo | null,
  confirmedPitch?: string | null,
): string {
  const fromObject = typeof arg1 === "object" && arg1 !== null;
  const singerGender = fromObject ? arg1.singerGender : arg1;
  const bh = fromObject ? arg1.bhajan : bhajan;
  const fallback = fromObject ? arg1.confirmedPitch : confirmedPitch;

  const fromBhajan = pickFromBhajan(normaliseVoice(singerGender), bh);

  // No reference recorded at all: what they actually sang is the best guide
  // there is, and it is better than an empty column.
  return fromBhajan || (fallback ?? "").trim() || "";
}

export default computeRecommendedPitch;
