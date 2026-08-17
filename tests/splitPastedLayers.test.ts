import { describe, it, expect } from "vitest";
import {
  fromDraft,
  joinUp,
  splitAt,
  splitPastedLayers,
  toDraft,
  verseLayout,
} from "../lib/songVerses";

/**
 * Kuzhaloothi, as Sailavan pasted it on 2026-08-17 — the shape the group's own
 * documents are written in: script, transliteration, meaning, line by line,
 * stanzas separated by a blank line.
 */
const KUZHALOOTHI = `குழலூதி மனமெல்லாம் கொள்ளைகொண்ட
Kuzhaloothi manamellaam kollai konda
Playing His flute, He has stolen my entire heart.
பின்னும் குறையேதும் எனகேதடி சகியே
Pinnum kura yedhum enakkēthadi sakhiye
After that, what could I possibly lack, my dear friend?

அழகான மயில் ஆடவும்
Azhagaana mayil aadavum
The beautiful peacocks dance,
மிக அழகான மயில் ஆடவும் (மிக மிக)
Miga azhagaana mayil aadavum (miga miga)
the most beautiful peacocks dance so wonderfully,
காற்றில் அசைந்தாடும் கோடி போலவும்
Kaatril asaindhaadum kodi pōlavum
like creepers swaying and dancing in the breeze.`;

describe("splitPastedLayers", () => {
  const verses = splitPastedLayers(KUZHALOOTHI);

  it("makes one verse per stanza", () => {
    expect(verses).not.toBeNull();
    expect(verses).toHaveLength(2);
  });

  it("puts each layer where it belongs", () => {
    expect(verses![0].script).toBe(
      "குழலூதி மனமெல்லாம் கொள்ளைகொண்ட\nபின்னும் குறையேதும் எனகேதடி சகியே",
    );
    expect(verses![0].roman).toBe(
      "Kuzhaloothi manamellaam kollai konda\nPinnum kura yedhum enakkēthadi sakhiye",
    );
    expect(verses![0].meaning).toBe(
      "Playing His flute, He has stolen my entire heart.\nAfter that, what could I possibly lack, my dear friend?",
    );
  });

  /*
   * The point of the whole exercise: equal line counts are the condition
   * verseLayout needs to show the three layers zipped line by line rather than
   * as three separate blocks.
   */
  it("leaves the layers the same length, so they align line by line", () => {
    for (const v of verses!) {
      const lines = (s: string) => s.split("\n").length;
      expect(lines(v.roman)).toBe(lines(v.script));
      expect(lines(v.meaning)).toBe(lines(v.script));

      const layout = verseLayout(v);
      expect(layout.lines.length).toBe(lines(v.script));
      expect(layout.blocks).toHaveLength(0);
    }
  });

  it("keeps a line that mixes scripts with the script layer", () => {
    // "மிக அழகான மயில் ஆடவும் (மிக மிக)" — Tamil with a bracketed aside.
    expect(verses![1].script.split("\n")[1]).toContain("(மிக மிக)");
    expect(verses![1].roman.split("\n")[1]).toBe("Miga azhagaana mayil aadavum (miga miga)");
  });

  it("pads a missing meaning so the layers stay level", () => {
    const v = splitPastedLayers("தனை மறந்து\nThanai marandhu\nஅசைந்தாடி\nAsaindhaadi\nMoving and dancing.");
    expect(v).not.toBeNull();
    expect(v![0].script).toBe("தனை மறந்து\nஅசைந்தாடி");
    expect(v![0].roman).toBe("Thanai marandhu\nAsaindhaadi");
    // First group had no translation; the blank keeps the second one on its line.
    expect(v![0].meaning).toBe("\nMoving and dancing.");
    expect(verseLayout(v![0]).lines).toHaveLength(2);
  });

  it("joins a translation that wrapped onto two lines rather than losing half", () => {
    const v = splitPastedLayers("மகர குண்டலம்\nMagara kundalam\nKrishna's earrings sway,\nand His crown shines.");
    expect(v![0].meaning).toBe("Krishna's earrings sway, and His crown shines.");
  });

  it("takes a heading as the verse's label", () => {
    const v = splitPastedLayers("PALLAVI\nகுழலூதி\nKuzhaloothi\nPlaying His flute.");
    expect(v![0].label).toBe("Pallavi");
    expect(v![0].script).toBe("குழலூதி");
  });

  /*
   * Latin text IS read now, by spotting the English (see the Kandu Njan case
   * below) — but only when there is English to spot. With no script and nothing
   * that reads as a translation there is genuinely nothing to go on, and the
   * caller falls back to asking which single layer it is. "Playing His flute."
   * carries one marker; the threshold is two, on purpose.
   */
  it("gives up when there is neither script nor English to go on", () => {
    expect(splitPastedLayers("Kuzhaloothi manamellaam\nPlaying His flute.")).toBeNull();
    expect(splitPastedLayers("")).toBeNull();
  });

  /*
   * A stray line before the script no longer costs the rest. It lands in the
   * transliteration column, where a bare Latin line most likely belongs, and
   * the pair below it is still read as a pair.
   */
  it("keeps a stray line before the script without losing what follows", () => {
    const v = splitPastedLayers("Some preamble\nகுழலூதி\nKuzhaloothi")!;
    expect(v[0].script.split("\n")).toEqual(["", "குழலூதி"]);
    expect(v[0].roman.split("\n")).toEqual(["Some preamble", "Kuzhaloothi"]);
  });
});

