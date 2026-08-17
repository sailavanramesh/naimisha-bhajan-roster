/**
 * lib/toDevanagari.ts — a Devanagari SUGGESTION from a transliteration.
 *
 * Pure. No I/O.
 *
 * WHAT THIS CANNOT DO, stated first because it decides how it is used.
 *
 * Romanised Indic text does not carry enough information to be converted back
 * cleanly, for two reasons that show up in the group's own files:
 *
 *   1. SCHWA DELETION. Hindi drops inherent vowels that Devanagari still
 *      writes. "Sab kahte tum Sarveśvar ho" is सब कहते तुम सर्वेश्वर हो — but
 *      read literally it says कह्ते and सर्वेश्वर्, because the romanisation
 *      simply does not record where the a's went. Nothing can recover them
 *      without knowing the word.
 *   2. INFORMAL SPELLING. Half the documents are not IAST at all: "Baaro
 *      krShnayya", "Kuzhaloothi", "Puṣpa charhāe". Doubled vowels stand in for
 *      macrons, "sh" for both श and ष, and capitals mark nothing consistent.
 *
 * So this never writes anything. It PROPOSES, into the same review grid a paste
 * goes through, and says per line whether it is confident — Sailavan set the bar
 * at "you can't make mistakes though as it should be clean", and the honest way
 * to meet that is to be clear about which lines a person has to look at.
 *
 * Devanagari only. Tamil, Kannada and Malayalam each need their own table and
 * their own argument about the same two problems, and guessing at which script a
 * romanisation belongs to would be a third.
 */

/** Independent vowels, and the matra that follows a consonant. */
const VOWELS: ReadonlyArray<readonly [string, string, string]> = [
  // Longest first: "ai" must not be read as "a" + "i".
  ["ai", "ऐ", "ै"],
  ["au", "औ", "ौ"],
  ["ā", "आ", "ा"],
  ["ī", "ई", "ी"],
  ["ū", "ऊ", "ू"],
  ["ṝ", "ॠ", "ॄ"],
  ["ṛ", "ऋ", "ृ"],
  ["ḷ", "ऌ", "ॢ"],
  ["e", "ए", "े"],
  ["o", "ओ", "ो"],
  ["a", "अ", ""],
  ["i", "इ", "ि"],
  ["u", "उ", "ु"],
];

/** Consonants, longest first so aspirates win over their plain forms. */
const CONSONANTS: ReadonlyArray<readonly [string, string]> = [
  ["kh", "ख"], ["gh", "घ"], ["ch", "छ"], ["jh", "झ"],
  ["ṭh", "ठ"], ["ḍh", "ढ"], ["th", "थ"], ["dh", "ध"],
  ["ph", "फ"], ["bh", "भ"],
  ["ṅ", "ङ"], ["ñ", "ञ"], ["ṭ", "ट"], ["ḍ", "ड"], ["ṇ", "ण"],
  ["ś", "श"], ["ṣ", "ष"],
  ["k", "क"], ["g", "ग"], ["c", "च"], ["j", "ज"],
  ["t", "त"], ["d", "द"], ["n", "न"],
  ["p", "प"], ["b", "ब"], ["m", "म"],
  ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"],
  ["s", "स"], ["h", "ह"],
];

const VIRAMA = "्";

/**
 * Consonant pairs that really are conjuncts, as opposed to a dropped schwa.
 *
 * This is the whole schwa problem, handled as far as it can be. When a
 * romanisation writes two consonants together it means one of two things, and
 * they look identical: a genuine cluster (कृष्ण), or an inherent vowel the
 * writer left out (कहते, written "kahte").
 *
 * Three rules get most of it right:
 *
 *   - A semivowel second — y, r, l, v — is always a conjunct: श्री, सर्व, क्य.
 *   - `r` first is always a conjunct, because Devanagari writes it as repha:
 *     "Sarveśvar" → सर्वेश्वर.
 *   - Otherwise only the clusters below, which are the ones that actually occur.
 *
 * Anything else takes the inherent vowel, which turns "kahte" into कहते instead
 * of कह्ते. Still a suggestion — "ht" could be a cluster in some word nobody has
 * sung yet — but wrong far less often.
 */
