/**
 * lib/highlight.ts — showing WHERE a search matched.
 *
 * Pure. No React, no Prisma.
 *
 * The roster list shows every session containing a match, which answers "which
 * days" but leaves you scanning a ten-row session for the reason it is there.
 * Splitting the text at the match lets the row point at itself.
 */

export type Piece = { text: string; hit: boolean };

/** A literal search string, safe to put in a RegExp. */
function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split text into matching and non-matching pieces, case-insensitively.
 *
 * Returns a single non-matching piece when there is nothing to highlight, so
 * callers never need a special case for "no query".
 *
 * Case-insensitive because the search itself is: somebody typing "rama" and
 * seeing Rama Raghava listed but not marked would reasonably assume the app
 * had matched something else.
 */
export function splitOnMatch(text: string, query: string | null | undefined): Piece[] {
  const q = (query ?? "").trim();
  if (!q || !text) return [{ text, hit: false }];

  const re = new RegExp(escape(q), "gi");
  const out: Piece[] = [];
  let last = 0;

  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), hit: false });
    out.push({ text: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length > 0 ? out : [{ text, hit: false }];
}

/** Whether a piece of text contains the query at all. */
export function matches(text: string | null | undefined, query: string | null | undefined): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return false;
  return (text ?? "").toLowerCase().includes(q);
}

/**
 * A one-line window around the first match, for long text like session notes.
 *
 * A note can run to a paragraph, and printing all of it to show a four-letter
 * match buries the thing it is meant to reveal.
 */
export function excerpt(text: string, query: string, radius = 40): string {
  const at = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at < 0) return text.length > radius * 2 ? `${text.slice(0, radius * 2)}…` : text;

  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + query.trim().length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
