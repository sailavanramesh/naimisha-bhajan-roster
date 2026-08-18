import { describe, it, expect } from "vitest";
import {
  planLiveDesk,
  planLiveDeskForSlots,
  stripWho,
  type CushionPerson,
  type LiveStrip,
} from "@/lib/liveDesk";

const strip = (n: number, label: string, colour: LiveStrip["colour"], kind = "vocal"): LiveStrip => ({
  id: `c${n}`,
  number: String(n),
  label,
  kind,
  colour,
  mic: null,
  stereo: false,
});

/** The centre's own allocation, as lib/deskChannels FIXED_STRIPS describes it. */
const DESK: LiveStrip[] = [
  strip(1, "Blue", "blue"),
  strip(2, "Grey", "grey"),
  strip(3, "Green", "green"),
  strip(4, "No cushion", null),
  strip(5, "Orange", "orange"),
  strip(6, "Pink", "pink"),
  strip(9, "Tabla", null, "instrument"),
];

const person = (id: string, name: string, cushion: CushionPerson["cushion"]): CushionPerson => ({
  singerId: id,
  name,
  cushion,
});

describe("planLiveDesk", () => {
  it("puts each singer on the channel their cushion is on", () => {
    const plan = planLiveDesk({
      strips: DESK,
      people: [person("s1", "Ashwin", "blue"), person("s2", "Pavitra", "orange")],
    });

    const on = (n: string) => plan.strips.find((s) => s.strip.number === n)!;
    expect(on("1").people.map((p) => p.name)).toEqual(["Ashwin"]);
    expect(on("5").people.map((p) => p.name)).toEqual(["Pavitra"]);
    expect(on("2").people).toEqual([]);
    expect(plan.hasProblem).toBe(false);
  });

  /*
   * The first of the two honest failures. Two people on one cushion is a real
   * setup problem — the desk has one fader for them — so it shows as one rather
   * than quietly dropping whoever came second.
   */
  it("marks two people on one cushion as a clash, keeping both", () => {
    const plan = planLiveDesk({
      strips: DESK,
      people: [person("s1", "Ashwin", "blue"), person("s2", "Prithvi", "blue")],
    });

    const blue = plan.strips.find((s) => s.strip.number === "1")!;
    expect(blue.people.map((p) => p.name)).toEqual(["Ashwin", "Prithvi"]);
    expect(blue.clash).toBe(true);
    expect(plan.hasProblem).toBe(true);
    expect(stripWho(blue)).toBe("Ashwin + Prithvi");
  });

  it("lists somebody whose colour the desk has no channel for", () => {
    const plan = planLiveDesk({
      strips: DESK,
      people: [person("s1", "Jothsna", "maroon")],
    });

    expect(plan.unplaced.map((p) => p.name)).toEqual(["Jothsna"]);
    expect(plan.strips.every((s) => s.people.length === 0)).toBe(true);
    expect(plan.hasProblem).toBe(true);
  });

  /*
   * Not a fault. Most of a session is people who have not been given a cushion
   * yet, and calling that a problem would light the screen up every week.
   */
  it("keeps somebody with no cushion aside without calling it a problem", () => {
    const plan = planLiveDesk({
      strips: DESK,
      people: [person("s1", "Shravya", null), person("s2", "Ashwin", "blue")],
    });

    expect(plan.noCushion.map((p) => p.name)).toEqual(["Shravya"]);
    expect(plan.hasProblem).toBe(false);
  });

  it("never puts anybody on a strip that carries no cushion", () => {
    const plan = planLiveDesk({
      strips: DESK,
      people: [person("s1", "Ashwin", "blue")],
    });

    expect(plan.strips.find((s) => s.strip.number === "4")!.people).toEqual([]);
    expect(plan.strips.find((s) => s.strip.number === "9")!.people).toEqual([]);
  });

  /*
   * A coloured strip that is not a vocal must not swallow a singer — a cushion
   * belongs to a mic. The tabla is on a fixed channel for the same reason the
   * cushions are, and that is not the same reason.
   */
  it("ignores a colour on a non-vocal strip", () => {
    const withColouredTabla = [strip(1, "Blue", "blue"), strip(9, "Tabla", "blue", "instrument")];
    const plan = planLiveDesk({
      strips: withColouredTabla,
      people: [person("s1", "Ashwin", "blue"), person("s2", "Prithvi", "blue")],
    });

    expect(plan.strips.find((s) => s.strip.number === "9")!.people).toEqual([]);
    expect(plan.strips.find((s) => s.strip.number === "1")!.clash).toBe(true);
  });

  it("spreads a colour across its channels when a desk has two of them", () => {
    const twoBlues = [strip(1, "Blue", "blue"), strip(2, "Blue spare", "blue")];
    const plan = planLiveDesk({
      strips: twoBlues,
      people: [
        person("s1", "Ashwin", "blue"),
        person("s2", "Prithvi", "blue"),
        person("s3", "Rhuben", "blue"),
      ],
    });

    expect(plan.strips[0].people.map((p) => p.name)).toEqual(["Ashwin"]);
    // The third has nowhere of their own, so they pile onto the last blue.
    expect(plan.strips[1].people.map((p) => p.name)).toEqual(["Prithvi", "Rhuben"]);
    expect(plan.strips[0].clash).toBe(false);
    expect(plan.strips[1].clash).toBe(true);
  });

  it("draws an empty desk and an empty session without complaining", () => {
    expect(planLiveDesk({ strips: [], people: [] })).toEqual({
      strips: [],
      unplaced: [],
      noCushion: [],
      hasProblem: false,
    });
    expect(planLiveDesk({ strips: DESK, people: [] }).hasProblem).toBe(false);
    expect(planLiveDesk({ strips: [], people: [person("s1", "Ashwin", "blue")] }).unplaced).toHaveLength(1);
  });

  it("keeps the desk's own order, whatever order the people arrive in", () => {
    const plan = planLiveDesk({
      strips: DESK,
      people: [person("s1", "Pavitra", "pink"), person("s2", "Ashwin", "blue")],
    });
    expect(plan.strips.map((s) => s.strip.number)).toEqual(["1", "2", "3", "4", "5", "6", "9"]);
  });
});

