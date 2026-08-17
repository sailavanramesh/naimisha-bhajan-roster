import { describe, it, expect } from "vitest";
import {
  layerLines,
  layersAlign,
  nextSectionLabel,
  sectionFamily,
  sectionsFor,
  splitPastedVerses,
  verseIsEmpty,
  verseLayout,
  zipVerseLines,
} from "../lib/songVerses";

describe("section sets", () => {
  it("offers the Carnatic sections in the order a kriti runs", () => {
    expect(sectionsFor("carnatic")).toEqual(["Pallavi", "Anupallavi", "Charanam"]);
  });

  it("offers the Western ones", () => {
    expect(sectionsFor("western")).toEqual(["Verse", "Chorus", "Bridge", "Refrain"]);
  });
});

describe("nextSectionLabel", () => {
  it("numbers a Charanam, because a song has several", () => {
    expect(nextSectionLabel([], "Charanam")).toBe("Charanam 1");
    expect(nextSectionLabel(["Pallavi", "Charanam 1"], "Charanam")).toBe("Charanam 2");
    expect(nextSectionLabel(["Charanam 1", "Charanam 2"], "Charanam")).toBe("Charanam 3");
  });

  it("does not number a Pallavi or a Chorus — there is one of each", () => {
    expect(nextSectionLabel(["Pallavi"], "Pallavi")).toBe("Pallavi");
    expect(nextSectionLabel(["Verse 1", "Chorus"], "Chorus")).toBe("Chorus");
  });

  it("numbers Western verses too", () => {
    expect(nextSectionLabel(["Verse 1", "Chorus"], "Verse")).toBe("Verse 2");
  });

  it("reads the highest existing number rather than counting the labels", () => {
    // Charanam 2 was deleted. The next must be 4, not 3 — a second Charanam 3
    // is the one outcome that makes the numbering useless.
    expect(nextSectionLabel(["Charanam 1", "Charanam 3"], "Charanam")).toBe("Charanam 4");
  });

  it("treats an unnumbered existing label as the first", () => {
    expect(nextSectionLabel(["Charanam"], "Charanam")).toBe("Charanam 2");
  });

  it("ignores case when matching what is already there", () => {
    expect(nextSectionLabel(["CHARANAM 1"], "Charanam")).toBe("Charanam 2");
  });

  it("gives nothing back for an empty section", () => {
    expect(nextSectionLabel(["Pallavi"], "  ")).toBe("");
  });
});

describe("sectionFamily", () => {
  it("recognises both families, numbered or not", () => {
    expect(sectionFamily("Pallavi")).toBe("carnatic");
    expect(sectionFamily("Charanam 2")).toBe("carnatic");
    expect(sectionFamily("Chorus")).toBe("western");
    expect(sectionFamily("Verse 3")).toBe("western");
  });

  it("leaves the group's own labels alone rather than guessing", () => {
    expect(sectionFamily("Swaras")).toBeNull();
    expect(sectionFamily("Interlude")).toBeNull();
    expect(sectionFamily(null)).toBeNull();
    expect(sectionFamily("")).toBeNull();
  });
});

