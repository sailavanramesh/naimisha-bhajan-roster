/**
 * Showing what KIND of session a day holds, in a calendar cell.
 *
 * A cell is about 40px wide on a phone. The kind's name does not fit, its
 * picture does — which is the same conclusion the live view's rail reached.
 * So a day carries marks: a picture where the kind has one, initials where it
 * does not, and the name in the tooltip either way.
 */

/** A kind of session, as the calendar needs it — deliberately without the image. */
export type KindLite = {
  id: string;
  name: string;
  /**
   * `updatedAt` in milliseconds, so a changed picture is fetched afresh —
   * or null when this kind has no picture, in which case initials are shown.
   */
  v: number | null;
};

export type DayMark = {
  /** The category id, or `null` for sessions with no kind set. */
  id: string | null;
  name: string;
  /** Two letters, for when there is no picture. */
  initials: string;
  /** Where the picture is, or null when the kind has none. */
  src: string | null;
  /** How many of the day's sessions are of this kind. */
  count: number;
};

/**
 * Initials for a kind with no picture.
 *
 * "Routine Thursday" → RT, "Ramayana" → RA, "Q&A" → QA. Two characters,
 * because one is ambiguous the moment there are two kinds starting with R and
 * three does not fit.
 */
export function categoryInitials(name: string): string {
  const words = name
    .split(/[\s/&_-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Where a kind's picture is served from — cacheable, and versioned by `v`.
 * Null when the kind has no picture, so nothing ever points at a 404.
 */
export function kindImageSrc(kind: KindLite): string | null {
  if (kind.v === null) return null;
  return `/api/session-kinds/${kind.id}/image?v=${kind.v}`;
}

/** What a session with no kind set is called, in a cell and in a tooltip. */
export const NO_KIND_NAME = "Kind not set";

/**
 * The marks for one day.
 *
 * Sessions of the same kind collapse into one mark with a count, because three
 * Ramayana sessions on a festival day are one thing said three times.
 *
 * A session with NO KIND still gets a mark, which it did not used to. The
 * argument for showing nothing was that the cell's own wash already says a
 * session is there — but the wash is a background tint, its lightest step is
 * one to three bhajans, and that is the ordinary weekday session. Sailavan
 * built a session on 18 August with no kind set and reported the day as
 * "slightly darker but not discernible", which is exactly right: one faint
 * tint was carrying the entire message, with nothing beside it.
 *
 * So it gets a neutral mark instead. It also reads as a prompt — a day showing
 * "?" is asking to be told what it is — which is worth more than the tidiness
 * of an empty cell.
 *
 * Kept LAST, so on a day that holds both a real kind and an untyped session the
 * real one is what survives `max`.
 *
 * `max` caps how many fit; the rest are counted in `overflow`.
 */
export function dayMarks(
  sessions: { categoryId?: string | null; categoryName?: string | null }[],
  kinds: Map<string, KindLite>,
  max = 2,
): { marks: DayMark[]; overflow: number } {
  const order: string[] = [];
  const byId = new Map<string, DayMark>();
  let untyped = 0;

  for (const s of sessions) {
    const id = s.categoryId ?? null;
    if (!id) {
      untyped += 1;
      continue;
    }

    const existing = byId.get(id);
    if (existing) {
      existing.count += 1;
      continue;
    }

    const kind = kinds.get(id);
    // A session naming a kind the client has not been told about still shows,
    // using the name that came with the session.
    const name = kind?.name ?? s.categoryName ?? "Session";
    order.push(id);
    byId.set(id, {
      id,
      name,
      initials: categoryInitials(name),
      src: kind ? kindImageSrc(kind) : null,
      count: 1,
    });
  }

  const all = order.map((id) => byId.get(id)!);
  if (untyped > 0) {
    all.push({
      id: null,
      name: NO_KIND_NAME,
      initials: "?",
      src: null,
      count: untyped,
    });
  }

  return { marks: all.slice(0, max), overflow: Math.max(0, all.length - max) };
}

/**
 * What actually fits across a cell: at most `slots` round chips.
 *
 * `dayMarks` answers "what kinds are on this day", which is a question about
 * the day. This answers "how many chips can be drawn", which is a question
 * about a box roughly 36px wide on a phone — and the two were being conflated.
 * Two 16px chips and a "+1" beside them is about 45px, so the third one hung
 * out over the edge of the cell (Sailavan, 2026-08-31, on days holding two
 * sessions: "its overflowing out of the date's square").
 *
 * So the strip is a fixed number of slots, and the LAST slot is spent on the
 * count when there is more to say than fits. Never both a full row of pictures
 * and a count beside them — that is the combination that does not fit, and the
 * width of the strip is now the same whatever the day holds.
 */
export function dayStripChips(
  marks: DayMark[],
  overflow: number,
  slots = 2,
): { shown: DayMark[]; more: number } {
  const total = marks.length + overflow;
  if (total <= slots) return { shown: marks.slice(0, slots), more: 0 };
  return { shown: marks.slice(0, slots - 1), more: total - (slots - 1) };
}

/**
 * The one-line label under the date, where there is room for it.
 *
 * "Ramayana", or "Ramayana +1" when the day holds more than one kind. Empty
 * when no session that day has a kind, so nothing renders.
 */
export function dayKindLabel(marks: DayMark[], overflow: number): string {
  if (marks.length === 0) return "";
  const more = marks.length - 1 + overflow;
  return more > 0 ? `${marks[0].name} +${more}` : marks[0].name;
}

/**
 * How full a day is, as a step on a four-point scale.
 *
 * The calendar used to say this with a coloured bar under the date. Once the
 * cell also carried the kind's picture and its name, three things were
 * competing for about forty pixels and Sailavan called it congested — rightly.
 * So fullness moved into the cell's own background: nothing is added, the day
 * simply deepens as it fills, and a month reads as a pattern.
 *
 * The steps are the ones the bar used, so the calendar says the same thing it
 * always did:
 *
 *   0  a session with nobody on it yet — or no session at all
 *   1  one to three, the ordinary weekday session (CLAUDE.md: 163 of 188)
 *   2  four to seven, a fuller evening
 *   3  eight or more, a Sunday or a festival
 */
export function fullnessStep(totalRows: number): 0 | 1 | 2 | 3 {
  if (totalRows >= 8) return 3;
  if (totalRows >= 4) return 2;
  if (totalRows >= 1) return 1;
  return 0;
}

/**
 * How many sessions a day holds, said in words, or "" for the ordinary one.
 *
 * The bars carried this too — one bar per session — so it has to be said
 * somewhere now that they are gone. A day with two sessions of the SAME kind
 * would otherwise show a single mark and read as one session.
 */
export function sessionCountLabel(sessions: unknown[]): string {
  return sessions.length > 1 ? `×${sessions.length}` : "";
}

/** What the cell says when hovered: the kinds, and how full the day is. */
export function dayTooltip(marks: DayMark[], totalRows: number, sessionCount: number): string {
  const kinds = marks.map((m) => (m.count > 1 ? `${m.name} ×${m.count}` : m.name)).join(", ");
  const rows = totalRows === 1 ? "1 bhajan" : `${totalRows} bhajans`;
  const sessions = sessionCount > 1 ? `${sessionCount} sessions · ` : "";
  if (sessionCount === 0) return "";
  return kinds ? `${kinds} · ${sessions}${rows}` : `${sessions}${rows}`;
}
