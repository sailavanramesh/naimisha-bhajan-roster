import { describe, it, expect } from "vitest";
import {
  blankStrips,
  currentItemOf,
  defaultStrips,
  occupantFor,
  shortName,
  channelLabel,
  proposeChannels,
  proposeOpenChannels,
  sortChannels,
  stepItem,
  type ItemPeople,
} from "../lib/deskChannels";

const NAMES = {
  singerName: (id: string) =>
    ({ s1: "Jothsna", s2: "Shravya", s3: "Sriraag", s4: "Prithvi" })[id],
  instrumentName: (id: string) =>
    ({ i1: "Tabla", i2: "Harmonium", i3: "Keyboard", i4: "Karaoke track" })[id],
};

const item = (
  itemId: string,
  performers: ItemPeople["performers"],
  instruments: ItemPeople["instruments"] = [],
): ItemPeople => ({ itemId, performers, instruments });

describe("proposeChannels", () => {
  it("gives every singer one channel, in the order they first appear", () => {
    const channels = proposeChannels(
      [
        item("a", [{ singerId: "s1" }, { singerId: "s2" }]),
        item("b", [{ singerId: "s3" }]),
      ],
      NAMES,
    );
    expect(channels.map((c) => c.label)).toEqual(["Jothsna", "Shravya", "Sriraag"]);
    expect(channels.map((c) => c.number)).toEqual(["1", "2", "3"]);
  });

  it("does not give a singer a second channel for a second item", () => {
    // One singer, one mic, all evening — however many items they sing.
    const channels = proposeChannels(
      [item("a", [{ singerId: "s1" }]), item("b", [{ singerId: "s1" }])],
      NAMES,
    );
    expect(channels).toHaveLength(1);
  });

  it("gives a group its own channel — it is still a mic", () => {
    const channels = proposeChannels(
      [item("a", [{ singerId: "s1" }, { name: "Psais" }, { name: "All girls" }])],
      NAMES,
    );
    expect(channels.map((c) => c.label)).toEqual(["Jothsna", "Psais", "All girls"]);
    expect(channels[1].person).toBe("Psais");
    expect(channels[1].singerId).toBeUndefined();
  });

  it("treats the same group named twice as one channel, whatever the case", () => {
    const channels = proposeChannels(
      [item("a", [{ name: "Psais" }]), item("b", [{ name: "psais" }])],
      NAMES,
    );
    expect(channels).toHaveLength(1);
  });

  it("puts instruments after the vocals, one each", () => {
    const channels = proposeChannels(
      [
        item("a", [{ singerId: "s1" }], [{ instrumentId: "i1" }, { instrumentId: "i2" }]),
        item("b", [{ singerId: "s2" }], [{ instrumentId: "i1" }]),
      ],
      NAMES,
    );
    expect(channels.map((c) => c.label)).toEqual(["Jothsna", "Shravya", "Tabla", "Harmonium"]);
    expect(channels.map((c) => c.number)).toEqual(["1", "2", "3", "4"]);
  });

  it("marks a backing track as a track, not an instrument", () => {
    // Nobody plays it, and the desk treats it differently.
    const channels = proposeChannels([item("a", [], [{ instrumentId: "i4" }])], NAMES);
    expect(channels[0].kind).toBe("track");
  });

  it("marks a played instrument as an instrument", () => {
    const channels = proposeChannels([item("a", [], [{ instrumentId: "i1" }])], NAMES);
    expect(channels[0].kind).toBe("instrument");
  });

  it("skips a performer with neither a singer nor a name", () => {
    const channels = proposeChannels([item("a", [{}, { name: "  " }])], NAMES);
    expect(channels).toEqual([]);
  });

  it("proposes nothing for an empty programme", () => {
    expect(proposeChannels([], NAMES)).toEqual([]);
  });
});

