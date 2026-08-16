import { describe, it, expect } from "vitest";
import {
  blankStrips,
  channelLabel,
  proposeChannels,
  proposeOpenChannels,
  sortChannels,
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
