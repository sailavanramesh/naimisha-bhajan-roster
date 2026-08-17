import { describe, it, expect } from "vitest";
import { splitPastedLayers, verseLayout } from "../lib/songVerses";

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

  it("gives up on a stray line before the script that reads as neither", () => {
    expect(splitPastedLayers("Some preamble\nகுழலூதி\nKuzhaloothi")).toBeNull();
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
