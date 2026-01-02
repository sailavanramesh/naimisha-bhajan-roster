// lib/computeRecommendedPitch.ts

export type BhajanPitchInfo = {
  referenceGentsPitch?: string | null;
  referenceLadiesPitch?: string | null;
};

function normalizeGender(g?: string | null) {
  const s = (g ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.startsWith("f") || s.includes("female") || s.includes("lady") || s.includes("woman")) return "female";
  if (s.startsWith("m") || s.includes("male") || s.includes("gent") || s.includes("man")) return "male";
  return "unknown";
}

function pickFromBhajan(gender: "male" | "female" | "unknown", bhajan?: BhajanPitchInfo | null) {
  if (!bhajan) return "";
  const gents = (bhajan.referenceGentsPitch ?? "").trim();
  const ladies = (bhajan.referenceLadiesPitch ?? "").trim();

  if (gender === "female") return ladies || gents || "";
  if (gender === "male") return gents || ladies || "";
  return gents || ladies || "";
}

/**
 * Flexible helper:
 * - computeRecommendedPitch({ singerGender, bhajan, confirmedPitch })
 * - computeRecommendedPitch(singerGender, bhajan, confirmedPitch)
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
  confirmedPitch?: string | null
) {
  let singerGender: string | null | undefined;
  let bh: BhajanPitchInfo | null | undefined;
  let fallback: string | null | undefined;

  if (typeof arg1 === "object" && arg1 !== null) {
    singerGender = arg1.singerGender;
    bh = arg1.bhajan;
    fallback = arg1.confirmedPitch;
  } else {
    singerGender = arg1;
    bh = bhajan;
    fallback = confirmedPitch;
  }

  const gender = normalizeGender(singerGender);
  const fromBhajan = pickFromBhajan(gender, bh);

  // If the bhajan doesn't have a reference pitch, fall back to confirmed pitch if available.
  return fromBhajan || (fallback ?? "").trim() || "";
}

export default computeRecommendedPitch;
