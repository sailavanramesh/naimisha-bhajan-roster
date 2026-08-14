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
