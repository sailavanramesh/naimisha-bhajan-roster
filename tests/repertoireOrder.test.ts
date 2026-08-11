import { describe, expect, it } from "vitest";
import {
  balancedRepertoireOrder,
  historyPhrase,
  type OrderableBhajan,
} from "@/lib/repertoireOrder";

const b = (
  id: string,
  kindRank: number,
  daysSinceSung: number | null,
  deity: string | null = null,
): OrderableBhajan => ({ id, kindRank, daysSinceSung, deity });

describe("balancedRepertoireOrder", () => {
  it("keeps readiness bands in order", () => {
    // Something they are still learning never outranks something they know,
    // however fresh it is.
    const out = balancedRepertoireOrder([b("learning", 2, null), b("known", 0, 3)]);
    expect(out.map((x) => x.id)).toEqual(["known", "learning"]);
  });

  it("offers what they have never sung before what they have", () => {
    const out = balancedRepertoireOrder([b("sung", 0, 10), b("never", 0, null)]);
    expect(out.map((x) => x.id)).toEqual(["never", "sung"]);
  });

  it("offers the longest-ago before the most recent", () => {
    const out = balancedRepertoireOrder([b("recent", 0, 7), b("old", 0, 400), b("mid", 0, 90)]);
    expect(out.map((x) => x.id)).toEqual(["old", "mid", "recent"]);
  });

  it("breaks up a run of one deity", () => {
    // Four Ganesha bhajans learnt together would otherwise fill the visible
    // list on their own.
    const out = balancedRepertoireOrder([
      b("g1", 0, 100, "Ganesha"),
      b("g2", 0, 99, "Ganesha"),
      b("g3", 0, 98, "Ganesha"),
      b("s1", 0, 50, "Sai"),
      b("d1", 0, 40, "Devi"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["g1", "s1", "d1", "g2", "g3"]);
  });

  it("still puts the single best suggestion first", () => {
    // Dealing round the deities must not cost the top slot.
    const out = balancedRepertoireOrder([
      b("best", 0, null, "Sai"),
      b("other", 0, 5, "Ganesha"),
    ]);
    expect(out[0].id).toBe("best");
  });

  it("is stable — the same input gives the same order twice", () => {
    // The order is a reason, not a shuffle. Somebody who scrolls past a title
    // must be able to find it again.
    const items = [b("c", 0, 5, "Sai"), b("a", 0, 5, "Sai"), b("b", 0, 5, "Devi")];
    const first = balancedRepertoireOrder(items).map((x) => x.id);
    const second = balancedRepertoireOrder([...items].reverse()).map((x) => x.id);
    expect(first).toEqual(second);
  });

  it("loses nothing", () => {
    const items = [
      b("a", 0, null, "Sai"),
      b("b", 1, 10, null),
      b("c", 2, 3, "Devi"),
      b("d", 0, 200, "Devi"),
    ];
    expect(balancedRepertoireOrder(items).map((x) => x.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("handles an empty list", () => {
    expect(balancedRepertoireOrder([])).toEqual([]);
  });

  it("treats missing deities as one group rather than as variety", () => {
    // 565 of the 3,613 masterlist bhajans have no deity recorded. Letting each
    // of those count as its own deity would defeat the dealing entirely.
    const out = balancedRepertoireOrder([
      b("n1", 0, 100, null),
      b("n2", 0, 99, null),
      b("s1", 0, 10, "Sai"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["n1", "s1", "n2"]);
  });
});

describe("tie-breaking", () => {
  it("does not fall back to alphabetical order", () => {
    // The whole point. Bhajan ids are cuids issued while the masterlist was
    // seeded in file order, so ordering ties by id reproduces the alphabetical
    // list — which is what was actually shipped the first time and is what
    // Sailavan asked to be rid of.
    const ids = ["b001", "b002", "b003", "b004", "b005", "b006", "b007", "b008"];
    const out = balancedRepertoireOrder(ids.map((id) => b(id, 0, null, "Sai")));
    expect(out.map((x) => x.id)).not.toEqual(ids);
  });

  it("gives the same order every time it is opened", () => {
    const ids = ["b001", "b002", "b003", "b004", "b005"];
    const once = balancedRepertoireOrder(ids.map((id) => b(id, 0, null, "Sai"))).map((x) => x.id);
    const twice = balancedRepertoireOrder(
      [...ids].reverse().map((id) => b(id, 0, null, "Sai")),
    ).map((x) => x.id);
    expect(once).toEqual(twice);
  });

  it("still ranks freshness above the scramble", () => {
    const out = balancedRepertoireOrder([b("z", 0, null, "Sai"), b("a", 0, 5, "Sai")]);
    expect(out[0].id).toBe("z");
  });
});

describe("historyPhrase", () => {
  it("separates never-sung from sung, which is the whole point", () => {
    // "Knows it" is what the singer said once; "sung it here" is what the
    // roster recorded, with a pitch attached. They must not read alike.
    expect(historyPhrase(null)).toBe("never sung here");
    expect(historyPhrase(3)).toBe("sung 3 days ago");
  });

  it("scales the unit to the distance", () => {
    expect(historyPhrase(0)).toBe("sung today");
    expect(historyPhrase(1)).toBe("sung 1 day ago");
    expect(historyPhrase(21)).toBe("sung 3 weeks ago");
    expect(historyPhrase(90)).toBe("sung 3 months ago");
    expect(historyPhrase(380)).toBe("sung about a year ago");
    expect(historyPhrase(760)).toBe("sung 2 years ago");
  });
});