/* ------------------------------------------------------------------ *\
 * The other shapes the group's documents come in. Every sample below is
 * text Sailavan pasted on 2026-08-17.
\* ------------------------------------------------------------------ */

describe("transliteration and meaning, with no script at all", () => {
  const KANDU = `Kandu Njan Kannane Kayamboo Varnane
I saw Krishna, the One with the complexion of the kayamboo flower.
Guruvayoor Ambala Nadayil
At the entrance of the Guruvayoor temple.
Rajeevalochanan Ende Kannan
My Krishna, the lotus-eyed One.`;

  /*
   * This one went in as a single layer and put the translations in the
   * transliteration with everything else — "it threw everything in
   * transliteration". There is no script to key on, so the English is what
   * gives it away.
   */
  it("tells the English translation from the transliteration", () => {
    const v = splitPastedLayers(KANDU);
    expect(v).not.toBeNull();
    expect(v![0].script).toBe("");
    expect(v![0].roman.split("\n")).toEqual([
      "Kandu Njan Kannane Kayamboo Varnane",
      "Guruvayoor Ambala Nadayil",
      "Rajeevalochanan Ende Kannan",
    ]);
    expect(v![0].meaning.split("\n")).toEqual([
      "I saw Krishna, the One with the complexion of the kayamboo flower.",
      "At the entrance of the Guruvayoor temple.",
      "My Krishna, the lotus-eyed One.",
    ]);
  });

  it("keeps the two layers level, so they still align line by line", () => {
    const v = splitPastedLayers(KANDU)!;
    expect(verseLayout(v[0]).lines).toHaveLength(3);
    expect(verseLayout(v[0]).blocks).toHaveLength(0);
  });

  it("does not mistake a transliteration for English on one stray word", () => {
    // "A" and "O" turn up in transliterations; one marker must not be enough.
    const v = splitPastedLayers("Baaro krShnayya ninna bhaktara manegeega\nCome, Krishna, to the homes of Your devotees.");
    expect(v![0].roman).toBe("Baaro krShnayya ninna bhaktara manegeega");
    expect(v![0].meaning).toBe("Come, Krishna, to the homes of Your devotees.");
  });
});