describe("proposeOpenChannels", () => {
  const channels = [
    { id: "c1", singerId: "s1" },
    { id: "c2", singerId: "s2" },
    { id: "c3", person: "Psais" },
    { id: "c4", instrumentId: "i1" },
    { id: "c5", instrumentId: "i2" },
    { id: "c6" }, // a spare, carrying nobody
  ];

  it("opens the channels of the people actually on the item", () => {
    const open = proposeOpenChannels(
      item("a", [{ singerId: "s1" }], [{ instrumentId: "i1" }]),
      channels,
    );
    expect([...open].sort()).toEqual(["c1", "c4"]);
  });

  it("opens a group's channel by name, ignoring case", () => {
    const open = proposeOpenChannels(item("a", [{ name: "psais" }]), channels);
    expect([...open]).toEqual(["c3"]);
  });

  it("never opens a spare — there is nothing on it to hear", () => {
    const open = proposeOpenChannels(
      item("a", [{ singerId: "s1" }, { singerId: "s2" }], [{ instrumentId: "i1" }, { instrumentId: "i2" }]),
      channels,
    );
    expect(open.has("c6")).toBe(false);
  });

  it("opens one mic for a reading, which is the case this exists for", () => {
    // A read passage: the reader's channel open, everything else down.
    const open = proposeOpenChannels(item("r", [{ singerId: "s2" }]), channels);
    expect([...open]).toEqual(["c2"]);
  });

  it("opens nothing for an item with nobody on it yet", () => {
    expect([...proposeOpenChannels(item("a", []), channels)]).toEqual([]);
  });
});

describe("sortChannels", () => {
  it("sorts numerically, so 10 comes after 9", () => {
    const sorted = sortChannels([{ number: "10" }, { number: "9" }, { number: "1" }]);
    expect(sorted.map((c) => c.number)).toEqual(["1", "9", "10"]);
  });

  it("puts a stereo pair after the plain numbers rather than guessing at it", () => {
    const sorted = sortChannels([{ number: "13/14" }, { number: "2" }, { number: "1" }]);
    expect(sorted.map((c) => c.number)).toEqual(["1", "2", "13/14"]);
  });
});

describe("channelLabel", () => {
  it("names the channel and who is on it", () => {
    expect(channelLabel({ number: "3", label: "Tabla", who: "Sriraag" })).toBe("3 · Tabla (Sriraag)");
  });

  it("does not repeat itself when the label IS the person", () => {
    expect(channelLabel({ number: "1", label: "Jothsna", who: "Jothsna" })).toBe("1 · Jothsna");
  });

  it("copes with a channel nobody is on", () => {
    expect(channelLabel({ number: "6", label: "Spare" })).toBe("6 · Spare");
  });
});

describe("blankStrips", () => {
  it("numbers them from one", () => {
    const strips = blankStrips(4);
    expect(strips.map((s) => s.number)).toEqual(["1", "2", "3", "4"]);
    expect(strips.every((s) => s.kind === "spare")).toBe(true);
  });

  it("refuses a silly count rather than making thousands of rows", () => {
    expect(blankStrips(0)).toEqual([]);
    expect(blankStrips(-5)).toEqual([]);
    expect(blankStrips(9999)).toHaveLength(64);
  });
});

describe("currentItemOf", () => {
  const items = [{ position: 1 }, { position: 2 }, { position: 3 }];

  it("shows the first item before anybody has pressed anything", () => {
    expect(currentItemOf(items, null)).toEqual({ position: 1 });
    expect(currentItemOf(items, undefined)).toEqual({ position: 1 });
  });

  it("shows the item at the stored position", () => {
    expect(currentItemOf(items, 2)).toEqual({ position: 2 });
  });

  it("has nothing to show when the running order is empty", () => {
    expect(currentItemOf([], 1)).toBeNull();
    expect(currentItemOf([], null)).toBeNull();
  });

  /*
   * The case a stored POSITION exists to survive: the item the desk was on is
   * deleted mid-programme. Whatever took its place is what to show.
   */
  it("lands on what moved up when the item it was on is gone", () => {
    expect(currentItemOf([{ position: 1 }, { position: 3 }], 2)).toEqual({ position: 3 });
  });

  it("lands on the last item when the position is past the end", () => {
    expect(currentItemOf(items, 99)).toEqual({ position: 3 });
  });

  it("does not care what order the items arrive in", () => {
    expect(currentItemOf([{ position: 3 }, { position: 1 }, { position: 2 }], null)).toEqual({
      position: 1,
    });
  });
});

