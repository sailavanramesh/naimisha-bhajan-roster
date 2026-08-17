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
 * A layer's lines WITH its blanks, for lining the layers up against each other.
 *
 * `layerLines` strips blank lines off both ends, which is right for reading a
 * layer on its own — a text that happens to end in a newline should not grow a
 * phantom line. It is wrong for lining layers up, because in a padded column a
 * trailing blank is not an artefact: it is a line that HAS no translation, and
 * it is holding that line's place.
 *
 * Sailavan's Shree Krishna Govinda: twelve lines, the last four of them chorus
 * repeats with no meaning written. Trimmed, the meaning counted eight against
 * twelve, the layers stopped matching, and the whole translation fell out of the
 * verse and reappeared as a block at the end — every line's meaning collected at
 * the bottom, attached to nothing.
 *
 * The one thing still dropped is a SINGLE trailing newline, which is what a text
 * ending in "\n" leaves behind and means nothing. Two or more are padding and
 * survive — which is exactly the difference between a stray keystroke and a
 * column that was built to line up.
 */
export function alignLines(text?: string | null): string[] {
  const normalised = (text ?? "").replace(/\r\n?/g, "\n");
  const lines = normalised.split("\n");
  if (normalised.endsWith("\n") && !normalised.endsWith("\n\n")) lines.pop();
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
    .filter((text) => layerLines(text).length > 0)
    .map((text) => alignLines(text).length);
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
    const count = alignLines(verse[layer]).length;
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
    const length = alignLines(verse[aligned[0]]).length;
    for (let i = 0; i < length; i++) {
      // A blank here is a line with no translation, and renders as nothing —
      // which is the point: the lines either side of it stay where they belong.
      const at = (layer: Layer) =>
        aligned.includes(layer) ? (alignLines(verse[layer])[i] ?? null) : null;
      lines.push({ script: at("script"), roman: at("roman"), meaning: at("meaning") });
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
 * letter because a line is routinely mixed: "मकर कुण्डलम् (Kannan)".
 */
function isScriptLine(line: string): boolean {
  for (const ch of line) {
    if (!/\p{L}/u.test(ch)) continue;
    if (!/\p{Script=Latin}/u.test(ch)) return true;
  }
  return false;
}

/**
 * Words that are common in English and vanishingly rare in a transliteration.
 *
 * This is how a MEANING is told apart from a transliteration when both are
 * written in Latin letters, which is the case in half the group's documents —
 * "Kandu Njan Kannane Kayamboo Varnane" then "I saw Krishna, the One with the
 * complexion of the kayamboo flower."
 *
 * Function words, not vocabulary: "Krishna", "Radha" and "flute" appear in both
 * kinds of line, whereas "the", "of" and "with" only appear in the English one.
 */
const ENGLISH_MARKERS = new Set(
  ("a an the of and or is are was were be been am to in on at with for from by " +
    "my your his her its our their you i he she we they them us it this that these " +
    "those who whom which what when where how not no all every any come comes came " +
    "stand stands stood become becomes became have has had do does did o oh even " +
    "may might can could will would upon before after within without into out")
    .split(" "),
);

/**
 * Does this Latin line read as English rather than as a transliteration?
 *
 * TWO markers, not one. A single "a" or "o" turns up in plenty of
 * transliterations — "Baaro krShnayya", "Sāṁvariya" — and one hit would call
 * them translations. Two whole function words in the same line is a thing
 * transliterated Sanskrit, Tamil or Marathi essentially never does.
 */
function looksEnglish(line: string): boolean {
  const words = line.toLowerCase().match(/\p{L}+/gu) ?? [];
  let hits = 0;
  for (const word of words) {
    if (ENGLISH_MARKERS.has(word)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

export type PastedVerse = {
  label: string | null;
  script: string;
  roman: string;
  meaning: string;
};

type Line = { script: string; roman: string; meaning: string };

/** Runs of script lines and the Latin lines that follow them, paired up. */
function pairScriptRun(script: string[], latin: string[]): Line[] {
  const empty = { script: "", roman: "", meaning: "" };

  /*
   * Twice as many Latin lines as script lines: transliteration and meaning,
   * alternating. The commonest shape in the documents.
   */
  if (latin.length === script.length * 2) {
    return script.map((s, i) => ({ script: s, roman: latin[2 * i], meaning: latin[2 * i + 1] }));
  }

  /*
   * As many as there are: transliteration only, no translation. Written as a
   * BLOCK in some documents — two lines of Devanagari, then the same two
   * transliterated — which is why this pairs by index across the whole run
   * rather than taking the line immediately below each one.
   */
  if (latin.length === script.length) {
    return script.map((s, i) => ({ ...empty, script: s, roman: latin[i] }));
  }

  // Anything else: line them up as far as they go, and let the leftovers land
  // in the last meaning rather than disappear.
  return script.map((s, i) => {
    const isLast = i === script.length - 1;
    const roman = latin[i] ?? "";
    const rest = isLast ? latin.slice(script.length).join(" ") : "";
    return { script: s, roman, meaning: rest };
  });
}

/** Latin-only text: transliteration, and the English lines that translate it. */
function pairLatinOnly(lines: string[]): Line[] | null {
  if (!lines.some(looksEnglish)) return null;

  const out: Line[] = [];
  for (const line of lines) {
    if (looksEnglish(line) && out.length > 0) {
      const last = out[out.length - 1];
      // A translation that wrapped is one meaning, not two.
      last.meaning = last.meaning ? `${last.meaning} ${line}` : line;
      continue;
    }
    out.push({ script: "", roman: line, meaning: "" });
  }
  return out;
}

/**
 * One paste, all three layers — for the way the documents are actually written.
 *
 * They are written four ways, all of them in the group's own files:
 *
 *   1. script / transliteration / meaning, line by line
 *   2. transliteration / meaning, line by line, with no script at all
 *   3. a run of script lines followed by the same run transliterated
 *   4. any of those under a heading — PALLAVI, CARAṆAM 1
 *
 * Pasting used to mean one layer at a time, picking out every second or third
 * line by hand. What makes it possible to do at once is that each layer is
 * recognisable on sight: a script line is not in Latin letters, and an English
 * line carries function words that a transliteration does not.
 *
 * Every line contributes exactly one entry to each layer, PADDING where a
 * translation is missing — which keeps the three the same length, which is the
 * whole condition `verseLayout` needs to zip them line by line rather than show
 * three blocks.
 *
 * It is a proposal. Everything it decides is laid out for review before a word
 * is written, so being wrong about a line is a thing somebody corrects rather
 * than a thing they have to discover later.
 *
 * Returns null only when there is nothing to go on — no script, and nothing that
 * reads as English — in which case the caller asks which single layer it is.
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
    if (lines.length === 0) continue;

    let paired: Line[] | null;

    if (lines.some(isScriptLine)) {
      paired = [];
      let i = 0;
      while (i < lines.length) {
        // A run of script lines, then the Latin lines belonging to it.
        const script: string[] = [];
        while (i < lines.length && isScriptLine(lines[i])) script.push(lines[i++]);
        const latin: string[] = [];
        while (i < lines.length && !isScriptLine(lines[i])) latin.push(lines[i++]);

        if (script.length === 0) {
          // Latin before any script line — treat it on its own terms.
          const only = pairLatinOnly(latin);
          if (!only) return null;
          paired.push(...only);
          continue;
        }
        paired.push(...pairScriptRun(script, latin));
      }
    } else {
      paired = pairLatinOnly(lines);
    }

    if (!paired || paired.length === 0) return null;

    out.push({
      label: block.label,
      script: paired.map((l) => l.script).join("\n"),
      roman: paired.map((l) => l.roman).join("\n"),
      meaning: paired.map((l) => l.meaning).join("\n"),
    });
  }

  if (out.length === 0) return null;

  // A layer nobody wrote is absent, not a stack of empty lines.
  return out.map((v) => ({
    ...v,
    script: v.script.trim().length > 0 ? v.script : "",
    roman: v.roman.trim().length > 0 ? v.roman : "",
    meaning: v.meaning.trim().length > 0 ? v.meaning : "",
  }));
}

/** A verse while it is being reviewed: lines, so the columns can be seen to line up. */
export type DraftVerse = {
  label: string;
  lines: { script: string; roman: string; meaning: string }[];
};

export function toDraft(v: PastedVerse): DraftVerse {
  const script = v.script.split("\n");
  const roman = v.roman.split("\n");
  const meaning = v.meaning.split("\n");
  const rows = Math.max(script.length, roman.length, meaning.length);

  return {
    label: v.label ?? "",
    lines: Array.from({ length: rows }, (_, i) => ({
      script: script[i] ?? "",
      roman: roman[i] ?? "",
      meaning: meaning[i] ?? "",
    })),
  };
}

export function fromDraft(v: DraftVerse): PastedVerse {
  const column = (key: "script" | "roman" | "meaning") => {
    const lines = v.lines.map((l) => l[key]);
    // All blank means the layer is absent, not a stack of empty lines.
    return lines.some((l) => l.trim().length > 0) ? lines.join("\n") : "";
  };
  return {
    label: v.label.trim() || null,
    script: column("script"),
    roman: column("roman"),
    meaning: column("meaning"),
  };
}

/**
 * Start a new verse at this line.
 *
 * The parser splits verses on blank lines, which is what the documents mostly
 * use — but not always, and not reliably once a file has been through a few
 * hands. Sailavan: "allow us to manually create a verse break and make a new
 * verse at any line." Doing it here, while reviewing, is the moment somebody can
 * actually see where the verse should have ended.
 *
 * The new verse takes no label. Inheriting "Pallavi" would name the second half
 * after the first, which is exactly the thing being corrected.
 */
export function splitAt(draft: DraftVerse[], index: number, line: number): DraftVerse[] {
  const verse = draft[index];
  // Breaking above the first line would leave an empty verse behind.
  if (line <= 0 || line >= verse.lines.length) return draft;

  return [
    ...draft.slice(0, index),
    { ...verse, lines: verse.lines.slice(0, line) },
    { label: "", lines: verse.lines.slice(line) },
    ...draft.slice(index + 1),
  ];
}

/** Put a verse back onto the one above it — the way out of a break made by mistake. */
export function joinUp(draft: DraftVerse[], index: number): DraftVerse[] {
  if (index <= 0) return draft;
  const above = draft[index - 1];
  return [
    ...draft.slice(0, index - 1),
    { ...above, lines: [...above.lines, ...draft[index].lines] },
    ...draft.slice(index + 1),
  ];
}

export function editVerse(draft: DraftVerse[], index: number, change: (v: DraftVerse) => DraftVerse) {
  return draft.map((v, i) => (i === index ? change(v) : v));
}
