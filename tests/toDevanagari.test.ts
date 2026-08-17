import { describe, it, expect } from "vitest";
import { toDevanagari } from "../lib/toDevanagari";

describe("toDevanagari", () => {
  it("writes proper IAST as Devanagari", () => {
    expect(toDevanagari("Rādhe Kṛṣṇā").text).toBe("राधे कृष्णा");
    expect(toDevanagari("Rādhe Kṛṣṇā").confident).toBe(true);
  });

  it("builds conjuncts where the romanisation writes no vowel", () => {
    // Śrī: ś + r conjunct, then ī.
    expect(toDevanagari("Śrī").text).toBe("श्री");
    expect(toDevanagari("Kṛṣṇa").text).toBe("कृष्ण");
  });

  it("leaves a word-final consonant bare, the way Hindi writes it", () => {
    expect(toDevanagari("tum").text).toBe("तुम");
    expect(toDevanagari("jag").text).toBe("जग");
  });

  it("keeps the aspirates apart from their plain forms", () => {
    expect(toDevanagari("kha gha cha jha ṭha ḍha tha dha pha bha").text).toBe(
      "ख घ छ झ ठ ढ थ ध फ भ",
    );
    expect(toDevanagari("ka ga ca ja ṭa ḍa ta da pa ba").text).toBe("क ग च ज ट ड त द प ब");
  });

  it("takes the long vowels and the diphthongs as single letters", () => {
    expect(toDevanagari("ā ī ū e ai o au").text).toBe("आ ई ऊ ए ऐ ओ औ");
    expect(toDevanagari("kā kī kū ke kai ko kau").text).toBe("का की कू के कै को कौ");
  });

  it("writes anusvara and visarga", () => {
    expect(toDevanagari("haṁsa").text).toBe("हंस");
    expect(toDevanagari("duḥkha").text).toBe("दुःख");
  });

  /* The singer's own marks mean the same in either script. */
  it("passes punctuation, digits and repeat marks through", () => {
    expect(toDevanagari("Rādhe Kṛṣṇā (16)").text).toBe("राधे कृष्णा (16)");
    expect(toDevanagari("He Nātha, Nārāyaṇa!").text).toContain(",");
  });

  /*
   * Half the group's files are written by ear rather than to a scheme. Those
   * lines still get a suggestion, and are marked so somebody reads them.
   */
  it("is not confident about a spelling written by ear", () => {
    expect(toDevanagari("Baaro krShnayya").confident).toBe(false); // aa, and Sh
    expect(toDevanagari("Kuzhaloothi").confident).toBe(false); // zh, oo
    expect(toDevanagari("Sukhāche je sukh").confident).toBe(true);
  });

  it("is not confident when a letter has no place in the scheme", () => {
    expect(toDevanagari("Wonderful").confident).toBe(false);
    expect(toDevanagari("Xerxes").confident).toBe(false);
  });

  it("has nothing to say about an empty line", () => {
    expect(toDevanagari("")).toEqual({ text: "", confident: false });
    expect(toDevanagari("   ").confident).toBe(false);
  });

  /*
   * The limit, stated as a test so it cannot be forgotten: Hindi drops inherent
   * vowels that Devanagari writes, and the romanisation does not record where.
   * "kahte" is कहते; read literally it is कह्ते, and no amount of table work
   * recovers the difference. This is why every line is a suggestion, and why the
   * review grid exists.
   */
  it("tells a real conjunct from a dropped schwa, as far as that can be told", () => {
    // "ht" is not a cluster anybody sings, so the inherent vowel stands.
    expect(toDevanagari("kahte").text).toBe("कहते");
    expect(toDevanagari("kahate").text).toBe("कहते");
    // These are clusters, and stay clusters.
    expect(toDevanagari("Kṛṣṇa").text).toBe("कृष्ण");
    expect(toDevanagari("Śrī").text).toBe("श्री");
    expect(toDevanagari("bhakta").text).toBe("भक्त");
  });

  it("writes r before a consonant as repha", () => {
    expect(toDevanagari("Sarveśvar").text).toBe("सर्वेश्वर");
  });

  it("knows the clusters that actually turn up", () => {
    expect(toDevanagari("adbhut").text).toBe("अद्भुत");
    expect(toDevanagari("Puṇḍalīka").text).toBe("पुण्डलीक");
  });

  /*
   * The limit that remains, stated so it cannot be forgotten: a pair the table
   * does not know takes the inherent vowel, so a word that really did want a
   * conjunct there comes out one syllable too long. That is why every line is a
   * suggestion and why the review grid exists.
   */
  it("gives an unknown pair the inherent vowel, right or wrong", () => {
    // "ṭn" is in no list here, so it is read as two syllables rather than one.
    expect(toDevanagari("aṭna").text).toBe("अटन");
  });
});
