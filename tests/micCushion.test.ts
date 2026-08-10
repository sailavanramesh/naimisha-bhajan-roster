import { describe, it, expect } from "vitest";
import {
  MIC_COLOURS,
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

describe("mic colour values", () => {
  it("offers exactly the four cushions on the desk", () => {
    expect(MIC_COLOURS.map((c) => c.value)).toEqual(["blue", "grey", "orange", "pink"]);
  });

  it("accepts only real colours", () => {
    expect(isMicColour("blue")).toBe(true);
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

describe("nextColour", () => {
  it("cycles the palette and ends on no cushion", () => {
    expect(nextColour(null)).toBe("blue");
    expect(nextColour("blue")).toBe("grey");
    expect(nextColour("grey")).toBe("orange");
    expect(nextColour("orange")).toBe("pink");
    expect(nextColour("pink")).toBe(null);
  });
});
