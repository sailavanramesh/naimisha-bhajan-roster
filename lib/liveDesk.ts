/**
 * lib/liveDesk.ts — who is on which channel at a bhajan session.
 *
 * Pure. No Prisma, no I/O.
 *
 * NOBODY ALLOCATES ANYTHING HERE. A music programme has a person set channel by
 * channel, because a programme's mics move between songs. A Thursday does not:
 * a singer takes a cushion for the night, the cushions live on fixed channels,
 * and the desk therefore already knows who is on channel 1 the moment somebody
 * taps a blue dot. Sailavan: "the channel selection should be automatic based
 * on cushion colour aligning with the channels allocated by the sound desk
 * configuration."
 *
 * So this is a JOIN, not an editor, and its whole job is to be honest about the
 * two ways the join fails to be one-to-one:
 *
 *   - two people on one cushion — a clash, which is a real setup problem and
 *     shows as one, rather than one of them silently vanishing;
 *   - a cushion the desk has no channel for — the person is listed with no
 *     strip, which is the other half of the same problem.
 *
 * Guessing past either would produce a confident, wrong picture of the desk on
 * the one screen somebody is reading while the hall fills up.
 */

import type { MicColourValue } from "./micCushion";

export type LiveStrip = {
  id: string;
  /** As printed on the desk: "1", "13/14". */
  number: string;
  label: string;
  kind: string;
  colour: MicColourValue | null;
  mic: string | null;
  stereo: boolean;
};

export type CushionPerson = {
  singerId: string;
  name: string;
  cushion: MicColourValue | null;
};

export type StripAssignment = {
  strip: LiveStrip;
  /** Usually none or one. More than one is a clash — see `clash`. */
  people: CushionPerson[];
  /** Two or more people on this one strip. */
  clash: boolean;
};

export type LiveDeskPlan = {
  strips: StripAssignment[];
  /** People whose cushion is a colour no channel on this desk carries. */
  unplaced: CushionPerson[];
  /** People with no cushion set at all. Not a fault — just not answered yet. */
  noCushion: CushionPerson[];
  /** Is anything wrong: a clash, or somebody on a colour the desk lacks. */
  hasProblem: boolean;
};

/**
 * A cushion belongs to a MIC, so only a vocal strip can carry one.
 *
 * The tabla is on a fixed channel too and has no cushion; without this a desk
 * whose tabla strip happened to be coloured would swallow a singer.
 */
function carriesCushion(strip: LiveStrip): boolean {
  return strip.kind === "vocal" && strip.colour !== null;
}

/**
 * Lay the night's cushions over the desk.
 *
 * Where a colour has SEVERAL strips — a desk with two blues — people are spread
 * across them in order, one each, and anybody left over piles onto the last of
 * them as a clash. The common case is one strip per colour, where this reduces
 * to "everybody on that colour lands on that channel".
 *
 * Order is preserved throughout: strips in the order given (the desk's own),
 * people in the order given (the running order), so two devices reading the
 * same session draw the same picture.
 */
export function planLiveDesk({
  strips,
  people,
}: {
  strips: readonly LiveStrip[];
  people: readonly CushionPerson[];
}): LiveDeskPlan {
  const assigned = new Map<string, CushionPerson[]>(strips.map((s) => [s.id, []]));

  const byColour = new Map<MicColourValue, LiveStrip[]>();
  for (const strip of strips) {
    if (!carriesCushion(strip)) continue;
    const list = byColour.get(strip.colour!) ?? [];
    list.push(strip);
    byColour.set(strip.colour!, list);
  }

  const unplaced: CushionPerson[] = [];
  const noCushion: CushionPerson[] = [];

  /** People wanting each colour, in the order they were given. */
  const wanting = new Map<MicColourValue, CushionPerson[]>();
  for (const person of people) {
    if (!person.cushion) {
      noCushion.push(person);
      continue;
    }
    const list = wanting.get(person.cushion) ?? [];
    list.push(person);
    wanting.set(person.cushion, list);
  }

  for (const [colour, want] of wanting) {
    const available = byColour.get(colour) ?? [];
    if (available.length === 0) {
      unplaced.push(...want);
      continue;
    }
    want.forEach((person, i) => {
      // One each while there are strips, then everybody else onto the last —
      // which is what makes the overflow visible as a clash on one channel
      // rather than as a person quietly dropped.
      const strip = available[Math.min(i, available.length - 1)];
      assigned.get(strip.id)!.push(person);
    });
  }

  const out: StripAssignment[] = strips.map((strip) => {
    const on = assigned.get(strip.id)!;
    return { strip, people: on, clash: on.length > 1 };
  });

  return {
    strips: out,
    unplaced,
    noCushion,
    hasProblem: unplaced.length > 0 || out.some((s) => s.clash),
  };
}

/** What to write on a strip: who is on it, joined, or nothing. */
export function stripWho(assignment: StripAssignment): string | null {
  if (assignment.people.length === 0) return null;
  return assignment.people.map((p) => p.name).join(" + ");
}
