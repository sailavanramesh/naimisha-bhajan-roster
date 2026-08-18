import { describe, it, expect } from "vitest";
import { describeChorusCopy, planChorusCopy, type ChorusCopyTarget } from "@/lib/chorusCopy";

const t = (slotId: string, position: number, micCount = 0): ChorusCopyTarget => ({
  slotId,
  position,
  micCount,
});

describe("planChorusCopy", () => {
  it("fills every empty bhajan below, in running order", () => {
    const plan = planChorusCopy({
      fromPosition: 1,
      targets: [t("a", 1, 2), t("b", 2), t("c", 3), t("d", 4)],
    });
    expect(plan.fill).toEqual(["b", "c", "d"]);
    expect(plan.skip).toEqual([]);
  });

  /*
   * The rule that makes this safe to press. Somebody has already said who
   * choruses bhajan 3; a copy down must not be the thing that quietly replaces
   * their answer.
   */
  it("leaves a bhajan that already has chorus mics alone", () => {
    const plan = planChorusCopy({
      fromPosition: 1,
      targets: [t("a", 1, 2), t("b", 2), t("c", 3, 1), t("d", 4)],
    });
    expect(plan.fill).toEqual(["b", "d"]);
    expect(plan.skip).toEqual(["c"]);
  });

  it("never touches the row it came from, or anything above it", () => {
    const plan = planChorusCopy({
      fromPosition: 3,
      targets: [t("a", 1), t("b", 2), t("c", 3, 2), t("d", 4)],
    });
    expect(plan.fill).toEqual(["d"]);
    expect(plan.skip).toEqual([]);
  });

  it("has nothing to do from the last bhajan", () => {
    const plan = planChorusCopy({ fromPosition: 3, targets: [t("a", 1), t("c", 3, 2)] });
    expect(plan).toEqual({ fill: [], skip: [] });
  });

  /*
   * Position, not array order. A session is a running order and rows get
   * dragged; "below" has to mean below in the order people will sing them.
   */
  it("reads 'below' by position, whatever order the rows arrive in", () => {
    const plan = planChorusCopy({
      fromPosition: 2,
      targets: [t("d", 4), t("a", 1), t("c", 3), t("b", 2, 1)],
    });
    expect(plan.fill).toEqual(["c", "d"]);
  });
});

describe("describeChorusCopy", () => {
  it("counts what it did", () => {
    expect(describeChorusCopy({ fill: ["a", "b"], skip: [] })).toBe("Copied to 2 bhajans.");
    expect(describeChorusCopy({ fill: ["a"], skip: [] })).toBe("Copied to 1 bhajan.");
  });

  it("says what it left alone", () => {
    expect(describeChorusCopy({ fill: ["a"], skip: ["b", "c"] })).toBe(
      "Copied to 1 bhajan. Left 2 that already had mics.",
    );
  });

  /*
   * The case that looks broken and is not: a correct, safe press that changed
   * nothing, because every bhajan below had already been answered.
   */
  it("explains a press that correctly did nothing", () => {
    expect(describeChorusCopy({ fill: [], skip: ["b"] })).toBe(
      "The bhajan below already has its own chorus mics.",
    );
    expect(describeChorusCopy({ fill: [], skip: ["b", "c", "d"] })).toBe(
      "All 3 bhajans below already have their own chorus mics.",
    );
    expect(describeChorusCopy({ fill: [], skip: [] })).toBe("No bhajans below this one.");
  });
});
