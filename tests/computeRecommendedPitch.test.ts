import { describe, expect, it } from "vitest";
import { computeRecommendedPitch, normaliseVoice } from "@/lib/computeRecommendedPitch";

/** The real row Sailavan caught this on. */
const NAAM_BHAJO = {
  referenceGentsPitch: "3 Pancham / E",
  referenceLadiesPitch: "7 Pancham / B",
};

describe("normaliseVoice", () => {
  it("recognises the two words the group actually uses", () => {
    // The whole bug. "Ladies" is what the database stores, and the old
    // sniffing test — startsWith("f"), includes("lady"), includes("female") —
    // matched none of it, so every woman fell through to "unknown" and unknown
    // preferred the Gents pitch.
    expect(normaliseVoice("Ladies")).toBe("ladies");
    expect(normaliseVoice("Gents")).toBe("gents");
  });

  it("is case and whitespace tolerant", () => {
    expect(normaliseVoice("  ladies ")).toBe("ladies");
    expect(normaliseVoice("GENTS")).toBe("gents");
  });

  it("says unknown rather than guessing", () => {
    expect(normaliseVoice(null)).toBe("unknown");
    expect(normaliseVoice("")).toBe("unknown");
    expect(normaliseVoice("mixed")).toBe("unknown");
    expect(normaliseVoice("choir")).toBe("unknown");
  });
});

describe("computeRecommendedPitch", () => {
  it("gives a Ladies singer the Ladies reference", () => {
    expect(computeRecommendedPitch("Ladies", NAAM_BHAJO)).toBe("7 Pancham / B");
  });

  it("gives a Gents singer the Gents reference", () => {
    expect(computeRecommendedPitch("Gents", NAAM_BHAJO)).toBe("3 Pancham / E");
  });

  it("never hands a Ladies singer the Gents pitch when both exist", () => {
    // The regression, stated as plainly as it can be.
    expect(computeRecommendedPitch("Ladies", NAAM_BHAJO)).not.toBe(
      NAAM_BHAJO.referenceGentsPitch,
    );
  });

  it("works through the object form too", () => {
    expect(
      computeRecommendedPitch({ singerGender: "Ladies", bhajan: NAAM_BHAJO }),
    ).toBe("7 Pancham / B");
  });

  it("falls back to the other voice when one reference is missing", () => {
    // 589 of 3,613 masterlist rows have no reference at all, and many have
    // only one of the two. The other voice's reference is at least the pitch
    // this bhajan is sung around.
    expect(
      computeRecommendedPitch("Ladies", { referenceGentsPitch: "3 Pancham / E" }),
    ).toBe("3 Pancham / E");
    expect(
      computeRecommendedPitch("Gents", { referenceLadiesPitch: "7 Pancham / B" }),
    ).toBe("7 Pancham / B");
  });

  it("falls back to what they actually sang when the bhajan has nothing", () => {
    expect(computeRecommendedPitch("Ladies", {}, "1 Pancham / C")).toBe("1 Pancham / C");
    expect(computeRecommendedPitch("Ladies", null, "1 Pancham / C")).toBe("1 Pancham / C");
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(computeRecommendedPitch("Ladies", {})).toBe("");
    expect(computeRecommendedPitch(null, null, null)).toBe("");
  });

  it("does not invent a voice for somebody with none recorded", () => {
    // A person with no recorded voice is not a singer (rosterEligibility), but
    // if one turns up in a slot the answer must not pretend to be tailored.
    expect(computeRecommendedPitch(null, NAAM_BHAJO)).toBe("3 Pancham / E");
    expect(computeRecommendedPitch("choir", NAAM_BHAJO)).toBe("3 Pancham / E");
  });
});
