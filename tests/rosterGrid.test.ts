import { describe, it, expect } from "vitest";
import { BHAJAN_MIN_WIDTH, ROSTER_COLUMNS, rosterTableMinWidth } from "@/lib/rosterGrid";

/*
 * The bug this file exists to prevent.
 *
 * The columns added up to 760px against a hand-written 720px floor, so the
 * bhajan — the only column with no declared width, which takes what is left —
 * was allotted minus forty pixels and collapsed to nothing. Its contents then
 * painted over the pitch column. Nothing failed; it just looked wrong, and only
 * on a phone in landscape, where the table is squeezed to its minimum.
 */
describe("rosterTableMinWidth", () => {
  it("leaves the bhajan its minimum once every other column is paid for", () => {
    for (const canEdit of [true, false]) {
      const declared =
        ROSTER_COLUMNS.singer +
        ROSTER_COLUMNS.pitch +
        ROSTER_COLUMNS.chorus +
        ROSTER_COLUMNS.recommended +
        ROSTER_COLUMNS.tabla +
        (canEdit ? ROSTER_COLUMNS.actions : 0);

      expect(rosterTableMinWidth(canEdit) - declared, `canEdit=${canEdit}`).toBe(BHAJAN_MIN_WIDTH);
      expect(rosterTableMinWidth(canEdit) - declared).toBeGreaterThan(0);
    }
  });

  it("costs a read-only viewer exactly the delete column and nothing else", () => {
    expect(rosterTableMinWidth(true) - rosterTableMinWidth(false)).toBe(ROSTER_COLUMNS.actions);
  });

  it("still scrolls a landscape phone rather than pretending to fit", () => {
    /*
     * 844px is an iPhone 14 Pro on its side, and the grid does not fit — that
     * is expected and is why the singer column is frozen. What must not happen
     * is the table claiming to fit by starving a column.
     */
    expect(rosterTableMinWidth(true)).toBeGreaterThan(844);
  });

  it("has no column at or below zero", () => {
    for (const [name, width] of Object.entries(ROSTER_COLUMNS)) {
      expect(width, name).toBeGreaterThan(0);
    }
    expect(BHAJAN_MIN_WIDTH).toBeGreaterThan(0);
  });
});
