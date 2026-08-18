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

/** One bhajan of the night, and who has a mic on it. */
export type LiveSlotInput = {
  position: number;
  title: string;
  /** Whoever is singing it, with the cushion they have for the night. */
  lead: CushionPerson | null;
  /** The chorus mics for THIS bhajan, each with its own cushion. */
  chorus: readonly CushionPerson[];
};

export type LiveSlotPlan = {
  position: number;
  title: string;
  plan: LiveDeskPlan;
  /** Strips with somebody on them — the faders that are up for this bhajan. */
  openIds: Set<string>;
  /**
   * The strip carrying the LEAD singer, where one landed.
   *
   * Sailavan: with a lead and two chorus singers, three strips light up in
   * their cushion colours and "might get lost as to who is the lead". The
   * colours say which cushion, and nothing said which of them is singing the
   * bhajan.
   *
   * A set rather than one id because the honest answer can be none — a lead on
   * a cushion this desk has no channel for, or none rostered yet — and because
   * a desk with two strips of one colour could in principle carry them.
   */
  leadStripIds: Set<string>;
};

/**
 * The whole night, one desk per bhajan.
 *
 * Sailavan asked for all three bhajans in the one view, the way the programme
 * desk shows every song at once. The reason it is worth doing per bhajan rather
 * than once for the session is that the answer genuinely differs: the lead
 * changes every bhajan, and the CHORUS cushions belong to the bhajan rather
 * than to the night — the same singer may lead one on blue and chorus the next
 * on green. A single session-wide desk could show neither honestly.
 *
 * A lead who is also down on the chorus of their own bhajan appears once, as
 * the lead: they are one person holding one mic, and counting them twice would
 * read as a clash with themselves.
 */
export function planLiveDeskForSlots({
  strips,
  slots,
}: {
  strips: readonly LiveStrip[];
  slots: readonly LiveSlotInput[];
}): LiveSlotPlan[] {
  return slots.map((slot) => {
    const people: CushionPerson[] = [];
    const seen = new Set<string>();

    for (const person of [slot.lead, ...slot.chorus]) {
      if (!person || seen.has(person.singerId)) continue;
      seen.add(person.singerId);
      people.push(person);
    }

    const plan = planLiveDesk({ strips, people });
    const leadId = slot.lead?.singerId ?? null;

    return {
      position: slot.position,
      title: slot.title,
      plan,
      openIds: new Set(plan.strips.filter((a) => a.people.length > 0).map((a) => a.strip.id)),
      // Read back off the plan rather than guessed from the cushion, so a lead
      // the desk could not place simply has no strip — which is the truth.
      leadStripIds: new Set(
        leadId
          ? plan.strips
              .filter((a) => a.people.some((p) => p.singerId === leadId))
              .map((a) => a.strip.id)
          : [],
      ),
    };
  });
}
