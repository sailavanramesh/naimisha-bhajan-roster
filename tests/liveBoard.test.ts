import { describe, it, expect } from "vitest";
import { hasMoreBelow, isRowSeen, movedRows, SCROLL_SLACK_PX } from "../lib/liveBoard";

/**
 * A row signature the way the board builds one: singer, bhajan, pitch and the
 * rest joined on NUL. Written as an escape rather than a literal byte — the
 * literal turns this file binary as far as git is concerned, which makes it
 * unreviewable.
 */
const sig = (...parts: string[]) => parts.join("\u0000");

const rows = (entries: Array<[number, string]>) => new Map(entries);

describe("movedRows", () => {
  it("says nothing moved when every signature is identical", () => {
    const before = rows([
      [1, sig("Ashwin", "Ganesha Sharanam", "1 Madhyam / F")],
      [2, sig("Jothsna", "Sai Ram", "2 Pancham / D")],
    ]);
    expect(movedRows(before, new Map(before))).toEqual([]);
  });

  it("catches a row whose pitch was corrected", () => {
    const before = rows([
      [1, sig("Ashwin", "Ganesha Sharanam", "1 Madhyam / F")],
      [2, sig("Jothsna", "Sai Ram", "2 Pancham / D")],
    ]);
    const now = rows([
      [1, sig("Ashwin", "Ganesha Sharanam", "1 Madhyam / F")],
      [2, sig("Jothsna", "Sai Ram", "3 Pancham / E")],
    ]);
    expect(movedRows(before, now)).toEqual([2]);
  });

  it("counts an ADDED bhajan as a change, so a new row rings", () => {
    const before = rows([[1, sig("Ashwin", "Ganesha Sharanam")]]);
    const now = rows([
      [1, sig("Ashwin", "Ganesha Sharanam")],
      [2, sig("Prasanna", "Sai Bhajan")],
    ]);
    expect(movedRows(before, now)).toEqual([2]);
  });

  it("reports both when a row is added and another edited at once", () => {
    const before = rows([
      [1, sig("Ashwin", "A")],
      [2, sig("Jothsna", "B")],
    ]);
    const now = rows([
      [1, sig("Ashwin", "A")],
      [2, sig("Jothsna", "B", "now at a different shruti")],
      [3, sig("Pavitra", "C")],
    ]);
    expect(movedRows(before, now)).toEqual([2, 3]);
  });

  it("says nothing about a DELETED row — there is no row left to ring", () => {
    const before = rows([
      [1, sig("Ashwin", "A")],
      [2, sig("Jothsna", "B")],
    ]);
    const now = rows([[1, sig("Ashwin", "A")]]);
    expect(movedRows(before, now)).toEqual([]);
  });
});

describe("hasMoreBelow", () => {
  it("is false for a session that fits — the weekday three or four", () => {
    expect(hasMoreBelow({ scrollHeight: 700, scrollTop: 0, clientHeight: 844 })).toBe(false);
    expect(hasMoreBelow({ scrollHeight: 844, scrollTop: 0, clientHeight: 844 })).toBe(false);
  });

  it("is true for a long Sunday or festival list at the top", () => {
    expect(hasMoreBelow({ scrollHeight: 2400, scrollTop: 0, clientHeight: 844 })).toBe(true);
  });

  it("goes false once scrolled to the end", () => {
    expect(hasMoreBelow({ scrollHeight: 2400, scrollTop: 1556, clientHeight: 844 })).toBe(false);
  });

  it("ignores slack worth of overflow, and notices one pixel more", () => {
    const at = (hidden: number) =>
      hasMoreBelow({ scrollHeight: 844 + hidden, scrollTop: 0, clientHeight: 844 });
    expect(at(SCROLL_SLACK_PX)).toBe(false);
    expect(at(SCROLL_SLACK_PX + 1)).toBe(true);
  });
});

describe("isRowSeen", () => {
  it("counts a row well inside the window", () => {
    expect(isRowSeen(300, 844)).toBe(true);
  });

  it("counts a row scrolled up past the top — the arrow only points down", () => {
    expect(isRowSeen(-220, 844)).toBe(true);
  });

  it("does not count a row starting below the bottom edge", () => {
    expect(isRowSeen(900, 844)).toBe(false);
  });

  it("does not count a row barely peeking above the fold", () => {
    expect(isRowSeen(838, 844)).toBe(false);
  });
});