describe("layerLines", () => {
  it("trims blank lines from the ends but keeps them inside", () => {
    expect(layerLines("\n\na\n\nb\n\n")).toEqual(["a", "", "b"]);
  });

  it("copes with Windows line endings, which a pasted Doc brings", () => {
    expect(layerLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("is empty for nothing at all", () => {
    expect(layerLines(null)).toEqual([]);
    expect(layerLines("   \n  ")).toEqual([]);
  });
});

describe("zipVerseLines — the Janmashtami shape", () => {
  const verse = {
    script: "உன்னித்து மற்றொரு தெய்வம்\nதொழாள் அவனையல்லால்",
    roman: "Unniththu maṟṟoru deivam\nTozhāl avanaiyallāl",
    meaning: "Having fixed her mind on Him,\nshe will not worship any other deity.",
  };

  it("pairs each line with its own transliteration and meaning", () => {
    const lines = zipVerseLines(verse);
    expect(lines).toHaveLength(2);
    expect(lines?.[0]).toEqual({
      script: "உன்னித்து மற்றொரு தெய்வம்",
      roman: "Unniththu maṟṟoru deivam",
      meaning: "Having fixed her mind on Him,",
    });
    expect(lines?.[1].roman).toBe("Tozhāl avanaiyallāl");
  });

  it("aligns two layers when the third is missing", () => {
    expect(zipVerseLines({ roman: "a\nb", meaning: "one\ntwo" })).toHaveLength(2);
  });
});

describe("zipVerseLines — the Meerabai shape", () => {
  it("refuses to align a four-line stanza with one sentence of meaning", () => {
    // The failure this exists to prevent: pairing the sentence with line one
    // would read as the meaning of that line alone.
    const verse = {
      roman: "cākara rahsūń bāga lagāsūń\nnita uṭha darasana pāsūń\nvṛndāvana kī kuñja galina meń\nteri līlā gāsūń",
      meaning: "As Your servant, I will plant Your garden, and sing your glories.",
    };
    expect(layersAlign(verse)).toBe(false);
    expect(zipVerseLines(verse)).toBeNull();
  });

  it("does not align when there is only one layer to align", () => {
    expect(layersAlign({ roman: "a\nb" })).toBe(false);
    expect(zipVerseLines({ roman: "a\nb" })).toBeNull();
  });
});

describe("verseLayout — the Krishna document's shape", () => {
  // Six lines of Devanagari, six of transliteration, one English sentence for
  // the whole verse. The pairing is real and must not be thrown away just
  // because the third layer does not join it.
  const verse = {
    script: ["सुनो-सुनो, साँवरे की बंसी है बाजे", "नैनों से धार-धार कजरा बहे जी", "जियरा तरसे, नैना तरसे"].join("\n"),
    roman: ["suno-suno, sāvare kī baṃsī hai bāje", "nainoṃ se dhār-dhār kajarā bahe jī", "jiyarā tarase, nainā tarase"].join("\n"),
    meaning: "Listen, listen; the flute of Shyam is playing. My heart longs, my eyes long.",
  };

  it("aligns the script with its transliteration", () => {
    const layout = verseLayout(verse);
    expect(layout.lines).toHaveLength(3);
    expect(layout.lines[0].script).toBe("सुनो-सुनो, साँवरे की बंसी है बाजे");
    expect(layout.lines[0].roman).toBe("suno-suno, sāvare kī baṃsī hai bāje");
  });

  it("leaves the one-sentence meaning as a block rather than pinning it to line one", () => {
    const layout = verseLayout(verse);
    expect(layout.lines.every((l) => l.meaning === null)).toBe(true);
    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0].layer).toBe("meaning");
    expect(layout.blocks[0].text).toContain("flute of Shyam");
  });

  it("still aligns all three when all three match — the Janmashtami shape", () => {
    const layout = verseLayout({
      script: "அ\nஆ",
      roman: "a\naa",
      meaning: "one\ntwo",
    });
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[1]).toEqual({ script: "ஆ", roman: "aa", meaning: "two" });
    expect(layout.blocks).toEqual([]);
  });

  it("aligns nothing when no two layers agree — the Meerabai shape", () => {
    const layout = verseLayout({
      roman: "one\ntwo\nthree\nfour",
      meaning: "As Your servant, I will plant Your garden.",
    });
    expect(layout.lines).toEqual([]);
    expect(layout.blocks.map((b) => b.layer)).toEqual(["roman", "meaning"]);
  });

  it("makes a block of a lone layer rather than calling it aligned", () => {
    const layout = verseLayout({ roman: "just\nthis" });
    expect(layout.lines).toEqual([]);
    expect(layout.blocks.map((b) => b.layer)).toEqual(["roman"]);
  });

  it("has nothing to lay out for an empty verse", () => {
    expect(verseLayout({})).toEqual({ lines: [], blocks: [] });
  });

  it("keeps the blocks in reading order", () => {
    // Two layers agree (script and meaning at 2 lines); the odd one out is the
    // transliteration, and it still reads in its usual place.
    const layout = verseLayout({ script: "a\nb", roman: "x\ny\nz", meaning: "1\n2" });
    expect(layout.lines).toHaveLength(2);
    expect(layout.blocks.map((b) => b.layer)).toEqual(["roman"]);
  });
});

describe("verseIsEmpty", () => {
  it("knows an untouched verse from one with words in any layer", () => {
    expect(verseIsEmpty({})).toBe(true);
    expect(verseIsEmpty({ script: "  ", roman: "", meaning: null })).toBe(true);
    expect(verseIsEmpty({ meaning: "only the meaning so far" })).toBe(false);
  });
});

describe("splitPastedVerses", () => {
  it("splits on blank lines", () => {
    const out = splitPastedVerses("line one\nline two\n\nline three");
    expect(out).toHaveLength(2);
    expect(out[0].body).toBe("line one\nline two");
    expect(out[1].body).toBe("line three");
  });

  it("treats a run of blank lines as one break", () => {
    expect(splitPastedVerses("a\n\n\n\nb")).toHaveLength(2);
  });

  it("lifts a shouted heading out of the verse — the Udupi Krishna shape", () => {
    const out = splitPastedVerses("PALLAVI\nBaarO krShnayya\n\nCARANAM 1\nAndugE padukavu");
    expect(out[0].label).toBe("Pallavi");
    expect(out[0].body).toBe("BaarO krShnayya");
    expect(out[1].label).toBe("Caranam 1");
    expect(out[1].body).toBe("AndugE padukavu");
  });

  it("recognises a known section even in ordinary case", () => {
    const out = splitPastedVerses("Chorus\nJholi bhari hai");
    expect(out[0].label).toBe("Chorus");
  });

  it("never mistakes a Tamil or Devanagari first line for a heading", () => {
    // Those scripts have no case, so an all-caps test would match every one of
    // them and eat the first line of the verse.
    const out = splitPastedVerses("கோகுலத்தை கண்டதில்லை\nகண்ணனையும் பார்த்ததில்லை");
    expect(out[0].label).toBeNull();
    expect(out[0].body.split("\n")).toHaveLength(2);
  });

  it("does not take a one-line verse as a heading with nothing under it", () => {
    const out = splitPastedVerses("PALLAVI");
    expect(out[0].label).toBeNull();
    expect(out[0].body).toBe("PALLAVI");
  });

  it("leaves a sentence alone even when it is short and capitalised", () => {
    const out = splitPastedVerses("OM SAI RAM!\nnext line");
    expect(out[0].label).toBeNull();
  });

  it("gives nothing back for nothing", () => {
    expect(splitPastedVerses("")).toEqual([]);
    expect(splitPastedVerses("\n\n  \n")).toEqual([]);
  });
});
