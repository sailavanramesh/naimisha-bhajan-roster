/**
 * lib/micCushion.ts — mic cushion colours for the sound desk.
 *
 * Pure. No Prisma import.
 *
 * A cushion belongs to a SINGER within a SESSION, not to a slot: a singer has
 * one mic for the night, so if they sing twice the cushion follows them.
 *
 * The CHORUS cushions are stored per BHAJAN (SessionSlotChorus) rather than per
 * person, because a chorus mic is a different mic — the same singer may lead
 * one bhajan on blue and chorus another on green, and a per-person key cannot
 * hold both facts at once. They are the same CUSHIONS either way, though: what
 * a desk owns does not depend on who is holding the mic, which is why both
 * pickers read one list from `deskCushions`.
 */

/**
 * Every cushion the centre could own — the CATALOGUE, not an offer.
 *
 * This is what a stored colour is rendered from, and what the desk admin
 * offers when pinning a cushion to a strip. It is deliberately NOT what a
 * roster picker shows: see `deskCushions`.
 *
 * Order here is only the order the desk admin lists them in; the four
 * originals stay first so nothing about the existing cushions moves under
 * somebody's thumb.
 */
export const ALL_CUSHIONS = [
  { value: "blue", label: "Blue", dot: "#3B7DD8" },
  { value: "grey", label: "Grey", dot: "#8B9099" },
  { value: "orange", label: "Orange", dot: "#E08A2E" },
  { value: "pink", label: "Pink", dot: "#DC6FA4" },
  { value: "green", label: "Green", dot: "#4E9A57" },
  { value: "black", label: "Black", dot: "#2F3033" },
  { value: "yellow", label: "Yellow", dot: "#D9A81F" },
  { value: "maroon", label: "Maroon", dot: "#8C3242" },
] as const;

export type MicColourValue = (typeof ALL_CUSHIONS)[number]["value"];
export type Cushion = { value: MicColourValue; label: string; dot: string };

const BY_VALUE = new Map<string, Cushion>(ALL_CUSHIONS.map((c) => [c.value, { ...c }]));

/**
 * The cushions a desk actually has, in the order its channels are numbered.
 *
 * THIS is what both pickers offer, and it is the whole point. Sailavan,
 * 2026-08-19: "you pick the cushions that apply to a channel on the sound desk,
 * and those options show up under lead singer and chorus singer in the same
 * order as the channel ascribing was done" — and "if a cushion colour is not
 * ascribed to a channel set for a certain session, then it can't be picked".
 *
 * Before this, three hardcoded lists disagreed with each other and with the
 * hardware. The lead picker refused green on the grounds that the lead mics do
 * not have it, while the centre's desk had green on Lead vocal 3 AND Lead vocal
 * 7; and both pickers offered black, yellow and maroon, which were on no strip
 * at all. The rule the old code stated was right. It was just enforced against
 * a list nobody could keep in step with the desk, so it drifted the moment the
 * desk changed. Deriving cannot drift.
 *
 * Lead and chorus get the SAME list. Green stops being a special case: it is
 * offered wherever the desk has it, like every other colour.
 *
 * Duplicates collapse to their FIRST channel — the centre's green is on two
 * strips and should appear once, where it first appears on the desk.
 */
export function deskCushions(
  channels: ReadonlyArray<{ number: number; colour: string | null }>,
): Cushion[] {
  const seen = new Set<string>();
  const out: Cushion[] = [];

  for (const ch of [...channels].sort((a, b) => a.number - b.number)) {
    if (!ch.colour || seen.has(ch.colour)) continue;
    const cushion = BY_VALUE.get(ch.colour);
    if (!cushion) continue;
    seen.add(ch.colour);
    out.push(cushion);
  }
  return out;
}

const VALUES = new Set<string>(ALL_CUSHIONS.map((c) => c.value));

/** Is this one of the cushions that exist at all? Bounds what may be stored. */
export function isMicColour(value: unknown): value is MicColourValue {
  return typeof value === "string" && VALUES.has(value);
}