describe("headings over Latin-only verses", () => {
  const BAARO = `PALLAVI
BaarO krShnayya krShnayya baarO krShnayya ninna bhaktara manegeega
Come, Krishna, Krishna, come, Krishna, come now to the homes of Your devotees.

ANUPALLAVI
BaarO ninna mukha tOrO ninna sari yaarO jagadhara sheelanE
Come, show us Your beautiful face. O Lord who sustains the universe, is there anyone equal to You?

CARAṆAM 1
AndugE padukavu kaalandugE kiru gejje dhim dhimi
With anklets on Your feet and little bells on Your ankles,
Dhimi dhimi dhimi enuta pongoLalanooduta baarayya
come, playing Your enchanting flute to the rhythm of "dhimi dhimi dhimi."`;

  it("lifts the heading and still splits the two layers", () => {
    const v = splitPastedLayers(BAARO)!;
    expect(v.map((x) => x.label)).toEqual(["Pallavi", "Anupallavi", "Caraṇam 1"]);
    expect(v[0].roman).toContain("BaarO krShnayya");
    expect(v[0].meaning).toContain("Come, Krishna");
  });

  it("handles a section holding more than one pair", () => {
    const v = splitPastedLayers(BAARO)!;
    expect(v[2].roman.split("\n")).toHaveLength(2);
    expect(v[2].meaning.split("\n")).toHaveLength(2);
    expect(v[2].meaning.split("\n")[0]).toBe("With anklets on Your feet and little bells on Your ankles,");
  });
});

describe("script, transliteration and meaning across stanzas", () => {
  const SUKANCHE = `सुखाचें जें सुख चंद्रभागेतटीं ।
Sukhāche je sukh Chandrabhāgetatī
The joy that is found on the banks of the Chandrabhaga,
पुंडलीकापाठीं उभें ठाकें ॥१॥
Puṇḍalīkāpāṭhī ubhe ṭhāke
is the joy of seeing Him standing behind Pundalik.

साजिरें गोजिरें समचरणीं उभें ।
Sājire gojire samacharaṇī ubhe
He stands beautifully, with His feet placed evenly together,
भक्ताचिया लोभें विटेवरी ॥२॥
Bhaktāchiyā lobhe viṭevarī
out of love for His devotee, upon the brick.`;

  it("reads Devanagari the same way it reads Tamil", () => {
    const v = splitPastedLayers(SUKANCHE)!;
    expect(v).toHaveLength(2);
    expect(v[0].script.split("\n")).toHaveLength(2);
    expect(v[0].roman.split("\n")[0]).toBe("Sukhāche je sukh Chandrabhāgetatī");
    expect(v[0].meaning.split("\n")[1]).toBe("is the joy of seeing Him standing behind Pundalik.");
  });
});

describe("a run of script lines, then the same run transliterated", () => {
  /*
   * Written as a block rather than line by line, which is why the run is paired
   * by index across the whole thing instead of taking the line below each one.
   */
  const BLOCK = `श्री कृष्ण गोविंद हरे मुरारी
हे नाथ नारायण वासुदेवा (2)
Śrī Kṛṣṇa Govinda Hare Murāri
He Nātha Nārāyaṇa Vāsudevā (2)`;

  it("pairs the block against itself rather than sliding by one", () => {
    const v = splitPastedLayers(BLOCK)!;
    expect(v[0].script.split("\n")).toEqual([
      "श्री कृष्ण गोविंद हरे मुरारी",
      "हे नाथ नारायण वासुदेवा (2)",
    ]);
    expect(v[0].roman.split("\n")).toEqual([
      "Śrī Kṛṣṇa Govinda Hare Murāri",
      "He Nātha Nārāyaṇa Vāsudevā (2)",
    ]);
    expect(v[0].meaning).toBe("");
  });

  it("still handles a single script line with only its transliteration", () => {
    const v = splitPastedLayers("राधे कृष्णा (16)\nRādhe Kṛṣṇā (16)")!;
    expect(v[0].script).toBe("राधे कृष्णा (16)");
    expect(v[0].roman).toBe("Rādhe Kṛṣṇā (16)");
    expect(v[0].meaning).toBe("");
  });
});

