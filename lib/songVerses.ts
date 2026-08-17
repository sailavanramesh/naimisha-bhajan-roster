/**
 * lib/songVerses.ts — the sections of a song, and the three layers of a verse.
 *
 * Pure. No Prisma, no I/O.
 *
 * A verse holds up to three layers: the words in their own script, the same
 * words transliterated, and what they mean. The group's documents write these
 * two different ways and both have to render properly:
 *
 *   - Janmashtami aligns them PER LINE — Tamil, transliteration and English
 *     for each line in turn.
 *   - Meerabai gives the transliteration as a stanza and then one English
 *     block underneath it.
 *
 * So the display zips the layers line by line when they have the same number
 * of lines, and stacks them as blocks when they do not. Guessing an alignment
 * that is not there would silently pair a line with the wrong meaning, which
 * is worse than showing two blocks.
 */

/** The Carnatic sections, in the order a kriti runs. */
export const CARNATIC_SECTIONS = ["Pallavi", "Anupallavi", "Charanam"] as const;

/** The Western ones. A bhajan sung to a Western structure uses these. */
export const WESTERN_SECTIONS = ["Verse", "Chorus", "Bridge", "Refrain"] as const;

/** Sections that are counted — there is one Pallavi but several Charanams. */
const NUMBERED = new Set<string>(["Charanam", "Verse"]);

export type SectionStyle = "carnatic" | "western";

export function sectionsFor(style: SectionStyle): readonly string[] {
  return style === "carnatic" ? CARNATIC_SECTIONS : WESTERN_SECTIONS;
}

/**
 * The label to put on the next verse when somebody picks a section.
 *
 * "Charanam" becomes "Charanam 1" the first time and "Charanam 2" the next,
 * because that is how the documents write it and because a song with three
 * identical "Charanam" headings tells a singer nothing about where they are.
 * Pallavi and Chorus are not numbered — there is one of each, and "Chorus 1"
 * would be inventing a distinction the music does not have.
 *
 * Existing numbers are read rather than counted: deleting Charanam 2 of three
 * must not make the next one a second Charanam 3.
 */
