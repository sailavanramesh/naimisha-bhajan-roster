/**
 * lib/repertoirePromotion.ts — what singing something does to a person's list.
 *
 * Pure. No Prisma, no I/O, because these are the rules that are easy to get
 * subtly wrong and impossible to check against a live roster: which of several
 * rows is the one to move, when a shruti may be written, and when to say
 * nothing at all. lib/repertoireFromHistory.ts does the reading and writing.
 *
 * THE RULE THAT CHANGED, 2026-08-27. Recording used to skip a bhajan that was
 * already on the list at any stage — "never downgrade", which also meant never
 * upgrade. So Prithvi had "Sai Guna Gao Sai Naam" as `wantToLearn`, sang it on
 * 2026-08-20 at the confirmed shruti, and it sat under "Want to learn"
 * afterwards. Sailavan: "if a song is in the to learn, learning buckets but
 * then is sung by that singer on a day, it should automatically go into the
 * known and sung buckets".
 *
 * lib/repertoireGuard.ts had already decided this argument in the same
 * direction — it refuses to file a bhajan under anything less than "know it"
 * when the roster says you have sung it: "Singing is evidence; a list is a
 * statement of intent, and the evidence should win an argument it was never
 * told about." It only ever asked that of a NEW row, so a list written before
 * the singing kept the older, weaker answer.
 *
 * What is still never done: nothing moves BACKWARDS, nobody's chosen shruti is
 * overwritten, and nobody's own note is replaced.
 */

/** The stages a bhajan can sit at on somebody's list. */
export type Stage = "wantToLearn" | "learning" | "known" | "festival";

export type ListedRow = {
  id: string;
  kind: Stage;
  preferredPitch: string | null;
  note: string | null;
};

export type SungAction =
  | { action: "create" }
  | {
      action: "update";
      id: string;
      /** Move it to "Know it". False when it is already there. */
      promote: boolean;
      /** Write the shruti they sang it at, because they have not chosen one. */
      fillPitch: boolean;
      /** Say where the move came from — only ever onto an empty note. */
      setNote: boolean;
    }
  | null;

/**
 * `festival` means the same as `known`.
 *
 * It is a dead enum value — see SingerRepertoire.isFestival — kept because
 * dropping one in Postgres rewrites the column. A stray row still carrying it
 * is somebody who knows the bhajan, so it must not be "promoted" to known: the
 * unique key is (singer, kind, title), and writing a second row at the same
 * title is the one thing that would actually fail.
 */
const KNOWS = new Set<Stage>(["known", "festival"]);

/**
 * What to do about one (singer, bhajan) pair that has just been sung.
 *
 * `rows` is every list entry that person has for that bhajan. Usually one, and
 * occasionally two: the seed built lists from several sheets, and the unique key
 * is on the TITLE per stage, so the same bhajan can sit at two stages at once.
 *
 * The row that is furthest along wins, and it is the only one touched. Moving
 * every row would collapse two entries into one duplicate pair at "Know it";
 * moving the least advanced one would leave the list saying both.
 */
export function decideFromSung(
  rows: readonly ListedRow[],
  confirmedPitch: string | null,
): SungAction {
  if (rows.length === 0) return { action: "create" };

  const knows = rows.find((r) => KNOWS.has(r.kind));
  // Furthest along first: knows it, else learning it, else wants to.
  const target = knows ?? rows.find((r) => r.kind === "learning") ?? rows[0];

  const promote = knows === undefined;
  const fillPitch = Boolean(confirmedPitch) && !target.preferredPitch;
  // Their own words are theirs. A note only ever lands on an empty one, and
  // only when the entry has actually moved — filling a shruti in silently is
  // not something to leave a sentence about.
  const setNote = promote && (target.note ?? "").trim().length === 0;

  if (!promote && !fillPitch) return null;
  return { action: "update", id: target.id, promote, fillPitch, setNote };
}
