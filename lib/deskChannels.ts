/**
 * lib/deskChannels.ts — channels, and which of them should be open.
 *
 * Pure. No Prisma, no I/O.
 *
 * The whole reason this is worth building rather than keeping on paper: the app
 * already knows who sings each item and what plays on it, so it can PROPOSE the
 * channel list and the open set instead of asking somebody to type both again.
 * Everything here is a proposal — the desk corrects it, and nothing is applied
 * without somebody pressing something.
 */

export type ChannelKind = "vocal" | "instrument" | "track" | "spare";

export type ProposedChannel = {
  /** The strip as it will be numbered. A string: desks label them "1", "13/14". */
  number: string;
  label: string;
  kind: ChannelKind;
  singerId?: string | null;
  person?: string | null;
  instrumentId?: string | null;
  /**
   * The cushion on this strip, where the strip has a fixed one. Absent from
   * anything proposed from a programme's people — a cushion is a fact about
   * the desk, and `proposeChannels` is reading the running order, which knows
   * nothing about the hardware.
   */
  colour?: CushionColour | null;
  /** A mono/stereo pair, whose `number` is the first of the two. */
  stereo?: boolean;
};

export type ItemPeople = {
  itemId: string;
  performers: Array<{ singerId?: string | null; name?: string | null }>;
  instruments: Array<{ instrumentId: string; singerId?: string | null; person?: string | null }>;
};

/**
 * A channel list proposed from everybody who appears in a programme.
 *
 * Vocals first and instruments after, because that is the order a desk is
 * patched and the order the strips run. Within vocals, the order somebody first
 * appears in the running order — the person who opens the programme is channel
 * 1, which is what anybody would expect standing at the desk.
 *
 * One channel per PERSON, not per item: a singer who sings three items uses the
 * same mic all evening. One channel per INSTRUMENT for the same reason — the
 * tabla is one tabla however many items it plays on.
 */
export function proposeChannels(
  items: readonly ItemPeople[],
  names: {
    singerName: (id: string) => string | undefined;
    instrumentName: (id: string) => string | undefined;
    /** How many strips this instrument needs. Absent means one, as it was. */
    instrumentChannels?: (id: string) => number | undefined;
  },
): ProposedChannel[] {
  const vocals: ProposedChannel[] = [];
  const seenSinger = new Set<string>();
  const seenName = new Set<string>();

  for (const item of items) {
    for (const p of item.performers) {
      if (p.singerId) {
        if (seenSinger.has(p.singerId)) continue;
        seenSinger.add(p.singerId);
        vocals.push({
          number: "",
          label: names.singerName(p.singerId) ?? "Vocal",
          kind: "vocal",
          singerId: p.singerId,
        });
        continue;
      }
      const name = (p.name ?? "").trim();
      if (!name || seenName.has(name.toLowerCase())) continue;
      seenName.add(name.toLowerCase());
      // A group — "Psais", "All girls" — is a channel too: it is a mic, or
      // several, and the desk needs a strip for it either way.
      vocals.push({ number: "", label: name, kind: "vocal", person: name });
    }
  }

  const instruments: ProposedChannel[] = [];
  const seenInstrument = new Set<string>();

  for (const item of items) {
    for (const i of item.instruments) {
      if (seenInstrument.has(i.instrumentId)) continue;
      seenInstrument.add(i.instrumentId);
      const label = names.instrumentName(i.instrumentId) ?? "Instrument";
      // A backing track is not an instrument anybody plays, and the desk
      // treats it differently — no gain riding, no gate.
      const kind: ChannelKind = /karaoke|track/i.test(label) ? "track" : "instrument";

      /*
       * ONE STRIP PER MIC, not one per instrument.
       *
       * A two-headed drum is miked on each head and a stereo keyboard takes a
       * pair, so an instrument says how many channels it needs (Instrument.
       * channels, set in /admin). Proposing one strip for a mridangam left
       * somebody to discover on the night that half of it was not going
       * through the desk.
       *
       * Numbered in the label only when there is more than one, because
       * "Tabla 1" with no Tabla 2 anywhere is a question rather than a fact.
       */
      const count = Math.max(1, Math.min(names.instrumentChannels?.(i.instrumentId) ?? 1, 8));
      for (let n = 1; n <= count; n++) {
        instruments.push({
          number: "",
          label: count > 1 ? `${label} ${n}` : label,
          kind,
          instrumentId: i.instrumentId,
        });
      }
    }
  }

  return [...vocals, ...instruments].map((channel, index) => ({
    ...channel,
    number: String(index + 1),
  }));
}

