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
      instruments.push({
        number: "",
        label,
        // A backing track is not an instrument anybody plays, and the desk
        // treats it differently — no gain riding, no gate.
        kind: /karaoke|track/i.test(label) ? "track" : "instrument",
        instrumentId: i.instrumentId,
      });
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
