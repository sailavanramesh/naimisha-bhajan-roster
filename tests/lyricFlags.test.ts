import { describe, expect, it } from "vitest";
import { findLyricFlags, flagAppliesOn, termPattern, type LyricFlagRule } from "@/lib/lyricFlags";

const rule = (over: Partial<LyricFlagRule> = {}): LyricFlagRule => ({
  id: "f1",
  term: "ram",
  wholeWord: false,
  note: null,
  startsOn: "2026-10-01",
  endsOn: null,
  ...over,
});

const slot = (lyrics: string | null, position = 1, title = "Bhajan") => ({ position, title, lyrics });

describe("flagAppliesOn", () => {
  it("starts on its start date, inclusive", () => {
    expect(flagAppliesOn(rule(), "2026-09-30")).toBe(false);
    expect(flagAppliesOn(rule(), "2026-10-01")).toBe(true);
  });

  it("never ends without an end date", () => {
    expect(flagAppliesOn(rule(), "2099-01-01")).toBe(true);
  });

  it("ends on its end date, inclusive", () => {
    const r = rule({ endsOn: "2026-10-31" });
    expect(flagAppliesOn(r, "2026-10-31")).toBe(true);
    expect(flagAppliesOn(r, "2026-11-01")).toBe(false);
  });
});

describe("termPattern", () => {
  it("matches inside a word, case-insensitively, by default", () => {
    expect(termPattern("ram", false)!.test("Sri RAMA Jaya")).toBe(true);
  });

  it("whole word skips the term inside a longer word", () => {
    const re = termPattern("ram", true)!;
    expect(re.test("Sri Rama")).toBe(false);
    expect(re.test("Ram, Ram")).toBe(true);
  });

  it("whole word knows Devanagari word edges", () => {
    const re = termPattern("राम", true)!;
    expect(re.test("श्री राम जय")).toBe(true);
    expect(re.test("रामा")).toBe(false);
  });

  it("lets a phrase run across a line break", () => {
    expect(termPattern("hari om", false)!.test("Hari\nOm")).toBe(true);
  });

  it("treats regex characters as plain text", () => {
    expect(termPattern("a.b", false)!.test("axb")).toBe(false);
    expect(termPattern("a.b", false)!.test("a.b")).toBe(true);
  });

  it("returns null for a blank term", () => {
    expect(termPattern("   ", false)).toBeNull();
  });
});

describe("findLyricFlags", () => {
  it("reports the slot, the term and the text as written", () => {
    const hits = findLyricFlags([rule({ note: "Navaratri" })], [slot("Jaya Rama", 2, "Rama Bhajan")], "2026-10-12");
    expect(hits).toEqual([
      { position: 2, title: "Rama Bhajan", flagId: "f1", term: "ram", note: "Navaratri", matched: "Ram" },
    ]);
  });

  it("ignores rules outside their dates", () => {
    expect(findLyricFlags([rule({ startsOn: "2026-11-01" })], [slot("Rama")], "2026-10-12")).toEqual([]);
  });

  it("skips slots without lyrics", () => {
    expect(findLyricFlags([rule()], [slot(null), slot("")], "2026-10-12")).toEqual([]);
  });

  it("reports each matching term per slot", () => {
    const hits = findLyricFlags(
      [rule(), rule({ id: "f2", term: "krishna" })],
      [slot("Rama Krishna", 1), slot("Govinda", 2)],
      "2026-10-12",
    );
    expect(hits.map((h) => [h.position, h.flagId])).toEqual([
      [1, "f1"],
      [1, "f2"],
    ]);
  });
});