describe("breaking and joining verses while reviewing a paste", () => {
  const draft = toDraft({
    label: "Pallavi",
    script: "க1\nக2\nக3",
    roman: "r1\nr2\nr3",
    meaning: "m1\nm2\nm3",
  });

  it("lays a pasted verse out as lines across the three columns", () => {
    expect(draft.label).toBe("Pallavi");
    expect(draft.lines).toEqual([
      { script: "க1", roman: "r1", meaning: "m1" },
      { script: "க2", roman: "r2", meaning: "m2" },
      { script: "க3", roman: "r3", meaning: "m3" },
    ]);
  });

  /*
   * The parser splits on blank lines, which is what the documents mostly use
   * and not always what they mean. Breaking by hand is the moment somebody can
   * see where the verse should have ended.
   */
  it("starts a new verse at the chosen line", () => {
    const out = splitAt([draft], 0, 2);
    expect(out).toHaveLength(2);
    expect(out[0].lines.map((l) => l.roman)).toEqual(["r1", "r2"]);
    expect(out[1].lines.map((l) => l.roman)).toEqual(["r3"]);
  });

  /* Inheriting "Pallavi" would name the second half after the first. */
  it("leaves the new verse unlabelled, and the first one as it was", () => {
    const out = splitAt([draft], 0, 1);
    expect(out[0].label).toBe("Pallavi");
    expect(out[1].label).toBe("");
  });

  it("refuses a break that would leave an empty verse", () => {
    expect(splitAt([draft], 0, 0)).toHaveLength(1);
    expect(splitAt([draft], 0, 3)).toHaveLength(1);
  });

  it("joins a verse back onto the one above — the way out of a wrong break", () => {
    const broken = splitAt([draft], 0, 1);
    const rejoined = joinUp(broken, 1);
    expect(rejoined).toHaveLength(1);
    expect(rejoined[0].lines.map((l) => l.roman)).toEqual(["r1", "r2", "r3"]);
    expect(rejoined[0].label).toBe("Pallavi");
  });

  it("has nothing to join above the first verse", () => {
    expect(joinUp([draft], 0)).toHaveLength(1);
  });

  it("gives back layers, dropping one nobody wrote", () => {
    const back = fromDraft({
      label: " Chorus ",
      lines: [
        { script: "", roman: "r1", meaning: "m1" },
        { script: "", roman: "r2", meaning: "m2" },
      ],
    });
    expect(back.label).toBe("Chorus");
    expect(back.script).toBe("");
    expect(back.roman).toBe("r1\nr2");
    expect(back.meaning).toBe("m1\nm2");
  });

  it("survives a round trip through the review", () => {
    expect(fromDraft(toDraft({ label: null, script: "a\nb", roman: "c\nd", meaning: "" }))).toEqual({
      label: null,
      script: "a\nb",
      roman: "c\nd",
      meaning: "",
    });
  });
});

