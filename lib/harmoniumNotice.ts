/**
 * lib/harmoniumNotice.ts — telling the harmonium players what to expect.
 *
 * Pure. No Prisma, no I/O.
 *
 * The harmonium player's job needs two facts per bhajan and neither is useful
 * without the other: WHICH bhajan, and AT WHAT SHRUTI. A roster with the
 * singers filled in tells them nothing they can practise from, so they are not
 * told anything until every row has both.
 *
 * After that they are told about CHANGES, one bhajan at a time, because at that
 * point they have already prepared and what they need is the difference — not
 * the whole set again with one line moved.
 */

/** One row of a session, as the harmonium reads it. */
export type HarmoniumLine = {
  position: number;
  bhajan: string;
  pitch: string;
};

/**
 * Everything the harmonium needs, or nothing.
 *
 * A session counts as ready when it has at least one row and EVERY row names a
 * bhajan and a confirmed pitch. Partial is not useful: "three of the four are
 * decided" is a message that asks the reader to keep checking, which is the
 * thing this is supposed to replace.
 */
export function isReadyForHarmonium(
  slots: readonly { bhajan: string | null; pitch: string | null }[],
): boolean {
  if (slots.length === 0) return false;
  return slots.every(
    (s) => (s.bhajan ?? "").trim().length > 0 && (s.pitch ?? "").trim().length > 0,
  );
}

/** The session as a comparable, sendable list. Ordered, trimmed, no nulls. */
export function harmoniumLines(
  slots: readonly { position: number; bhajan: string | null; pitch: string | null }[],
): HarmoniumLine[] {
  return slots
    .map((s) => ({
      position: s.position,
      bhajan: (s.bhajan ?? "").trim(),
      pitch: (s.pitch ?? "").trim(),
    }))
    .sort((a, b) => a.position - b.position);
}

export type LineChange =
  | { kind: "added"; position: number; after: HarmoniumLine }
  | { kind: "removed"; position: number; before: HarmoniumLine }
  | { kind: "bhajan"; position: number; before: HarmoniumLine; after: HarmoniumLine }
  | { kind: "pitch"; position: number; before: HarmoniumLine; after: HarmoniumLine }
  | { kind: "both"; position: number; before: HarmoniumLine; after: HarmoniumLine };

/**
 * What changed between what they were told and what is true now.
 *
 * By POSITION, which is what "the third bhajan" means to everybody in the room.
 * The four kinds are kept apart because they read differently and the reader
 * only cares about one of them: "Ganesha Sharanam is now at 2 Pancham / D" is
 * actionable, and "slot 3 changed" is not.
 *
 * A row whose bhajan AND pitch both moved is one change, not two. It is one
 * edit as far as anybody in the hall is concerned.
 */
export function harmoniumChanges(
  before: readonly HarmoniumLine[],
  after: readonly HarmoniumLine[],
): LineChange[] {
  const was = new Map(before.map((l) => [l.position, l]));
  const now = new Map(after.map((l) => [l.position, l]));
  const changes: LineChange[] = [];

  for (const [position, line] of now) {
    const old = was.get(position);
    if (!old) {
      changes.push({ kind: "added", position, after: line });
      continue;
    }
    const bhajanMoved = old.bhajan !== line.bhajan;
    const pitchMoved = old.pitch !== line.pitch;
    if (bhajanMoved && pitchMoved) {
      changes.push({ kind: "both", position, before: old, after: line });
    } else if (bhajanMoved) {
      changes.push({ kind: "bhajan", position, before: old, after: line });
    } else if (pitchMoved) {
      changes.push({ kind: "pitch", position, before: old, after: line });
    }
  }

  for (const [position, line] of was) {
    if (!now.has(position)) changes.push({ kind: "removed", position, before: line });
  }

  return changes.sort((a, b) => a.position - b.position);
}