describe("stepItem", () => {
  const items = [{ position: 1 }, { position: 2 }, { position: 3 }];

  it("goes forward and back one item at a time", () => {
    expect(stepItem(items, 1, 1)).toBe(2);
    expect(stepItem(items, 2, -1)).toBe(1);
  });

  it("stops at both ends rather than wrapping", () => {
    expect(stepItem(items, 3, 1)).toBeNull();
    expect(stepItem(items, 1, -1)).toBeNull();
  });

  it("steps over a gap left by a deleted item", () => {
    const gappy = [{ position: 1 }, { position: 4 }, { position: 5 }];
    expect(stepItem(gappy, 1, 1)).toBe(4);
    expect(stepItem(gappy, 4, -1)).toBe(1);
  });

  it("starts from the first item when nothing is stored", () => {
    expect(stepItem(items, null, 1)).toBe(2);
    expect(stepItem(items, null, -1)).toBeNull();
  });

  it("has nowhere to go in an empty running order", () => {
    expect(stepItem([], null, 1)).toBeNull();
  });
});

describe("defaultStrips", () => {
  const strips = defaultStrips(20);

  it("puts the centre's cushions on the channels they are actually on", () => {
    const colours = Object.fromEntries(strips.map((s) => [s.number, s.colour ?? null]));
    expect(colours["1"]).toBe("blue");
    expect(colours["2"]).toBe("grey");
    expect(colours["3"]).toBe("green");
    expect(colours["5"]).toBe("orange");
    expect(colours["6"]).toBe("pink");
  });

  /* Channel 4 is a mic with no cushion, and that is a fact about the desk
     rather than a strip somebody forgot to fill in. */
  it("leaves channel 4 without a cushion, and says so", () => {
    const four = strips.find((s) => s.number === "4");
    expect(four?.colour ?? null).toBeNull();
    expect(four?.label).toBe("No cushion");
    expect(four?.kind).toBe("vocal");
  });

  it("fixes the tabla to channel 9, as an instrument", () => {
    const nine = strips.find((s) => s.number === "9");
    expect(nine?.label).toBe("Tabla");
    expect(nine?.kind).toBe("instrument");
  });

  it("numbers the rest plainly and leaves them spare", () => {
    const twelve = strips.find((s) => s.number === "12");
    expect(twelve?.label).toBe("Channel 12");
    expect(twelve?.kind).toBe("spare");
    expect(strips).toHaveLength(20);
  });

  it("gives a small desk only the part of the allocation that fits", () => {
    const small = defaultStrips(4);
    expect(small).toHaveLength(4);
    expect(small.map((s) => s.colour ?? null)).toEqual(["blue", "grey", "green", null]);
  });

  it("refuses a silly count, like blankStrips", () => {
    expect(defaultStrips(0)).toEqual([]);
    expect(defaultStrips(9999)).toHaveLength(64);
  });
});

describe("shortName", () => {
  it("takes three letters of a single name", () => {
    expect(shortName("Prasanna")).toBe("Pra");
    expect(shortName("Ashwin")).toBe("Ash");
  });

  it("initials a name with more than one word", () => {
    expect(shortName("All girls")).toBe("AG");
    expect(shortName("Sri Sai Ram")).toBe("SSR");
  });

  it("stops at three initials", () => {
    expect(shortName("One Two Three Four")).toBe("OTT");
  });

  it("has nothing to say about nothing", () => {
    expect(shortName(null)).toBe("");
    expect(shortName("   ")).toBe("");
  });

  it("copes with a short name rather than padding it", () => {
    expect(shortName("Jo")).toBe("Jo");
  });
});

describe("occupantFor", () => {
  const channel = { who: "Prasanna" };

  it("says the channel's own occupant when nothing overrides it", () => {
    expect(occupantFor(channel, null)).toBe("Prasanna");
    expect(occupantFor(channel, {})).toBe("Prasanna");
  });

  /* The case this exists for: a singer's mic on the mridangam for one song. */
  it("lets an instrument take the strip for one item", () => {
    expect(occupantFor(channel, { instrumentName: "Mridangam" })).toBe("Mridangam");
  });

  it("lets another singer take it", () => {
    expect(occupantFor(channel, { singerName: "Rhuben" })).toBe("Rhuben");
  });

  it("lets a typed name take it — one head of a two-sided drum", () => {
    expect(occupantFor(channel, { person: "Dholak L" })).toBe("Dholak L");
  });

  it("ignores an override that is only whitespace", () => {
    expect(occupantFor(channel, { person: "   " })).toBe("Prasanna");
  });

  it("has nothing to say about a spare strip", () => {
    expect(occupantFor({ who: null }, null)).toBeNull();
  });
});