const CONJUNCTS = new Set([
  "kt", "kr", "kṣ", "gn", "gr", "ṅk", "ṅg",
  "cc", "cch", "ñc", "ñj",
  "ṭṭ", "ṭh", "ḍḍ", "ṇṭ", "ṇḍ", "ṇṇ",
  "tt", "tth", "tm", "tn", "tr", "dd", "ddh", "dbh", "dm", "dhm", "nt", "nth", "nd", "ndh", "nn", "nm",
  "pt", "pp", "ps", "bd", "bdh", "bb", "mb", "mbh", "mm", "mp",
  "jñ", "śc", "śn", "śm", "śr", "ṣṭ", "ṣṭh", "ṣṇ", "ṣp", "ṣm",
  "sk", "skh", "st", "sth", "sn", "sp", "sph", "sm", "ss",
  "hm", "hn", "ll", "lp", "lk",
]);

/** Always a conjunct when it follows a consonant. */
const SEMIVOWELS = new Set(["y", "r", "l", "v"]);
const MARKS: Record<string, string> = { "ṁ": "ं", "ṃ": "ं", "ḥ": "ः", "~": "ँ" };

/**
 * Spellings that say the source is not IAST.
 *
 * Doubled vowels stand in for macrons, "sh" is written for both श and ष, and
 * "zh" belongs to Tamil and Malayalam. Any of them means the line was written by
 * ear rather than to a scheme, so whatever comes out needs a reader.
 */
const INFORMAL = /aa|ee|ii|oo|uu|sh|zh|ck|[wqxf]/i;

function match(text: string, at: number, table: ReadonlyArray<readonly [string, ...string[]]>) {
  const lower = text.toLowerCase();
  for (const entry of table) {
    if (lower.startsWith(entry[0], at)) return entry;
  }
  return null;
}

export type Suggestion = {
  /** The Devanagari, as far as it could be built. */
  text: string;
  /**
   * True when every letter mapped and nothing about the spelling says it was
   * written by ear. Even then it is a suggestion: schwa deletion is invisible.
   */
  confident: boolean;
};

/**
 * One line of romanised text as Devanagari.
 *
 * Anything that is not a letter — spaces, punctuation, digits, the "(2)" that
 * marks a repeat — passes through untouched, because it means the same thing in
 * either script and dropping it would lose the singer's own marks.
 */
export function toDevanagari(line: string): Suggestion {
  const source = line ?? "";
  let out = "";
  let clean = !INFORMAL.test(source);
  let i = 0;

  while (i < source.length) {
    const consonant = match(source, i, CONSONANTS);
    if (consonant) {
      out += consonant[1];
      i += consonant[0].length;

      const vowel = match(source, i, VOWELS);
      if (vowel) {
        out += vowel[2];
        i += vowel[0].length;
        continue;
      }

      /*
       * No vowel written, so either a conjunct or a schwa the writer dropped.
       * See CONJUNCTS. At the end of a word the consonant stands bare, which is
       * how Hindi writes a word-final consonant: "tum" is तुम, not तुम्.
       */
      const next = match(source, i, CONSONANTS);
      if (next) {
        const first = consonant[0].toLowerCase();
        const pair = first + next[0].toLowerCase();
        if (SEMIVOWELS.has(next[0].toLowerCase()) || first === "r" || CONJUNCTS.has(pair)) {
          out += VIRAMA;
        }
        // Otherwise the inherent vowel stands, and nothing is emitted.
      }
      continue;
    }

    const vowel = match(source, i, VOWELS);
    if (vowel) {
      out += vowel[1];
      i += vowel[0].length;
      continue;
    }

    const mark = MARKS[source[i]];
    if (mark) {
      out += mark;
      i += 1;
      continue;
    }

    // A Latin letter nothing accounts for: the line is not IAST.
    if (/\p{Script=Latin}/u.test(source[i])) clean = false;
    out += source[i];
    i += 1;
  }

  return { text: out, confident: clean && out.trim().length > 0 };
}
