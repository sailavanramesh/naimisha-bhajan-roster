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
   * Latin-only text is refused rather than guessed at: deciding which of two
   * indistinguishable Latin lines is the transliteration and which is the
   * meaning would be wrong silently, which is worse than not trying.
   */
  it("refuses text with no script line, so the caller can fall back", () => {
    expect(splitPastedLayers("Kuzhaloothi manamellaam\nPlaying His flute.")).toBeNull();
    expect(splitPastedLayers("")).toBeNull();
  });

  it("refuses a stray line before the first script line", () => {
    expect(splitPastedLayers("Some preamble\nகுழலூதி\nKuzhaloothi")).toBeNull();
  });
});