/**
 * One change, in a sentence.
 *
 * Names the bhajan rather than the slot number wherever it can, because that is
 * how the reader holds the set in their head. The number is there too, for the
 * case where two rows carry the same bhajan.
 */
export function describeChange(change: LineChange): string {
  const at = `#${change.position}`;
  switch (change.kind) {
    case "added":
      return `${at} added: ${change.after.bhajan} at ${change.after.pitch}`;
    case "removed":
      return `${at} removed: ${change.before.bhajan}`;
    case "bhajan":
      return `${at} is now ${change.after.bhajan} at ${change.after.pitch}, not ${change.before.bhajan}`;
    case "pitch":
      return `${change.after.bhajan} ${at} is now at ${change.after.pitch}, not ${change.before.pitch}`;
    case "both":
      return `${at} is now ${change.after.bhajan} at ${change.after.pitch}, not ${change.before.bhajan} at ${change.before.pitch}`;
  }
}

export type HarmoniumDecision =
  | { send: "nothing"; why: "not ready" | "unchanged" }
  | { send: "summary"; lines: HarmoniumLine[] }
  | { send: "changes"; changes: LineChange[]; lines: HarmoniumLine[] };

/**
 * Whether to say anything, and what.
 *
 * The whole state machine, with no database in it, because the interesting part
 * is the three-way decision and not the reading of rows.
 *
 * Before the summary has gone, COMPLETENESS is the gate — nothing is sent about
 * a half-decided session. After it has gone, the gate is DIFFERENCE, and
 * completeness stops mattering: somebody clearing a shruti at six o'clock is
 * exactly what the harmonium needs to hear about, and re-testing readiness
 * would swallow precisely that message.
 */
export function decideHarmoniumNotice(
  sent: readonly HarmoniumLine[] | null,
  current: readonly HarmoniumLine[],
): HarmoniumDecision {
  if (!sent) {
    return isReadyForHarmonium(current)
      ? { send: "summary", lines: [...current] }
      : { send: "nothing", why: "not ready" };
  }

  const changes = harmoniumChanges(sent, current);
  if (changes.length === 0) return { send: "nothing", why: "unchanged" };
  return { send: "changes", changes, lines: [...current] };
}

export type Notification = {
  title: string;
  body: string;
  url: string;
  tag: string;
  alert: boolean;
};

/**
 * "Thursday's bhajans and shrutis are set."
 *
 * The whole set, because this is the first they have heard of it and the set is
 * what they will practise from. Alerting: it is the message that says they can
 * start, and it only ever arrives once per session.
 */
export function harmoniumReadyNotification(input: {
  sessionId: string;
  dateLabel: string;
  lines: readonly HarmoniumLine[];
}): Notification {
  const body = input.lines.map((l) => `${l.position}. ${l.bhajan} — ${l.pitch}`).join("\n");

  return {
    title: `${input.dateLabel}: bhajans and shrutis are set`,
    body,
    url: `/roster/${input.sessionId}`,
    // Keyed to the session so a later change collapses this one rather than
    // stacking beside it — an unread pair that disagree is worse than either.
    tag: `harmonium-${input.sessionId}`,
    alert: true,
  };
}

/**
 * "Thursday: one bhajan has changed."
 *
 * One notification however many rows moved in a single edit, listing each. Two
 * buzzes for one save is how people learn to swipe notifications away without
 * reading them.
 *
 * Alerting, deliberately. They have already prepared, so a change is exactly
 * the thing they must not miss.
 */
export function harmoniumChangeNotification(input: {
  sessionId: string;
  dateLabel: string;
  changes: readonly LineChange[];
}): Notification {
  const n = input.changes.length;
  return {
    title: `${input.dateLabel}: ${n === 1 ? "a bhajan has changed" : `${n} bhajans have changed`}`,
    body: input.changes.map(describeChange).join("\n"),
    url: `/roster/${input.sessionId}`,
    tag: `harmonium-${input.sessionId}`,
    alert: true,
  };
}
