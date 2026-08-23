import { describe, it, expect } from "vitest";
import { mergeRow, describeConflicts, type MergeableRow } from "./rowMerge";

const row = (over: Partial<MergeableRow> = {}): MergeableRow => ({
  singerId: "s1",
  bhajanId: "b1",
  bhajanTitle: null,
  festivalBhajanTitle: null,
  confirmedPitch: "2 Pancham / D",
  alternativeTablaPitch: null,
  ...over,
});

/**
 * The rule that protects the most valuable column in the database: a pitch
 * somebody has just recorded must never be lost to somebody else's save.
 */
describe("mergeRow", () => {
  it("takes my change when they did not touch that field", () => {
    const base = row();
    const mine = row({ confirmedPitch: "3 Pancham / E" });
    const theirs = row();
    const r = mergeRow(base, mine, theirs);
    expect(r.clashes).toEqual([]);
    expect(r.merged.confirmedPitch).toBe("3 Pancham / E");
    expect(r.changedByMe).toBe(true);
  });

  it("keeps THEIR change when I only echoed back what I was shown", () => {
    // The grid sends every field every time. Without `base` this looks like me
    // asserting the old pitch, and their new one would be lost.
    const base = row({ confirmedPitch: "2 Pancham / D" });
    const mine = row({ confirmedPitch: "2 Pancham / D" });
    const theirs = row({ confirmedPitch: "5 Pancham / G" });
    const r = mergeRow(base, mine, theirs);
    expect(r.clashes).toEqual([]);
    expect(r.merged.confirmedPitch).toBe("5 Pancham / G");
    expect(r.changedByMe).toBe(false);
  });

  it("merges when we changed DIFFERENT fields on the same row", () => {
    const base = row();
    const mine = row({ confirmedPitch: "3 Pancham / E" });
    const theirs = row({ singerId: "s2" });
    const r = mergeRow(base, mine, theirs);
    expect(r.clashes).toEqual([]);
    expect(r.merged.confirmedPitch).toBe("3 Pancham / E");
    expect(r.merged.singerId).toBe("s2");
  });

  it("reports a clash when we changed the SAME field differently", () => {
    const base = row({ confirmedPitch: "2 Pancham / D" });
    const mine = row({ confirmedPitch: "3 Pancham / E" });
    const theirs = row({ confirmedPitch: "5 Pancham / G" });
    const r = mergeRow(base, mine, theirs);
    expect(r.clashes).toEqual([
      { field: "confirmedPitch", mine: "3 Pancham / E", theirs: "5 Pancham / G" },
    ]);
    // Theirs is left in place: a clash never guesses, and never overwrites.
    expect(r.merged.confirmedPitch).toBe("5 Pancham / G");
  });

  it("is not a clash when we both made the SAME change", () => {
    const base = row({ confirmedPitch: "2 Pancham / D" });
    const both = row({ confirmedPitch: "4 Pancham / F" });
    expect(mergeRow(base, both, both).clashes).toEqual([]);
  });

  it("treats null, undefined and empty as the same absence", () => {
    const base = row({ bhajanTitle: null });
    const mine = row({ bhajanTitle: "" });
    const theirs = row({ bhajanTitle: null });
    expect(mergeRow(base, mine, theirs).clashes).toEqual([]);
  });

  it("does not count trailing whitespace as a change", () => {
    const base = row({ bhajanTitle: "Govinda" });
    const mine = row({ bhajanTitle: "Govinda  " });
    const theirs = row({ bhajanTitle: "Govinda" });
    const r = mergeRow(base, mine, theirs);
    expect(r.clashes).toEqual([]);
    expect(r.changedByMe).toBe(false);
  });

  it("reports every difference as a clash when there is no base to attribute it to", () => {
    // An older client, or a row this browser never loaded. Nothing can be
    // attributed, so nothing is assumed.
    const mine = row({ confirmedPitch: "3 Pancham / E" });
    const theirs = row({ confirmedPitch: "5 Pancham / G" });
    const r = mergeRow(null, mine, theirs);
    expect(r.clashes.map((c) => c.field)).toEqual(["confirmedPitch"]);
    expect(r.merged.confirmedPitch).toBe("5 Pancham / G");
  });

  it("clashes on several fields at once when both people changed several", () => {
    const base = row();
    const mine = row({ confirmedPitch: "3 Pancham / E", singerId: "s9" });
    const theirs = row({ confirmedPitch: "5 Pancham / G", singerId: "s2" });
    expect(mergeRow(base, mine, theirs).clashes.map((c) => c.field).sort()).toEqual([
      "confirmedPitch",
      "singerId",
    ]);
  });
});

describe("describeConflicts", () => {
  it("names the row, the person and the field, and says what each side holds", () => {
    const text = describeConflicts([
      {
        position: 3,
        singerName: "Prithvi",
        fields: [{ field: "confirmedPitch", mine: "3 Pancham / E", theirs: "5 Pancham / G" }],
      },
    ]);
    expect(text).toContain("row 3 (Prithvi)");
    expect(text).toContain("the pitch");
    expect(text).toContain('theirs "5 Pancham / G"');
    expect(text).toContain('yours "3 Pancham / E"');
    // The reassurance matters as much as the detail.
    expect(text).toContain("Everything else you changed has been saved");
  });

  it("does not print raw ids at somebody", () => {
    const text = describeConflicts([
      { position: 1, singerName: null, fields: [{ field: "singerId", mine: "ck1", theirs: "ck2" }] },
    ]);
    expect(text).toContain("the singer");
    expect(text).not.toContain("ck1");
    expect(text).toContain("an empty row");
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeConflicts([])).toBe("");
  });
});