/** Null is "no cushion", which is a state a user can deliberately choose. */
export function micColourLabel(colour: MicColourValue | null): string {
  if (colour === null) return "No cushion";
  return BY_VALUE.get(colour)?.label ?? "No cushion";
}

export function micColourDot(colour: MicColourValue | null): string | null {
  if (colour === null) return null;
  return BY_VALUE.get(colour)?.dot ?? null;
}

/**
 * One person on one chorus mic for one bhajan, as every view reads it.
 *
 * A bhajan may have several — the desk puts more than one person on the chorus
 * mics and each has its own cushion — so this travels as a list, ordered by
 * `position` so every device reads them in the same order.
 */
export type ChorusMic = {
  singerId: string;
  name: string;
  cushion: MicColourValue | null;
  position: number;
};

/** What the client currently believes, per singer. */
export type CushionEntry = {
  colour: MicColourValue | null;
  /** Server timestamp in epoch ms. The ordering key for every merge. */
  updatedAt: number;
  setByName?: string | null;
};

export type PolledCushion = CushionEntry & { singerId: string };

/**
 * Fold a poll response into what the client already holds.
 *
 * This exists because of one specific race. A user taps pink at t=0. A poll
 * request that left the browser at t=-1, before the tap, returns at t=+0.2
 * carrying the OLD colour. Applied naively it flips the dot back under the
 * user's finger, and the next poll flips it forward again.
 *
 * Two rules prevent that:
 *
 *   1. A singer with a write in flight (`pending`) is never touched by a poll.
 *      The write's own response is authoritative for that singer.
 *   2. Otherwise a polled entry is applied only if it is strictly NEWER than
 *      what is already held. Equal timestamps change nothing, so a repeated
 *      poll is a no-op.
 *
 * Rule 2 alone would still be correct for other people's changes; rule 1 covers
 * the window where the server has not yet been told about ours.
 *
 * Entries absent from `polled` are left alone rather than cleared — removal is
 * carried as an explicit `colour: null` row (see the schema comment), so a
 * missing entry means "no news", never "deleted".
 */
export function mergeCushions(
  current: ReadonlyMap<string, CushionEntry>,
  polled: readonly PolledCushion[],
  pending: ReadonlySet<string> = new Set(),
): Map<string, CushionEntry> {
  const next = new Map(current);

  for (const entry of polled) {
    if (pending.has(entry.singerId)) continue;

    const held = next.get(entry.singerId);
    if (held && held.updatedAt >= entry.updatedAt) continue;

    next.set(entry.singerId, {
      colour: entry.colour,
      updatedAt: entry.updatedAt,
      setByName: entry.setByName ?? null,
    });
  }

  return next;
}

/**
 * Apply the authoritative result of our own write.
 *
 * Unconditional on purpose: this is the server's answer to a write we just
 * made, so it supersedes whatever a concurrent poll may have written, and it
 * is what releases the singer from `pending`.
 */
export function applyOwnWrite(
  current: ReadonlyMap<string, CushionEntry>,
  singerId: string,
  entry: CushionEntry,
): Map<string, CushionEntry> {
  const next = new Map(current);
  next.set(singerId, entry);
  return next;
}

/**
 * Cycle through this desk's cushions, ending on "no cushion".
 *
 * Takes the list rather than closing over a global one, because what comes
 * next depends on which desk the session is on.
 *
 * A colour the desk no longer offers cycles to "no cushion" rather than to the
 * front. It is being cleared on the way past, which is the honest outcome for a
 * cushion that is no longer on the hardware.
 */
export function nextColour(
  colour: MicColourValue | null,
  cushions: ReadonlyArray<Cushion>,
): MicColourValue | null {
  if (cushions.length === 0) return null;
  if (colour === null) return cushions[0].value;
  const i = cushions.findIndex((c) => c.value === colour);
  if (i < 0 || i === cushions.length - 1) return null;
  return cushions[i + 1].value;
}
