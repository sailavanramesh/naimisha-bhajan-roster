/**
 * lib/lyricFlags.ts — words or phrases to flag in a rostered bhajan's lyrics.
 *
 * The lyric counterpart of "cannot sing on this date": a coordinator decides a
 * term, from a date and optionally until one, and any session in that window
 * whose bhajans' lyrics contain it says so. It flags; it never blocks.
 *
 * Pure, no Prisma, so it is testable on its own. The terms are rows of
 * `LyricFlag`, managed from /admin.
 */

export type LyricFlagRule = {
  id: string;
  term: string;
  wholeWord: boolean;
  note: string | null;
  /** `YYYY-MM-DD`, inclusive. */
  startsOn: string;
  /** `YYYY-MM-DD`, inclusive. Null means it never ends. */
  endsOn: string | null;
};

export type LyricFlagSlot = {
  position: number;
  title: string;
  lyrics: string | null;
};

export type LyricFlagHit = {
  position: number;
  title: string;
  flagId: string;
  term: string;
  note: string | null;
  /** The matched text as it is written in the lyrics, e.g. "Rama" for "ram". */
  matched: string;
};

/**
 * Whether a rule applies to a session on `dateISO`.
 *
 * Compared as strings: both are `YYYY-MM-DD`, which sorts as dates do, and it
 * keeps every timezone out of the question — a session date is a calendar date.
 */
export function flagAppliesOn(rule: Pick<LyricFlagRule, "startsOn" | "endsOn">, dateISO: string): boolean {
  if (dateISO < rule.startsOn) return false;
  return rule.endsOn === null || dateISO <= rule.endsOn;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The pattern for one term. Case-insensitive, and whitespace inside a phrase
 * matches any run of whitespace, so a line break between two words still
 * counts. Whole-word uses Unicode letter classes rather than `\b`, which only
 * knows ASCII and would treat a Devanagari word as having no edges.
 */
export function termPattern(term: string, wholeWord: boolean): RegExp | null {
  const words = term.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const body = words.map(escapeRegExp).join("\\s+");
  const src = wholeWord ? `(?<![\\p{L}\\p{M}\\p{N}])${body}(?![\\p{L}\\p{M}\\p{N}])` : body;
  return new RegExp(src, "iu");
}

/** Every (slot, term) pair where the term is in that slot's lyrics, on that date. */
export function findLyricFlags(
  rules: LyricFlagRule[],
  slots: LyricFlagSlot[],
  dateISO: string,
): LyricFlagHit[] {
  const active = rules
    .filter((r) => flagAppliesOn(r, dateISO))
    .map((r) => ({ rule: r, re: termPattern(r.term, r.wholeWord) }))
    .filter((x): x is { rule: LyricFlagRule; re: RegExp } => x.re !== null);
  if (active.length === 0) return [];

  const hits: LyricFlagHit[] = [];
  for (const slot of slots) {
    if (!slot.lyrics) continue;
    for (const { rule, re } of active) {
      const m = re.exec(slot.lyrics);
      if (!m) continue;
      hits.push({
        position: slot.position,
        title: slot.title,
        flagId: rule.id,
        term: rule.term,
        note: rule.note,
        matched: m[0].replace(/\s+/g, " "),
      });
    }
  }
  return hits;
}