describe("stripWho", () => {
  it("says nothing for an empty strip", () => {
    expect(stripWho({ strip: DESK[0], people: [], clash: false })).toBe(null);
  });
});

describe("planLiveDeskForSlots", () => {
  const slot = (position: number, title: string, lead: CushionPerson | null, chorus: CushionPerson[] = []) => ({
    position, title, lead, chorus,
  });

  it("gives each bhajan its own desk, with only its own mics up", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [
        slot(1, "Lambodara", person("s1", "Pavitra", "orange")),
        slot(2, "Parthesa", person("s2", "Sailavan", "grey")),
      ],
    });

    expect(plans.map((p) => p.title)).toEqual(["Lambodara", "Parthesa"]);
    // Bhajan 1 lights channel 5 (orange) and nothing else.
    expect([...plans[0].openIds]).toEqual(["c5"]);
    expect([...plans[1].openIds]).toEqual(["c2"]);
  });

  /*
   * The reason this is per bhajan at all. A chorus cushion belongs to the
   * BHAJAN, so the same desk looks different from one to the next even when
   * the lead has not changed.
   */
  it("adds each bhajan's own chorus mics", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [
        slot(1, "One", person("s1", "Pavitra", "orange"), [person("s3", "Anvita", "green")]),
        slot(2, "Two", person("s1", "Pavitra", "orange")),
      ],
    });

    expect([...plans[0].openIds].sort()).toEqual(["c3", "c5"]);
    expect([...plans[1].openIds]).toEqual(["c5"]);
  });

  it("counts a lead who is also on their own chorus once", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [slot(1, "One", person("s1", "Pavitra", "orange"), [person("s1", "Pavitra", "green")])],
    });

    const orange = plans[0].plan.strips.find((s) => s.strip.number === "5")!;
    expect(orange.people.map((p) => p.name)).toEqual(["Pavitra"]);
    expect(orange.clash).toBe(false);
    // The chorus entry is dropped entirely, not moved to green.
    expect([...plans[0].openIds]).toEqual(["c5"]);
  });

  it("still reports a clash, per bhajan", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [
        slot(1, "One", person("s1", "Pavitra", "orange"), [person("s2", "Sailavan", "orange")]),
        slot(2, "Two", person("s1", "Pavitra", "orange")),
      ],
    });

    expect(plans[0].plan.hasProblem).toBe(true);
    expect(plans[1].plan.hasProblem).toBe(false);
  });

  it("draws a bhajan with nobody on it as an empty desk", () => {
    const plans = planLiveDeskForSlots({ strips: DESK, slots: [slot(1, "Not chosen", null)] });
    expect([...plans[0].openIds]).toEqual([]);
    expect(plans[0].plan.hasProblem).toBe(false);
    expect(plans[0].plan.strips).toHaveLength(DESK.length);
  });
});