export type Channel = {
  id: string;
  singerId?: string | null;
  person?: string | null;
  instrumentId?: string | null;
};

/**
 * Which channels an item needs open, proposed from who is actually on it.
 *
 * A channel is open when the person or the instrument it carries appears on
 * that item. Everything else is closed, which is the useful half: a read
 * passage wants one mic open and the rest down, and that is the change most
 * easily fumbled live.
 *
 * A channel carrying nobody — a spare, an unassigned strip — is never proposed
 * open. There is nothing on it to hear.
 */
export function proposeOpenChannels(item: ItemPeople, channels: readonly Channel[]): Set<string> {
  const singers = new Set(
    item.performers.map((p) => p.singerId).filter((id): id is string => Boolean(id)),
  );
  const names = new Set(
    item.performers
      .map((p) => (p.name ?? "").trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
  const instruments = new Set(item.instruments.map((i) => i.instrumentId));

  const open = new Set<string>();
  for (const channel of channels) {
    if (channel.singerId && singers.has(channel.singerId)) open.add(channel.id);
    else if (channel.person && names.has(channel.person.trim().toLowerCase())) open.add(channel.id);
    else if (channel.instrumentId && instruments.has(channel.instrumentId)) open.add(channel.id);
  }
  return open;
}

/**
 * Channels in the order a desk reads them.
 *
 * By number, and numerically where the numbers are numbers: "10" must come
 * after "9", which a plain string sort gets wrong. Anything that is not a
 * number — "13/14" on a stereo pair — sorts after the plain ones by its text,
 * which keeps it stable without pretending to understand it.
 */
export function sortChannels<T extends { number: string }>(channels: readonly T[]): T[] {
  return [...channels].sort((a, b) => {
    const na = Number(a.number);
    const nb = Number(b.number);
    const aNum = Number.isFinite(na);
    const bNum = Number.isFinite(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.number.localeCompare(b.number);
  });
}

/** "3 · Tabla (Sriraag)" — how a channel reads on a sheet. */
export function channelLabel(channel: {
  number: string;
  label: string;
  who?: string | null;
}): string {
  const who = (channel.who ?? "").trim();
  return `${channel.number} · ${channel.label}${who && who !== channel.label ? ` (${who})` : ""}`;
}

/**
 * Which item the desk view is showing, from the position stored on the session.
 *
 * A position rather than an id is what is stored (see Session.
 * currentItemPosition), so this is where that choice is paid for: the stored
 * number may name an item that has since been deleted, or one that never
 * existed, and the desk must still show something.
 *
 *   - No items at all → null. The caller says "nothing in the running order".
 *   - Nothing stored yet → the FIRST item. A desk view opened before anybody
 *     has pressed anything should show the programme about to start, not a
 *     blank screen asking to be told where it is.
 *   - A position that exists → that item.
 *   - A position that does not → the nearest one that does, which for a deleted
 *     item is whatever moved up into its place, and for a number past the end is
 *     the last item. Never null while items exist.
 */
export function currentItemOf<T extends { position: number }>(
  items: readonly T[],
  stored: number | null | undefined,
): T | null {
  if (items.length === 0) return null;

  const ordered = [...items].sort((a, b) => a.position - b.position);
  if (stored === null || stored === undefined) return ordered[0];

  const exact = ordered.find((i) => i.position === stored);
  if (exact) return exact;

  // The first item at or after the missing position, else the last one.
  return ordered.find((i) => i.position > stored) ?? ordered[ordered.length - 1];
}

/**
 * The position one step forward or back from where the desk is now.
 *
 * Steps through the items that EXIST rather than doing arithmetic on the stored
 * number, so a gap left by a deleted item is not a press that appears to do
 * nothing. Stops at both ends rather than wrapping: a programme is not a loop,
 * and Next on the last item bouncing back to the first mid-performance would be
 * a genuinely bad moment.
 *
 * Returns null when there is nowhere to go, which is what disables the button.
 */
export function stepItem<T extends { position: number }>(
  items: readonly T[],
  stored: number | null | undefined,
  delta: 1 | -1,
): number | null {
  const here = currentItemOf(items, stored);
  if (!here) return null;

  const ordered = [...items].sort((a, b) => a.position - b.position);
  const at = ordered.findIndex((i) => i.position === here.position);
  const next = ordered[at + delta];
  return next ? next.position : null;
}

/**
 * How a strip reads when two people are sharing the mic.
 *
 * "Ashwin + Sriraag". One name when only one is set, and nothing when neither
 * is — so a shared mic is written the same way everywhere, and adding the second
 * person nowhere changes what a single-occupant strip looks like.
 */
export function sharedName(
  first: string | null | undefined,
  second: string | null | undefined,
): string | null {
  const a = (first ?? "").trim();
  const b = (second ?? "").trim();
  if (a && b) return `${a} + ${b}`;
  return a || b || null;
}

/**
 * A default strip list for a desk with no channels yet.
 *
 * Numbers only, unlabelled. The centre's Yamaha MG20XU has twenty inputs, but
 * how they are patched is the sound person's business and not something to
 * guess at — an empty labelled strip is an invitation to correct it, whereas a
 * wrong label is something to be believed by mistake.
 */
export function blankStrips(count: number): ProposedChannel[] {
  return Array.from({ length: Math.max(0, Math.min(count, 64)) }, (_, i) => ({
    number: String(i + 1),
    label: `Channel ${i + 1}`,
    kind: "spare" as ChannelKind,
  }));
}

export type CushionColour = "blue" | "grey" | "green" | "orange" | "pink";

/**
 * The centre's own allocation: which cushion is on which channel.
 *
 * Sailavan, 2026-08-17 — "mic cushions are always fixed channels". They do not
 * move week to week, so the desk knows them and a programme copies them, rather
 * than somebody re-deciding on the night.
 *
 * Channel 4 is deliberately a mic with NO cushion, and it is listed rather than
 * omitted so the gap reads as a fact about the desk instead of a strip somebody
 * forgot. Channel 9 is not a cushion at all — it is the tabla, which is fixed to
 * its channel for the same reason the cushions are.
 *
 * A starting point, not a rule: every strip is editable afterwards by anybody
 * with `manageDesks`, which is the whole point of the grant.
 */
export const FIXED_STRIPS: ReadonlyArray<{
  number: number;
  label: string;
  kind: ChannelKind;
  colour: CushionColour | null;
}> = [
  { number: 1, label: "Blue", kind: "vocal", colour: "blue" },
  { number: 2, label: "Grey", kind: "vocal", colour: "grey" },
  { number: 3, label: "Green", kind: "vocal", colour: "green" },
  { number: 4, label: "No cushion", kind: "vocal", colour: null },
  { number: 5, label: "Orange", kind: "vocal", colour: "orange" },
  { number: 6, label: "Pink", kind: "vocal", colour: "pink" },
  { number: 9, label: "Tabla", kind: "instrument", colour: null },
];

/**
 * How many inputs a desk has before its remaining ones pair up.
 *
 * Twelve, from the MG20XU the centre actually mixes on. Yamaha's own
 * specification calls it "Mono [MIC/LINE]: 12; Mono/Stereo [MIC/LINE]: 4" — so
 * a twenty-input desk is SIXTEEN strips: 1 to 12 on their own, then 13/14,
 * 15/16, 17/18 and 19/20.
 */
export const MONO_INPUTS = 12;

/**
 * A new desk's strips: the fixed allocation, then blanks up to the input count.
 *
 * The cushions and the tabla land on the channels they are actually on, and
 * everything else arrives numbered and unlabelled as before. A desk smaller than
 * the fixed list simply gets the part of it that fits.
 *
 * `inputs` is what the desk is NAMED for — a "20-channel" mixer — which is not
 * how many strips it has. Everything past `monoInputs` is a pair, so twenty
 * inputs make sixteen strips. Getting this wrong the other way would put four
 * faders on the sheet that do not exist on the desk.
 */
export function defaultStrips(
  inputs: number,
  { monoInputs = MONO_INPUTS }: { monoInputs?: number } = {},
): ProposedChannel[] {
  const total = Math.max(0, Math.min(inputs, 64));
  const fixed = new Map(FIXED_STRIPS.map((s) => [s.number, s]));
  const out: ProposedChannel[] = [];

  for (let n = 1; n <= total; ) {
    // Past the mono inputs the strips pair up — but never leave a half pair at
    // the end of an odd desk, which would be a fader with one side of nothing.
    const stereo = n > monoInputs && n + 1 <= total;
    const known = fixed.get(n);

    out.push({
      number: String(n),
      label: known?.label ?? (stereo ? `Channel ${n}/${n + 1}` : `Channel ${n}`),
      kind: known?.kind ?? ("spare" as ChannelKind),
      colour: known?.colour ?? null,
      stereo,
    });

    n += stereo ? 2 : 1;
  }

  return out;
}

/**
 * How a strip is numbered when it is written down: "13/14", or just "13".
 *
 * A stereo strip is ONE fader carrying two inputs, and the desk prints both
 * numbers on it, so that is what every view shows. When the same strip is being
 * used as a single mono channel — which is a decision per programme, since it
 * depends on what is plugged in that night — it is written as the one number it
 * is behaving as.
 */
export function stripNumber(number: string, stereo: boolean): string {
  if (!stereo) return number;
  const n = Number(number);
  return Number.isFinite(n) ? `${n}/${n + 1}` : number;
}

/**
 * Strips whose input has already been claimed by a stereo pair below them.
 *
 * A desk cannot say "19/20" on one strip and "20" on the next; input 20 is one
 * socket, and two strips claiming it is a desk that does not exist. Pairing now
 * swallows the strip above it, so this cannot be created any more — but it WAS
 * created, by the bug that let 19 and 20 each be ticked into overlapping pairs,
 * and Sailavan is looking at the leftover on a real desk right now.
 *
 * So: name the condition, and let the page offer the repair rather than leaving
 * somebody to work out that they must untick two boxes in the right order. It
 * returns the numbers of the strips that should not be there.
 *
 * Pure, and cheap enough to run on every render of the desk list.
 */
export function overlappedStrips(
  strips: ReadonlyArray<{ number: number; stereo: boolean }>,
): number[] {
  const claimed = new Set<number>();
  for (const s of strips) if (s.stereo) claimed.add(s.number + 1);
  return strips.filter((s) => claimed.has(s.number)).map((s) => s.number);
}

/**
 * A name shortened to fit a channel tile.
 *
 * The desk view puts twelve or more strips across a screen, so a tile is about
 * three characters wide and the full name was never going to fit. Three letters
 * of a first name is what a sound person writes on tape anyway.
 *
 * A multi-word name gives its initials — "All girls" reads better as "AG" than
 * as "All" — up to three of them, which is how "Sri Sai Ram" becomes "SSR".
 * A single word is simply cut, keeping its capital: "Prasanna" → "Pra".
 */
export function shortName(name: string | null | undefined): string {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return "";

  const words = clean.split(" ").filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }
  return clean.slice(0, 3);
}

/**
 * Who or what is on a strip for one item.
 *
 * The per-item override wins where there is one, and there usually is not. A
 * mic does not belong to one person all evening: the strip that is a singer on
 * song 1 may be the mridangam on song 4, and the desk view must say the one that
 * is true now rather than the one that is true most of the time.
 *
 * The three answers are checked in the order they are specific — a named
 * instrument, then a roster singer, then a name typed in — and the channel's own
 * occupant is the fallback, which is the ordinary case.
 */
export function occupantFor(
  channel: { who?: string | null },
  override?: {
    instrumentName?: string | null;
    singerName?: string | null;
    person?: string | null;
  } | null,
): string | null {
  const from = (v?: string | null) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };

  return (
    from(override?.instrumentName) ??
    from(override?.singerName) ??
    from(override?.person) ??
    from(channel.who)
  );
}
