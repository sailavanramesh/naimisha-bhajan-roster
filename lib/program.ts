/**
 * lib/program.ts — the running order of a music program.
 *
 * Pure. No Prisma, no I/O, no clock.
 *
 * A program is an ordered list of items, and an item is either a song or a
 * passage read between songs. Everything here is about that list: what the
 * group calls each item out loud, how a performer's name is written when they
 * may not be a roster singer, and how the order changes when somebody moves a
 * piece.
 */

export type ItemKind = "song" | "narration";

export type OrderedItem = {
  position: number;
  kind: ItemKind;
};

/**
 * The number the group says out loud, per item.
 *
 * The source documents number songs 1, 2, 3 and never number the passages
 * between them, so the spoken number is NOT the position: a program running
 * song, narration, song calls its items 1 and 2, not 1 and 3. Keyed by
 * position, with narrations absent rather than null — a narration has no number
 * at all.
 *
 * Deriving this is what lets a passage be dropped in anywhere without
 * renumbering the songs after it, which is the whole reason narrations are
 * items in one list rather than a field hanging off the song that follows.
 */
export function songNumbers(items: readonly OrderedItem[]): Map<number, number> {
  const numbers = new Map<number, number>();
  let n = 0;
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    if (item.kind !== "song") continue;
    n += 1;
    numbers.set(item.position, n);
  }
  return numbers;
}

/** How many songs are in a running order, narrations excluded. */
export function songCount(items: readonly OrderedItem[]): number {
  return items.reduce((n, item) => (item.kind === "song" ? n + 1 : n), 0);
}

/**
 * What one program's running order is called on a listing.
 *
 * "6 songs" is what a coordinator is looking for; the passages are part of the
 * shape of the evening rather than something to count. They are mentioned only
 * when there are any.
 */
export function runningOrderLabel(items: readonly OrderedItem[]): string {
  const songs = songCount(items);
  const readings = items.length - songs;
  const songPart = `${songs} song${songs === 1 ? "" : "s"}`;
  if (readings === 0) return songPart;
  return `${songPart}, ${readings} reading${readings === 1 ? "" : "s"}`;
}

export type PerformerLike = {
  singerName?: string | null;
  /** A guest or a group, when there is no Singer row. */
  name?: string | null;
  part?: string | null;
};

/**
 * One performer, as a line of text.
 *
 * `singerId` OR `name` — see the ProgramPerformer comment. Half the performers
 * in the source documents are not roster singers (`Psais`, `All girls`,
 * `Radhika aunty`), so this cannot assume a Singer row exists.
 *
 * The part is shown in brackets when there is one, because "Rhuben (tenor)"
 * says something "Rhuben" does not, and most items have no parts at all.
 */
export function performerLabel(p: PerformerLike): string {
  const who = (p.singerName ?? p.name ?? "").trim();
  const part = (p.part ?? "").trim();
  if (!who) return part ? `(${part})` : "";
  return part ? `${who} (${part})` : who;
}

/**
 * The performers of an item, as one line.
 *
 * Empty string when there are none, NOT "Unassigned" — a program item without
 * singers yet is a normal state while a program is being built, and the editor
 * says so in its own words rather than having this invent a placeholder.
 */
export function performersLabel(performers: readonly PerformerLike[]): string {
  return performers
    .map(performerLabel)
    .filter(Boolean)
    .join(", ");
}

export type InstrumentLike = {
  instrumentName: string;
  singerName?: string | null;
  person?: string | null;
};

/**
 * "Tabla (Sriraag), Harmonium (Gowtem), Keyboard" — the documents' own form.
 *
 * An instrument with nobody against it is written bare rather than omitted: the
 * documents do exactly this, and "Keyboard" with no name still tells the desk a
 * keyboard is on that item.
 */
export function instrumentsLabel(instruments: readonly InstrumentLike[]): string {
  return instruments
    .map((i) => {
      const who = (i.singerName ?? i.person ?? "").trim();
      return who ? `${i.instrumentName} (${who})` : i.instrumentName;
    })
    .join(", ");
}

/**
 * Positions renumbered 1..n, in their current order.
 *
 * Used after any insert, delete or move. Returned as a list of the changes
 * only, so a save writes the rows that actually moved rather than every row in
 * the program.
 */
export function renumber(
  items: readonly OrderedItem[],
): Array<{ from: number; to: number }> {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ from: item.position, to: index + 1 }))
    .filter((move) => move.from !== move.to);
}

/**
 * The order after moving the item at `from` to `to`, both 1-based positions.
 *
 * Returns the new position list, already renumbered. Out-of-range moves are
 * clamped rather than rejected: this is called from drag handles and arrow
 * buttons, where asking to move the first item up is an ordinary thing to do
 * and should quietly be a no-op.
 */
export function moveItem<T extends OrderedItem>(items: readonly T[], from: number, to: number): T[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const fromIndex = sorted.findIndex((i) => i.position === from);
  if (fromIndex === -1) return sorted;

  const toIndex = Math.min(Math.max(to, 1), sorted.length) - 1;
  const [moved] = sorted.splice(fromIndex, 1);
  sorted.splice(toIndex, 0, moved);

  return sorted.map((item, index) => ({ ...item, position: index + 1 }));
}
