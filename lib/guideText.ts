/**
 * The small markup the guide is written in.
 *
 * WHY NOT MARKDOWN. A guide card holds paragraphs, bullets, a bold lead-in and
 * the occasional link to another screen — that is the whole vocabulary the page
 * has ever used. A markdown library brings headings, tables, images, raw HTML
 * and a `dangerouslySetInnerHTML` at the end of it, which is a large new surface
 * for one page that one person edits. This parses the four things instead, into
 * a tree React renders as ordinary elements, so nothing a section body contains
 * can become markup.
 *
 * The blocks, separated by a blank line:
 *
 *   an ordinary paragraph
 *   > a muted aside, the grey line at the foot of a card
 *   - a bullet
 *   - another bullet, consecutive `- ` lines make one list
 *
 * And inline, anywhere: **bold**, _italic_ and [text](/link).
 *
 * Italic is `_this_` rather than `*this*` so it cannot half-match against the
 * `**` of bold — the guide's copy leans on both, often in the same sentence.
 *
 * Pure and Prisma-free, per CLAUDE.md. Tested in guideText.test.ts.
 */

/** A run of text inside a paragraph or a bullet. */
export type GuideSpan =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; href: string };

export type GuideBlock =
  | { kind: "paragraph"; spans: GuideSpan[] }
  /** The muted line — `> ` — used for the aside at the foot of a card. */
  | { kind: "aside"; spans: GuideSpan[] }
  | { kind: "list"; items: GuideSpan[][] };

/**
 * Inline markup, left to right.
 *
 * One pass over both patterns rather than bold-then-links, so `**[a](/b)**`
 * cannot half-match and leave literal asterisks on the page. Whichever opens
 * first wins, and anything unmatched — a stray `**`, a `[` with no `](` — stays
 * as the text somebody typed rather than eating the rest of the line.
 */
export function parseSpans(line: string): GuideSpan[] {
  const spans: GuideSpan[] = [];
  let text = "";

  const flush = () => {
    if (text.length > 0) spans.push({ kind: "text", text });
    text = "";
  };

  let i = 0;
  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const end = line.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        spans.push({ kind: "bold", text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    if (line[i] === "_") {
      const end = line.indexOf("_", i + 1);
      if (end > i + 1) {
        flush();
        spans.push({ kind: "italic", text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (line[i] === "[") {
      const close = line.indexOf("](", i);
      if (close > i) {
        const end = line.indexOf(")", close + 2);
        if (end > close) {
          const href = line.slice(close + 2, end).trim();
          // Internal paths and ordinary web links only. A `javascript:` href is
          // the one way a text field could still become behaviour.
          if (/^(\/|https?:\/\/|mailto:)/.test(href)) {
            flush();
            spans.push({ kind: "link", text: line.slice(i + 1, close), href });
            i = end + 1;
            continue;
          }
        }
      }
    }

    text += line[i];
    i += 1;
  }

  flush();
  return spans;
}

/**
 * A section body into blocks.
 *
 * Soft-wrapped lines inside a paragraph are joined with a space, so somebody
 * editing in a textarea can wrap where they like — a blank line is the only
 * thing that starts a new block.
 */
export function parseGuideBody(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  /** The paragraph or list being accumulated. */
  let para: string[] = [];
  let aside: string[] = [];
  let items: string[] = [];

  const endPara = () => {
    if (para.length > 0) blocks.push({ kind: "paragraph", spans: parseSpans(para.join(" ")) });
    para = [];
  };
  const endAside = () => {
    if (aside.length > 0) blocks.push({ kind: "aside", spans: parseSpans(aside.join(" ")) });
    aside = [];
  };
  const endList = () => {
    if (items.length > 0) blocks.push({ kind: "list", items: items.map(parseSpans) });
    items = [];
  };
  const endAll = () => {
    endPara();
    endAside();
    endList();
  };

  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();

    if (line.length === 0) {
      endAll();
      continue;
    }

    if (line.startsWith("- ")) {
      endPara();
      endAside();
      items.push(line.slice(2).trim());
      continue;
    }

    if (line.startsWith("> ")) {
      endPara();
      endList();
      aside.push(line.slice(2).trim());
      continue;
    }

    endAside();
    endList();
    para.push(line);
  }

  endAll();
  return blocks;
}
