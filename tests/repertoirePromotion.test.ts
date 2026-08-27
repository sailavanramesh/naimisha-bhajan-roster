import { describe, it, expect } from "vitest";
import { decideFromSung, type ListedRow } from "@/lib/repertoirePromotion";

const row = (over: Partial<ListedRow> = {}): ListedRow => ({
  id: "r1",
  kind: "wantToLearn",
  preferredPitch: null,
  note: null,
  ...over,
});

describe("decideFromSung — singing it moves it along", () => {
  it("adds a bhajan nobody has listed", () => {
    expect(decideFromSung([], "4 Pancham / F")).toEqual({ action: "create" });
  });

  /*
   * The case that started this: Prithvi had "Sai Guna Gao Sai Naam" as
   * wantToLearn, sang it on 2026-08-20, and it stayed under "Want to learn".
   */
  it("moves what they wanted to learn to Know it", () => {
    expect(decideFromSung([row()], "4 Pancham / F")).toEqual({
      action: "update",
      id: "r1",
      promote: true,
      fillPitch: true,
      setNote: true,
    });
  });

  it("moves what they were learning to Know it", () => {
    const d = decideFromSung([row({ kind: "learning" })], null);
    expect(d).toMatchObject({ action: "update", promote: true });
  });

  it("leaves a bhajan they already know alone", () => {
    expect(decideFromSung([row({ kind: "known", preferredPitch: "4 Pancham / F" })], "2 Pancham / D")).toBeNull();
  });

  /* `festival` is a dead value meaning the same as known. */
  it("treats a festival row as knowing it", () => {
    expect(decideFromSung([row({ kind: "festival", preferredPitch: "1 Madhyam / F" })], "1 Madhyam / F")).toBeNull();
  });
});

describe("decideFromSung — what it will not overwrite", () => {
  it("fills a blank shruti from what they sang", () => {
    const d = decideFromSung([row({ kind: "known" })], "4 Pancham / F");
    expect(d).toEqual({ action: "update", id: "r1", promote: false, fillPitch: true, setNote: false });
  });

  it("leaves a shruti they chose", () => {
    const d = decideFromSung([row({ preferredPitch: "2 Pancham / D" })], "4 Pancham / F");
    expect(d).toMatchObject({ promote: true, fillPitch: false });
  });

  it("has nothing to say when there is no confirmed pitch and they know it", () => {
    expect(decideFromSung([row({ kind: "known" })], null)).toBeNull();
  });

  it("leaves a note they wrote themselves", () => {
    const d = decideFromSung([row({ note: "the second line is the hard one" })], null);
    expect(d).toMatchObject({ promote: true, setNote: false });
  });

  it("does not write a note onto a row that is not moving", () => {
    const d = decideFromSung([row({ kind: "known" })], "4 Pancham / F");
    expect(d).toMatchObject({ setNote: false });
  });
});

describe("decideFromSung — two rows for the same bhajan", () => {
  /*
   * The seed built these lists from several sheets and the unique key is on the
   * title per stage, so a pair can genuinely sit at two stages at once.
   */
  it("moves the one furthest along and leaves the other", () => {
    const d = decideFromSung(
      [row({ id: "want", kind: "wantToLearn" }), row({ id: "learn", kind: "learning" })],
      null,
    );
    expect(d).toMatchObject({ id: "learn", promote: true });
  });

  it("does nothing at all when one of them is already known", () => {
    const d = decideFromSung(
      [
        row({ id: "want", kind: "wantToLearn" }),
        row({ id: "know", kind: "known", preferredPitch: "4 Pancham / F" }),
      ],
      "4 Pancham / F",
    );
    expect(d).toBeNull();
  });

  /* Promoting the second one would make two rows at the same title, which the
     unique key forbids — the known row takes the shruti instead. */
  it("fills the known row's shruti rather than moving the other", () => {
    const d = decideFromSung(
      [row({ id: "want", kind: "wantToLearn" }), row({ id: "know", kind: "known" })],
      "4 Pancham / F",
    );
    expect(d).toEqual({ action: "update", id: "know", promote: false, fillPitch: true, setNote: false });
  });
});