describe("a verse whose last lines have no translation", () => {
  /*
   * Shree Krishna Govinda, as Sailavan built it: twelve lines, the last four
   * chorus repeats with no meaning written. The meaning column is therefore
   * eight filled lines followed by four blanks HOLDING THEIR PLACE.
   *
   * Trimming those blanks made the meaning count eight against twelve, the
   * layers stopped matching, and the whole translation fell out of the verse and
   * reappeared as a block at the end — every line's meaning collected at the
   * bottom, attached to nothing.
   */
  const verse = {
    script: ["स1", "स2", "स3", "स4", "स5", "स6", "स7", "स8", "स9", "स10", "स11", "स12"].join("\n"),
    roman: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12"].join("\n"),
    meaning: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "", "", "", ""].join("\n"),
  };

  it("keeps all three layers zipped, blanks and all", () => {
    const layout = verseLayout(verse);
    expect(layout.lines).toHaveLength(12);
    expect(layout.blocks).toHaveLength(0);
  });

  it("puts each meaning against its own line, and nothing against the rest", () => {
    const layout = verseLayout(verse);
    expect(layout.lines[0]).toEqual({ script: "स1", roman: "r1", meaning: "m1" });
    expect(layout.lines[7]).toEqual({ script: "स8", roman: "r8", meaning: "m8" });
    expect(layout.lines[8]).toEqual({ script: "स9", roman: "r9", meaning: "" });
    expect(layout.lines[11]).toEqual({ script: "स12", roman: "r12", meaning: "" });
  });

  it("still forgives a layer that merely ends in a newline", () => {
    const layout = verseLayout({ script: "a\nb", roman: "c\nd\n", meaning: null });
    expect(layout.lines).toHaveLength(2);
    expect(layout.blocks).toHaveLength(0);
  });

  /* A translation written as one paragraph against four lines is still a block. */
  it("leaves a genuinely different-shaped layer as a block", () => {
    const layout = verseLayout({
      script: "a\nb\nc\nd",
      roman: "e\nf\ng\nh",
      meaning: "One sentence about the whole verse.",
    });
    expect(layout.lines).toHaveLength(4);
    expect(layout.blocks.map((b) => b.layer)).toEqual(["meaning"]);
  });
});

describe("a song whose last stanzas cannot be divided", () => {
  /*
   * Gokulathai, as Sailavan pasted it: six stanzas of Tamil, transliteration and
   * meaning, and then three of bare transliteration with no translation at all.
   *
   * That last kind has nothing to divide it by — no script, no English — and it
   * used to return null for the WHOLE document, so every line of every stanza
   * went into the transliteration column together and the six good ones were
   * thrown away for the sake of the seventh.
   */
  const GOKULATHAI = `கோகுலத்தை கண்டதில்லை
Gokulaththai kandadhillai
I have never seen Gokulam,
கண்ணனையும் பார்த்ததில்லை
Kannanaiyum paarththadhillai
nor have I seen Krishna.

கங்கையும் யமுனையும் காவிரியும்
Gangaiyum Yamunaiyum Kāviriyum
The Ganga, Yamuna and Kaveri,

En mana kovilil
Pon mana Kannanai
Sri Sai vadhanam neruvadhu`;

  const verses = splitPastedLayers(GOKULATHAI);

  it("reads the stanzas it can, rather than giving up on all of them", () => {
    expect(verses).not.toBeNull();
    expect(verses).toHaveLength(3);
  });

  it("splits the Tamil stanzas into their three layers", () => {
    expect(verses![0].script.split("\n")).toEqual([
      "கோகுலத்தை கண்டதில்லை",
      "கண்ணனையும் பார்த்ததில்லை",
    ]);
    expect(verses![0].roman.split("\n")).toEqual([
      "Gokulaththai kandadhillai",
      "Kannanaiyum paarththadhillai",
    ]);
    expect(verses![0].meaning.split("\n")).toEqual([
      "I have never seen Gokulam,",
      "nor have I seen Krishna.",
    ]);
  });

  /*
   * The undividable one is kept AS a stanza, its lines in the transliteration
   * column where a transliteration most likely belongs. In a grid where every
   * cell is editable that is one stanza to tidy, not a document to redo.
   */
  it("keeps the undividable stanza whole, in the transliteration", () => {
    expect(verses![2].script).toBe("");
    expect(verses![2].meaning).toBe("");
    expect(verses![2].roman.split("\n")).toEqual([
      "En mana kovilil",
      "Pon mana Kannanai",
      "Sri Sai vadhanam neruvadhu",
    ]);
  });

  it("still gives up when NOTHING in the document can be divided", () => {
    expect(splitPastedLayers("En mana kovilil\nPon mana Kannanai")).toBeNull();
  });
});