export function nextSectionLabel(existing: readonly string[], section: string): string {
  const base = section.trim();
  if (!base) return "";
  if (!NUMBERED.has(base)) return base;

  const pattern = new RegExp(`^${escapeRegExp(base)}\\s*(\\d+)?$`, "i");
  let highest = 0;
  for (const label of existing) {
    const m = pattern.exec((label ?? "").trim());
    if (!m) continue;
    highest = Math.max(highest, m[1] ? Number(m[1]) : 1);
  }
  return `${base} ${highest + 1}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Which family a label belongs to, for the tint on its heading.
 *
 * Unknown labels — "Interlude", "Swaras", anything the group writes itself —
 * come back as null and are shown plainly. A label the app does not recognise
 * is a perfectly good label; it simply gets no colour.
 */
export function sectionFamily(label?: string | null): SectionStyle | null {
  const base = (label ?? "").trim().replace(/\s*\d+$/, "");
  if (!base) return null;
  const lower = base.toLowerCase();
  if (CARNATIC_SECTIONS.some((s) => s.toLowerCase() === lower)) return "carnatic";
  if (WESTERN_SECTIONS.some((s) => s.toLowerCase() === lower)) return "western";
  return null;
}

export type VerseLayers = {
  script?: string | null;
  roman?: string | null;
  meaning?: string | null;
};

export type VerseLine = {
  script: string | null;
  roman: string | null;
  meaning: string | null;
};

/**
 * Lines of a layer, with trailing blanks dropped.
 *
 * Blank lines INSIDE a layer are kept: they are how somebody separates two
 * thoughts within a verse, and dropping them would change what was written.
 */
export function layerLines(text?: string | null): string[] {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  return lines;
}

/**
 * Do the layers that are present all have the same number of lines?
 *
 * Only the layers that exist count. A verse with a script and a
 * transliteration but no meaning still aligns line by line.
 */
export function layersAlign(verse: VerseLayers): boolean {
  const counts = [verse.script, verse.roman, verse.meaning]
    .map(layerLines)
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.length);
  if (counts.length < 2) return false;
  return counts.every((n) => n === counts[0]);
}

/**
 * The verse as aligned lines, or null when the layers do not line up.
 *
 * Null is the signal to render blocks instead. Deliberately not a best-effort
 * pairing: a Meerabai stanza of four lines with one sentence of meaning would
 * otherwise put that sentence against the first line and leave three bare, so
 * the reader would take it as the meaning of line one.
 */
export function zipVerseLines(verse: VerseLayers): VerseLine[] | null {
  if (!layersAlign(verse)) return null;

  const script = layerLines(verse.script);
  const roman = layerLines(verse.roman);
  const meaning = layerLines(verse.meaning);
  const length = Math.max(script.length, roman.length, meaning.length);

  return Array.from({ length }, (_, i) => ({
    script: script[i] ?? null,
    roman: roman[i] ?? null,
    meaning: meaning[i] ?? null,
  }));
}

export type Layer = "script" | "roman" | "meaning";

/** In reading order: the words, then how to say them, then what they mean. */
const LAYER_ORDER: readonly Layer[] = ["script", "roman", "meaning"];

export type VerseLayout = {
  /** The layers that line up, zipped. Empty when none do. */
  lines: VerseLine[];
  /** The layers that do not, kept whole and shown beneath. */
  blocks: Array<{ layer: Layer; text: string }>;
};

/**
 * How to lay a verse out: which layers align, and which stand alone.
 *
 * Generalises `zipVerseLines`, which was all-or-nothing and threw away real
 * alignment. The Krishna document is the case that showed it: six lines of
 * Devanagari against six of transliteration — a perfect pairing — and then one
 * English sentence for the whole verse. The old rule saw "not all three match"
 * and rendered three blocks, losing the one pairing a reader most wants.
 *
 * The rule: group the layers present by line count, align the LARGEST group,
 * and leave the rest as blocks. A group of one is not an alignment, so a lone
 * layer falls through to a block and the Meerabai case still refuses to pair a
 * four-line stanza with one sentence. Ties go to the group that comes first in
 * reading order, which is the one containing the script.
 */
export function verseLayout(verse: VerseLayers): VerseLayout {
  const present = LAYER_ORDER.filter((layer) => layerLines(verse[layer]).length > 0);
  if (present.length === 0) return { lines: [], blocks: [] };

  const byCount = new Map<number, Layer[]>();
  for (const layer of present) {
    const count = layerLines(verse[layer]).length;
    byCount.set(count, [...(byCount.get(count) ?? []), layer]);
  }

  // Largest group wins; ties fall to whichever appeared first, which the Map
  // preserves because `present` is already in reading order.
  let aligned: Layer[] = [];
  for (const group of byCount.values()) {
    if (group.length > aligned.length) aligned = group;
  }
  if (aligned.length < 2) aligned = [];

  const lines: VerseLine[] = [];
  if (aligned.length > 0) {
    const length = layerLines(verse[aligned[0]]).length;
    for (let i = 0; i < length; i++) {
      lines.push({
        script: aligned.includes("script") ? (layerLines(verse.script)[i] ?? null) : null,
        roman: aligned.includes("roman") ? (layerLines(verse.roman)[i] ?? null) : null,
        meaning: aligned.includes("meaning") ? (layerLines(verse.meaning)[i] ?? null) : null,
      });
    }
  }

  const blocks = present
    .filter((layer) => !aligned.includes(layer))
    .map((layer) => ({ layer, text: (verse[layer] ?? "").trim() }));

  return { lines, blocks };
}

/** Is there anything in this verse at all? */
export function verseIsEmpty(verse: VerseLayers): boolean {
  return (
    layerLines(verse.script).length === 0 &&
    layerLines(verse.roman).length === 0 &&
    layerLines(verse.meaning).length === 0
  );
}

/**
 * Split a pasted block into verses on blank lines.
 *
 * For moving a Doc across by hand, which is how every one of these songs will
 * arrive at first. A run of blank lines is one break, not several, because
 * that is what a Doc produces when somebody has spaced their stanzas out.
 *
 * A leading line that is only a section heading — "PALLAVI", "CARAṆAM 1" —
 * becomes that verse's label rather than its first line. The Udupi Krishna
 * song in the Janmashtami document is written exactly like this.
 */
export function splitPastedVerses(text: string): Array<{ label: string | null; body: string }> {
  const blocks = (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/\s+$/, ""))
    .filter((block) => block.trim().length > 0);

  return blocks.map((block) => {
    const lines = block.split("\n");
    const first = (lines[0] ?? "").trim();
    if (lines.length > 1 && isSectionHeading(first)) {
      return { label: tidyHeading(first), body: lines.slice(1).join("\n") };
    }
    return { label: null, body: block };
  });
}

/**
 * Does this line look like a heading rather than a lyric?
 *
 * Short, no sentence punctuation, and either a known section name or written
 * in capitals — which is how the documents mark them. Kept strict on purpose:
 * taking a real first line for a heading loses a line of the song.
 */
function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 24) return false;
  if (/[.,;:!?]$/.test(trimmed)) return false;

  const withoutNumber = trimmed.replace(/\s*\d+$/, "");
  const known = [...CARNATIC_SECTIONS, ...WESTERN_SECTIONS].some(
    (s) => s.toLowerCase() === withoutNumber.toLowerCase(),
  );
  if (known) return true;

  // ALL CAPS, as the documents write PALLAVI and ANUPALLAVI. Latin letters
  // only — a Devanagari or Tamil line has no case and must never match.
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/** "CARAṆAM 1" as written, tidied to "Caraṇam 1". Capitals are a marker, not a shout. */
function tidyHeading(heading: string): string {
  return heading
    .trim()
    .toLocaleLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase());
}

/**
 * Is this line written in a script other than Latin?
 *
 * Tamil, Devanagari, Telugu, Kannada — the letter itself says so, which is far
 * more reliable than guessing from punctuation or length. Checked letter by
 * letter because a line is routinely mixed: "மகர குண்டலமாடவும் (Kannan)".
 */
function isScriptLine(line: string): boolean {
  for (const ch of line) {
    if (!/\p{L}/u.test(ch)) continue;
    if (!/\p{Script=Latin}/u.test(ch)) return true;
  }
  return false;
}

export type PastedVerse = {
  label: string | null;
  script: string;
  roman: string;
  meaning: string;
};

/**
 * One paste, all three layers — for the way the documents are actually written.
 *
 * The source documents interleave the layers line by line rather than keeping
 * them in three blocks:
 *
 *     குழலூதி மனமெல்லாம் கொள்ளைகொண்ட          ← the line, in Tamil
 *     Kuzhaloothi manamellaam kollai konda      ← how it is sung
 *     Playing His flute, He has stolen my heart ← what it means
 *
 * Pasting that used to mean doing it three times, picking out every third line
 * by hand each time, having already reformatted the document — for a song of
 * twenty lines, sixty decisions. Sailavan asked whether it could just take what
 * he has and let him fix it afterwards. It can: the SCRIPT line is recognisable
 * on sight, so it starts a group and the Latin lines under it fill the other two
 * layers.
 *
 * Every group contributes exactly one line to each layer, PADDING with an empty
 * line where a translation is missing. That is what keeps the layers the same
 * length, which is the whole condition `verseLayout` needs to show them aligned
 * line by line rather than as three blocks.
 *
 * Returns null when the text is not this shape — no non-Latin line anywhere, or
 * a stray line before the first one — and the caller falls back to pasting a
 * single layer. Guessing at a Latin-only document would mean deciding which of
 * two indistinguishable lines is the transliteration and which is the meaning,
 * and getting that wrong silently is worse than not trying.
 */
export function splitPastedLayers(text: string): PastedVerse[] | null {
  const blocks = splitPastedVerses(text);
  if (blocks.length === 0) return null;

  const out: PastedVerse[] = [];

  for (const block of blocks) {
    const lines = block.body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const groups: { script: string; rest: string[] }[] = [];
    for (const line of lines) {
      if (isScriptLine(line)) {
        groups.push({ script: line, rest: [] });
      } else if (groups.length > 0) {
        groups[groups.length - 1].rest.push(line);
      } else {
        // Latin before any script line: not the interleaved shape.
        return null;
      }
    }

    if (groups.length === 0) return null;

    out.push({
      label: block.label,
      script: groups.map((g) => g.script).join("\n"),
      roman: groups.map((g) => g.rest[0] ?? "").join("\n"),
      // Anything past the transliteration is the meaning. Joined rather than
      // dropped: a translation that wrapped onto two lines in the document is
      // one meaning, and losing half of it would be silent.
      meaning: groups.map((g) => g.rest.slice(1).join(" ")).join("\n"),
    });
  }

  return out;
}