/*
 * Which strip is the LEAD's — with a lead and two chorus singers, three strips
 * light up in their cushion colours and the picture alone cannot say which of
 * them is singing the bhajan.
 */
describe("planLiveDeskForSlots — the lead's strip", () => {
  const slot = (position: number, title: string, lead: CushionPerson | null, chorus: CushionPerson[] = []) => ({
    position, title, lead, chorus,
  });

  it("names the strip the lead landed on, and only that one", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [
        slot(1, "One", person("s1", "Sailavan", "grey"), [
          person("s2", "Sriraag", "green"),
          person("s3", "Triveni", "pink"),
        ]),
      ],
    });

    expect([...plans[0].leadStripIds]).toEqual(["c2"]);
    // All three are up; only one of them is the lead's.
    expect([...plans[0].openIds].sort()).toEqual(["c2", "c3", "c6"]);
  });

  it("has no lead strip when the desk cannot place the lead's cushion", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [slot(1, "One", person("s1", "Sailavan", "maroon"), [person("s2", "Sriraag", "green")])],
    });
    expect([...plans[0].leadStripIds]).toEqual([]);
    expect(plans[0].plan.unplaced.map((p) => p.name)).toEqual(["Sailavan"]);
  });

  it("has no lead strip for a bhajan with nobody singing it, or no cushion yet", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [slot(1, "One", null), slot(2, "Two", person("s1", "Sailavan", null))],
    });
    expect([...plans[0].leadStripIds]).toEqual([]);
    expect([...plans[1].leadStripIds]).toEqual([]);
  });

  /*
   * Both facts are true of one strip and both are worth saying: it is the
   * lead's, AND two people are on that cushion.
   */
  it("still names the lead's strip when it is also a clash", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [slot(1, "One", person("s1", "Sailavan", "grey"), [person("s2", "Sriraag", "grey")])],
    });
    const grey = plans[0].plan.strips.find((a) => a.strip.number === "2")!;
    expect(grey.clash).toBe(true);
    expect([...plans[0].leadStripIds]).toEqual(["c2"]);
  });

  it("marks the lead per bhajan, following the singer down the running order", () => {
    const plans = planLiveDeskForSlots({
      strips: DESK,
      slots: [
        slot(1, "One", person("s1", "Sailavan", "grey"), [person("s2", "Sriraag", "green")]),
        slot(2, "Two", person("s2", "Sriraag", "green"), [person("s1", "Sailavan", "grey")]),
      ],
    });
    expect([...plans[0].leadStripIds]).toEqual(["c2"]);
    expect([...plans[1].leadStripIds]).toEqual(["c3"]);
  });
});
