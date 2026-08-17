import { describe, it, expect } from "vitest";
import {
  instrumentsLabel,
  moveItem,
  performerLabel,
  performersLabel,
  renumber,
  runningOrderLabel,
  songCount,
  songNumbers,
  type OrderedItem,
} from "../lib/program";

const song = (position: number): OrderedItem => ({ position, kind: "song" });
const reading = (position: number): OrderedItem => ({ position, kind: "narration" });

describe("songNumbers", () => {
  it("numbers a plain running order 1, 2, 3", () => {
    const numbers = songNumbers([song(1), song(2), song(3)]);
    expect([...numbers]).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("does not number a narration, and does not let it advance the count", () => {
    // song, reading, song — the group calls these 1 and 2, not 1 and 3.
    const numbers = songNumbers([song(1), reading(2), song(3)]);
    expect(numbers.get(1)).toBe(1);
    expect(numbers.has(2)).toBe(false);
    expect(numbers.get(3)).toBe(2);
  });

  it("handles a program that opens with a reading", () => {
    const numbers = songNumbers([reading(1), song(2), song(3)]);
    expect(numbers.has(1)).toBe(false);
    expect(numbers.get(2)).toBe(1);
    expect(numbers.get(3)).toBe(2);
  });

  it("handles a program that closes with one", () => {
    const numbers = songNumbers([song(1), song(2), reading(3)]);
    expect(numbers.get(2)).toBe(2);
    expect(numbers.has(3)).toBe(false);
  });

  it("is unmoved by the order the items arrive in", () => {
    const numbers = songNumbers([song(3), reading(2), song(1)]);
    expect(numbers.get(1)).toBe(1);
    expect(numbers.get(3)).toBe(2);
  });

  it("numbers nothing in an all-readings program", () => {
    expect([...songNumbers([reading(1), reading(2)])]).toEqual([]);
  });

  it("is empty for an empty program", () => {
    expect([...songNumbers([])]).toEqual([]);
  });
});

describe("songCount and runningOrderLabel", () => {
  it("counts only the songs", () => {
    expect(songCount([song(1), reading(2), song(3)])).toBe(2);
  });

  it("says just the songs when there are no readings", () => {
    expect(runningOrderLabel([song(1), song(2)])).toBe("2 songs");
    expect(runningOrderLabel([song(1)])).toBe("1 song");
  });

  it("mentions readings only when there are some", () => {
    expect(runningOrderLabel([song(1), reading(2), song(3)])).toBe("2 songs, 1 reading");
    expect(runningOrderLabel([song(1), reading(2), reading(3)])).toBe("1 song, 2 readings");
  });

  it("says nothing odd about an empty program", () => {
    expect(runningOrderLabel([])).toBe("0 songs");
  });
});

describe("performerLabel", () => {
  it("names a roster singer", () => {
    expect(performerLabel({ singerName: "Jothsna" })).toBe("Jothsna");
  });

  it("names a guest or a group that has no singer row", () => {
    // Straight from the documents: Psais, All girls, Radhika aunty.
    expect(performerLabel({ name: "Psais" })).toBe("Psais");
    expect(performerLabel({ name: "Radhika aunty" })).toBe("Radhika aunty");
  });

  it("brackets the part when there is one", () => {
    expect(performerLabel({ singerName: "Rhuben", part: "tenor" })).toBe("Rhuben (tenor)");
    expect(performerLabel({ name: "All girls", part: "chorus" })).toBe("All girls (chorus)");
  });

  it("prefers the singer over a stray name", () => {
    expect(performerLabel({ singerName: "Ashwin", name: "ignored" })).toBe("Ashwin");
  });

  it("returns nothing rather than a stray bracket for an empty performer", () => {
    expect(performerLabel({})).toBe("");
    expect(performerLabel({ singerName: "  " })).toBe("");
  });

  it("joins a whole item's performers", () => {
    expect(
      performersLabel([
        { singerName: "Jothsna" },
        { singerName: "Shravya" },
        { name: "Anvita" },
      ]),
    ).toBe("Jothsna, Shravya, Anvita");
  });

  it("drops empty performers from the joined line rather than leaving gaps", () => {
    expect(performersLabel([{ singerName: "Prithvi" }, {}, { name: "Psais" }])).toBe(
      "Prithvi, Psais",
    );
  });
});

describe("instrumentsLabel", () => {
  it("writes the documents' own form", () => {
    expect(
      instrumentsLabel([
        { instrumentName: "Tabla", singerName: "Sriraag" },
        { instrumentName: "Harmonium", person: "Gowtem" },
      ]),
    ).toBe("Tabla (Sriraag), Harmonium (Gowtem)");
  });

  it("writes an unassigned instrument bare, because the desk still needs to know", () => {
    expect(
      instrumentsLabel([
        { instrumentName: "Keyboard" },
        { instrumentName: "Violin", singerName: "Prithvi" },
      ]),
    ).toBe("Keyboard, Violin (Prithvi)");
  });
});

describe("renumber", () => {
  it("reports nothing when the order is already 1..n", () => {
    expect(renumber([song(1), song(2), song(3)])).toEqual([]);
  });

  it("closes a gap left by a deletion, reporting only the rows that move", () => {
    // Item 2 was deleted; 3 and 4 slide up, 1 stays put.
    expect(renumber([song(1), song(3), song(4)])).toEqual([
      { from: 3, to: 2 },
      { from: 4, to: 3 },
    ]);
  });
});

describe("moveItem", () => {
  const order = [song(1), reading(2), song(3), song(4)];

  it("moves an item down and renumbers everything", () => {
    const moved = moveItem(order, 1, 3);
    expect(moved.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(moved.map((i) => i.kind)).toEqual(["narration", "song", "song", "song"]);
  });

  it("moves an item up", () => {
    const moved = moveItem(order, 4, 1);
    expect(moved.map((i) => i.kind)).toEqual(["song", "song", "narration", "song"]);
  });

  it("clamps a move past either end instead of refusing it", () => {
    // Pressing "up" on the first item is an ordinary thing to do.
    expect(moveItem(order, 1, 0).map((i) => i.kind)).toEqual(order.map((i) => i.kind));
    expect(moveItem(order, 4, 99).map((i) => i.kind)).toEqual(order.map((i) => i.kind));
  });

  it("leaves the order alone when asked to move something that is not there", () => {
    expect(moveItem(order, 9, 1).map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });
});
