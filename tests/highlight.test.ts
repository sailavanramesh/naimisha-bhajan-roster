import { describe, expect, it } from "vitest";
import { excerpt, matches, splitOnMatch } from "@/lib/highlight";

const shown = (text: string, q: string) =>
  splitOnMatch(text, q)
    .map((p) => (p.hit ? `[${p.text}]` : p.text))
    .join("");

describe("splitOnMatch", () => {
  it("marks the match", () => {
    expect(shown("Rama Raghava", "rama")).toBe("[Rama] Raghava");
  });

  it("is case-insensitive, like the search itself", () => {
    // Somebody typing "rama" and seeing Rama listed but not marked would
    // assume the app had matched something else.
    expect(shown("Bhajo Radhe", "RADHE")).toBe("Bhajo [Radhe]");
  });

  it("marks every occurrence", () => {
    expect(shown("Sai Ram Sai Ram", "sai")).toBe("[Sai] Ram [Sai] Ram");
  });

  it("returns the text untouched when there is no query", () => {
    expect(splitOnMatch("Anything", "")).toEqual([{ text: "Anything", hit: false }]);
    expect(splitOnMatch("Anything", null)).toEqual([{ text: "Anything", hit: false }]);
  });

  it("survives regex characters in the query", () => {
    // Somebody searching "C#" must not blow up a page.
    expect(shown("2 Pancham / C#", "c#")).toBe("2 Pancham / [C#]");
    expect(() => splitOnMatch("anything", "(")).not.toThrow();
    expect(() => splitOnMatch("anything", "*")).not.toThrow();
  });

  it("handles empty text", () => {
    expect(splitOnMatch("", "rama")).toEqual([{ text: "", hit: false }]);
  });

  it("loses no characters", () => {
    const text = "Jaya Jaya Ram Krishna Hari";
    expect(splitOnMatch(text, "ram").map((p) => p.text).join("")).toBe(text);
  });
});

describe("matches", () => {
  it("answers whether it is worth highlighting at all", () => {
    expect(matches("Rama Raghava", "rama")).toBe(true);
    expect(matches("Rama Raghava", "krishna")).toBe(false);
    expect(matches(null, "rama")).toBe(false);
    expect(matches("Rama", "")).toBe(false);
  });
});

describe("excerpt", () => {
  it("windows a long note around the match", () => {
    const note = "x".repeat(200) + " Guru Purnima " + "y".repeat(200);
    const out = excerpt(note, "purnima", 20);
    expect(out).toContain("Purnima");
    expect(out.length).toBeLessThan(80);
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves a short note alone", () => {
    expect(excerpt("Guru Purnima", "purnima", 40)).toBe("Guru Purnima");
  });
});
