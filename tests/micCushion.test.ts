import { describe, it, expect } from "vitest";
import {
  ALL_CUSHIONS,
  deskCushions,
  isMicColour,
  micColourLabel,
  mergeCushions,
  applyOwnWrite,
  nextColour,
  type CushionEntry,
  type PolledCushion,
} from "../lib/micCushion";

const entry = (colour: CushionEntry["colour"], updatedAt: number): CushionEntry => ({
  colour,
  updatedAt,
});

const polled = (
  singerId: string,
  colour: CushionEntry["colour"],
  updatedAt: number,
): PolledCushion => ({ singerId, colour, updatedAt });

/** The centre's real desk, as configured on 2026-08-19. */
const YAMAHA = [
  { number: 1, colour: "blue" },
  { number: 2, colour: "grey" },
  { number: 3, colour: "green" },
  { number: 4, colour: null },
  { number: 5, colour: "orange" },
  { number: 6, colour: "pink" },
  { number: 7, colour: "green" },
  { number: 8, colour: null },
  { number: 11, colour: null },
];

describe("the cushion catalogue", () => {
  /*
   * The CATALOGUE, not an offer. What a picker shows comes from the desk; this
   * list only says which cushions exist at all, so a stored colour can always
   * be rendered and the desk admin can put any of them on a strip.
   */
  it("holds every colour the database can store", () => {
    expect(ALL_CUSHIONS.map((c) => c.value)).toEqual([
      "blue",
      "grey",
      "orange",
      "pink",
      "green",
      "black",
      "yellow",
      "maroon",
    ]);
  });

  it("accepts only real colours", () => {
    expect(isMicColour("blue")).toBe(true);
    // Green is no longer special. It was rejected here while the lead picker
    // refused it, on a desk that had it on two Lead vocal strips.
    expect(isMicColour("green")).toBe(true);
    expect(isMicColour("red")).toBe(false);
    expect(isMicColour(null)).toBe(false);
    expect(isMicColour(3)).toBe(false);
  });

  it("labels the empty state rather than showing a blank", () => {
    expect(micColourLabel(null)).toBe("No cushion");
    expect(micColourLabel("orange")).toBe("Orange");
  });
});

describe("mergeCushions", () => {
  it("takes a newer value from the server", () => {
    const current = new Map([["s1", entry("blue", 100)]]);
    const merged = mergeCushions(current, [polled("s1", "pink", 200)]);
    expect(merged.get("s1")).toMatchObject({ colour: "pink", updatedAt: 200 });
  });

  it("IGNORES a poll that is older than what we hold — the flip-back race", () => {
    const current = new Map([["s1", entry("pink", 200)]]);
    const merged = mergeCushions(current, [polled("s1", "blue", 100)]);
    expect(merged.get("s1")).toMatchObject({ colour: "pink", updatedAt: 200 });
  });

  it("ignores a poll with an equal timestamp, so repeated polls are a no-op", () => {
    const current = new Map([["s1", entry("pink", 200)]]);
    const merged = mergeCushions(current, [polled("s1", "blue", 200)]);
    expect(merged.get("s1")!.colour).toBe("pink");
  });

  it("never touches a singer with a write in flight, even if the poll is newer", () => {
    const current = new Map([["s1", entry("pink", 100)]]);
    const merged = mergeCushions(current, [polled("s1", "blue", 999)], new Set(["s1"]));
    expect(merged.get("s1")).toMatchObject({ colour: "pink", updatedAt: 100 });
  });

  it("still applies other singers while one is pending", () => {
    const current = new Map([
      ["s1", entry("pink", 100)],
      ["s2", entry("blue", 100)],
    ]);
    const merged = mergeCushions(current, [polled("s1", "grey", 999), polled("s2", "orange", 200)], new Set(["s1"]));
    expect(merged.get("s1")!.colour).toBe("pink");
    expect(merged.get("s2")!.colour).toBe("orange");
  });

  it("adds singers it has not seen before", () => {
    const merged = mergeCushions(new Map(), [polled("new", "grey", 50)]);
    expect(merged.get("new")).toMatchObject({ colour: "grey", updatedAt: 50 });
  });

  it("carries a clear (colour null) across as a real change", () => {
    const current = new Map([["s1", entry("pink", 100)]]);
    const merged = mergeCushions(current, [polled("s1", null, 200)]);
    expect(merged.get("s1")).toMatchObject({ colour: null, updatedAt: 200 });
  });

  it("leaves singers absent from the poll alone — absent means no news, not deleted", () => {
    const current = new Map([["s1", entry("pink", 100)]]);
    const merged = mergeCushions(current, [polled("s2", "blue", 200)]);
    expect(merged.get("s1")).toMatchObject({ colour: "pink", updatedAt: 100 });
  });

  it("does not mutate the map it was given", () => {
    const current = new Map([["s1", entry("blue", 100)]]);
    mergeCushions(current, [polled("s1", "pink", 200)]);
    expect(current.get("s1")!.colour).toBe("blue");
  });

  it("converges when two devices write: the later timestamp wins", () => {
    // Device A wrote blue at 100, device B wrote orange at 300. Both poll.
    const a = mergeCushions(new Map([["s1", entry("blue", 100)]]), [polled("s1", "orange", 300)]);
    const b = mergeCushions(new Map([["s1", entry("orange", 300)]]), [polled("s1", "blue", 100)]);
    expect(a.get("s1")!.colour).toBe("orange");
    expect(b.get("s1")!.colour).toBe("orange");
  });
});

