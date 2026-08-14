/**
 * lib/micCushion.ts — mic cushion colours for the sound desk.
 *
 * Pure. No Prisma import.
 *
 * A cushion belongs to a SINGER within a SESSION, not to a slot: a singer has
 * one mic for the night, so if they sing twice the cushion follows them.
 *
 * The CHORUS mic is the exception, and it is why `green` exists here. That
 * cushion is stored per ROW (SessionSlot.chorusCushion) rather than per person,
 * because the chorus mic is a different mic — the same singer may lead one
 * bhajan on blue and chorus another on green, and a per-person key cannot hold
 * both facts at once.
 */

/** The four lead cushions on the desk. Unchanged — green is not one of them. */
export const MIC_COLOURS = [
  { value: "blue", label: "Blue", dot: "#3B7DD8" },
  { value: "grey", label: "Grey", dot: "#8B9099" },
  { value: "orange", label: "Orange", dot: "#E08A2E" },
  { value: "pink", label: "Pink", dot: "#DC6FA4" },
] as const;

/** The chorus cushion, which is the fifth colour and only offered there. */
export const CHORUS_ONLY_COLOUR = { value: "green", label: "Green", dot: "#4E9A57" } as const;

/**
 * What the chorus column offers: the same four, plus green.
 *
 * Sailavan's words, and the reason this is a second list rather than a longer
 * first one — the lead mics are four physical cushions, and adding a fifth to
 * that cycle would offer the desk a cushion it does not have.
 */
export const CHORUS_COLOURS = [...MIC_COLOURS, CHORUS_ONLY_COLOUR] as const;

export type MicColourValue = (typeof CHORUS_COLOURS)[number]["value"];
/** The subset a LEAD mic may be. */
export type LeadColourValue = (typeof MIC_COLOURS)[number]["value"];

const VALUES = new Set<string>(MIC_COLOURS.map((c) => c.value));
const CHORUS_VALUES = new Set<string>(CHORUS_COLOURS.map((c) => c.value));

/** A lead cushion. Green is deliberately NOT one — see CHORUS_COLOURS. */
export function isMicColour(value: unknown): value is LeadColourValue {
  return typeof value === "string" && VALUES.has(value);
}

export function isChorusColour(value: unknown): value is MicColourValue {
  return typeof value === "string" && CHORUS_VALUES.has(value);
}

/** Null is "no cushion", which is a state a user can deliberately choose. */
export function micColourLabel(colour: MicColourValue | null): string {
  if (colour === null) return "No cushion";
  return CHORUS_COLOURS.find((c) => c.value === colour)?.label ?? "No cushion";
}

export function micColourDot(colour: MicColourValue | null): string | null {
  if (colour === null) return null;
  return CHORUS_COLOURS.find((c) => c.value === colour)?.dot ?? null;
}

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

/** Cycle through the palette, ending on "no cushion". Used by the tap target. */
export function nextColour(colour: MicColourValue | null): MicColourValue | null {
  if (colour === null) return MIC_COLOURS[0].value;
  const i = MIC_COLOURS.findIndex((c) => c.value === colour);
  if (i < 0 || i === MIC_COLOURS.length - 1) return null;
  return MIC_COLOURS[i + 1].value;
}
