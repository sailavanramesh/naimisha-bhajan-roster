import { describe, expect, it } from "vitest";
import {
  defaultSessionOf,
  hasSeveral,
  sessionLabel,
  sortByStart,
  startMinutes,
  timeLabel,
  USUAL_START,
} from "@/lib/sessionsOfDay";

const s = (id: string, startsAt: string | null, categoryName?: string) => ({
  id,
  startsAt,
  categoryName,
});

describe("defaultSessionOf", () => {
  it("picks the evening one on a day with a morning session", () => {
    // The case that made this necessary: a 9am festival session must not
    // capture every link that meant the usual 7pm.
    const day = [s("morning", "09:00"), s("evening", "19:00")];
    expect(defaultSessionOf(day)?.id).toBe("evening");
  });

  it("picks the closest to 7pm, not the first or the last", () => {
    const day = [s("early", "06:00"), s("usual", "18:30"), s("late", "21:00")];
    expect(defaultSessionOf(day)?.id).toBe("usual");
  });

  it("takes the earlier when two are equally close", () => {
    const day = [s("six", "18:00"), s("eight", "20:00")];
    expect(defaultSessionOf(day)?.id).toBe("six");
  });

  it("treats a missing time as the usual evening", () => {
    // Session.startsAt is nullable and null means "the usual evening", so a
    // session with no time set must not sort as midnight and lose.
    const day = [s("dawn", "05:00"), s("untimed", null)];
    expect(defaultSessionOf(day)?.id).toBe("untimed");
  });

  it("handles the ordinary day of exactly one", () => {
    expect(defaultSessionOf([s("only", "19:00")])?.id).toBe("only");
  });

  it("has nothing to pick from an empty day", () => {
    expect(defaultSessionOf([])).toBeNull();
  });

  it("does not depend on the order it is given", () => {
    const day = [s("morning", "09:00"), s("evening", "19:00"), s("noon", "12:00")];
    expect(defaultSessionOf(day)?.id).toBe("evening");
    expect(defaultSessionOf([...day].reverse())?.id).toBe("evening");
  });
});

describe("sortByStart", () => {
  it("reads a day in the order it happens", () => {
    const day = [s("c", "19:00"), s("a", "07:30"), s("b", "12:00")];
    expect(sortByStart(day).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("places an untimed session where the usual evening is", () => {
    const day = [s("late", "21:00"), s("untimed", null), s("early", "09:00")];
    expect(sortByStart(day).map((x) => x.id)).toEqual(["early", "untimed", "late"]);
  });
});

describe("startMinutes", () => {
  it("defaults to the usual evening", () => {
    expect(startMinutes(null)).toBe(19 * 60);
    expect(startMinutes(USUAL_START)).toBe(19 * 60);
    expect(startMinutes("garbage")).toBe(19 * 60);
  });

  it("reads a real time", () => {
    expect(startMinutes("07:30")).toBe(7 * 60 + 30);
    expect(startMinutes("00:00")).toBe(0);
  });
});

describe("timeLabel", () => {
  it("says the time the way the group does", () => {
    expect(timeLabel("19:00")).toBe("7pm");
    expect(timeLabel("09:30")).toBe("9:30am");
    expect(timeLabel("12:00")).toBe("noon");
    expect(timeLabel("00:00")).toBe("midnight");
  });

  it("says nothing when there is no time", () => {
    expect(timeLabel(null)).toBe("");
    expect(timeLabel("")).toBe("");
  });
});

describe("sessionLabel", () => {
  it("leads with the time, because that is what tells two apart", () => {
    expect(sessionLabel(s("x", "09:00", "Festival"))).toBe("9am · Festival");
    expect(sessionLabel(s("x", "19:00"))).toBe("7pm");
    expect(sessionLabel(s("x", null))).toBe("session");
  });
});

describe("hasSeveral", () => {
  it("is the test for showing any of this at all", () => {
    expect(hasSeveral([])).toBe(false);
    expect(hasSeveral([s("a", "19:00")])).toBe(false);
    expect(hasSeveral([s("a", "09:00"), s("b", "19:00")])).toBe(true);
  });
});