describe("applyOwnWrite", () => {
  it("wins over a concurrent poll, because it is the server's answer to us", () => {
    const current = new Map([["s1", entry("grey", 999)]]);
    const next = applyOwnWrite(current, "s1", entry("pink", 100));
    expect(next.get("s1")).toMatchObject({ colour: "pink", updatedAt: 100 });
  });
});

describe("deskCushions", () => {
  /*
   * The whole point. Sailavan, 2026-08-19: "you pick the cushions that apply to
   * a channel on the sound desk, and those options show up under lead singer
   * and chorus singer in the same order as the channel ascribing was done."
   */
  it("offers the desk's colours in channel order", () => {
    expect(deskCushions(YAMAHA).map((c) => c.value)).toEqual([
      "blue",
      "grey",
      "green",
      "orange",
      "pink",
    ]);
  });

  it("shows a colour once, where it first appears", () => {
    // The centre's green is on channels 3 AND 7.
    const greens = deskCushions(YAMAHA).filter((c) => c.value === "green");
    expect(greens).toHaveLength(1);
    expect(deskCushions(YAMAHA)[2].value).toBe("green");
  });

  it("leaves out a cushion that is on no channel", () => {
    // Black, yellow and maroon exist in the catalogue and are on no strip.
    const offered = deskCushions(YAMAHA).map((c) => c.value);
    expect(offered).not.toContain("black");
    expect(offered).not.toContain("yellow");
    expect(offered).not.toContain("maroon");
  });

  it("reads channel order, not the order it was handed the rows", () => {
    const shuffled = [...YAMAHA].reverse();
    expect(deskCushions(shuffled).map((c) => c.value)).toEqual(
      deskCushions(YAMAHA).map((c) => c.value),
    );
  });

  it("a desk with nothing on its strips offers nothing", () => {
    expect(deskCushions([{ number: 1, colour: null }])).toEqual([]);
    expect(deskCushions([])).toEqual([]);
  });

  it("ignores a colour the catalogue does not know", () => {
    expect(deskCushions([{ number: 1, colour: "chartreuse" }])).toEqual([]);
  });
});

describe("nextColour", () => {
  const yamaha = deskCushions(YAMAHA);

  it("cycles this desk's cushions and ends on no cushion", () => {
    expect(nextColour(null, yamaha)).toBe("blue");
    expect(nextColour("blue", yamaha)).toBe("grey");
    expect(nextColour("grey", yamaha)).toBe("green");
    expect(nextColour("green", yamaha)).toBe("orange");
    expect(nextColour("orange", yamaha)).toBe("pink");
    expect(nextColour("pink", yamaha)).toBe(null);
  });

  it("clears a colour the desk no longer carries, rather than jumping to the front", () => {
    expect(nextColour("maroon", yamaha)).toBe(null);
  });

  it("has nowhere to go on a desk with no cushions", () => {
    expect(nextColour(null, [])).toBe(null);
    expect(nextColour("blue", [])).toBe(null);
  });
});
