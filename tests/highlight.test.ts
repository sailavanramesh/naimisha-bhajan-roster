import { describe, expect, it } from "vitest";
import { excerpt, firstMatch, matches, splitOnMatch } from "@/lib/highlight";

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

/**
 * A bhajan search matches on title, lyrics, meaning, raga, composer and tags,
 * so a row can be returned for a reason that appears nowhere on it. These pin
 * the line that explains why.
 */
describe("firstMatch", () => {
  const FIELDS = (over: Partial<Record<string, string | null>> = {}) => [
    { label: "lyrics", text: over.lyrics ?? null },
    { label: "meaning", text: over.meaning ?? null },
    { label: "composer", text: over.composer ?? null },
    { label: "tag", text: over.tag ?? null },
    { label: "raga", text: over.raga ?? null },
  ];

  it("names the field it matched in", () => {
    const m = firstMatch(FIELDS({ composer: "Purandara Dasa" }), "purandara");
    expect(m).toEqual({ label: "composer", text: "Purandara Dasa" });
  });

  it("prefers the field that needs explaining most", () => {
    // Both hold "sai". Lyrics is invisible on the row; raga is already printed
    // beside the title, so it must not win.
    const m = firstMatch(FIELDS({ lyrics: "Sai Ram Sai Ram", raga: "Saindhavi" }), "sai");
    expect(m?.label).toBe("lyrics");
  });

  it("falls through to raga when nothing else matched", () => {
    expect(firstMatch(FIELDS({ raga: "Kalyani / Yaman" }), "yaman")?.label).toBe("raga");
  });

  it("returns null with no query, so the line simply does not appear", () => {
    expect(firstMatch(FIELDS({ lyrics: "anything" }), "")).toBeNull();
    expect(firstMatch(FIELDS({ lyrics: "anything" }), null)).toBeNull();
  });

  it("returns null when nothing matched", () => {
    expect(firstMatch(FIELDS({ lyrics: "Rama Raghava" }), "krishna")).toBeNull();
  });

  it("skips blank and whitespace-only fields", () => {
    expect(firstMatch(FIELDS({ lyrics: "   ", meaning: "Sai is here" }), "sai")?.label).toBe("meaning");
  });

  it("windows a long match instead of printing the whole lyric", () => {
    const long = "la ".repeat(200) + "Govinda" + " la".repeat(200);
    const m = firstMatch(FIELDS({ lyrics: long }), "govinda");
    expect(m!.text.length).toBeLessThan(120);
    expect(m!.text.toLowerCase()).toContain("govinda");
    expect(m!.text.startsWith("…")).toBe(true);
    expect(m!.text.endsWith("…")).toBe(true);
  });

  it("collapses the newlines lyrics are stored with, so the row stays one line", () => {
    const m = firstMatch(FIELDS({ lyrics: "Bhajo\n  Radhe\n\nGovinda" }), "radhe");
    expect(m!.text).not.toMatch(/[\n\r]/);
    expect(m!.text).toContain("Bhajo Radhe Govinda");
  });

  it("survives a regex character in the query", () => {
    expect(() => firstMatch(FIELDS({ lyrics: "sung at C# today" }), "C#")).not.toThrow();
    expect(firstMatch(FIELDS({ lyrics: "sung at C# today" }), "C#")?.label).toBe("lyrics");
  });
});
