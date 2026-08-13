import { describe, it, expect } from "vitest";
import {
  categoryInitials,
  kindImageSrc,
  dayMarks,
  dayKindLabel,
  fullnessStep,
  sessionCountLabel,
  dayTooltip,
  type KindLite,
} from "@/lib/categoryMark";

const kind = (id: string, name: string, v: number | null = 1): KindLite => ({ id, name, v });

describe("categoryInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(categoryInitials("Routine Thursday")).toBe("RT");
    expect(categoryInitials("Sathyam Shivam Sundaram")).toBe("SS");
    expect(categoryInitials("Ashada Ekadasi")).toBe("AE");
  });

  it("takes two letters from a single word", () => {
    expect(categoryInitials("Ramayana")).toBe("RA");
    expect(categoryInitials("Ekadasi")).toBe("EK");
  });

  it("reads through punctuation the group actually uses", () => {
    expect(categoryInitials("Q&A")).toBe("QA");
    expect(categoryInitials("Bhajan/Study")).toBe("BS");
  });

  it("never returns nothing", () => {
    expect(categoryInitials("")).toBe("?");
    expect(categoryInitials("   ")).toBe("?");
    expect(categoryInitials("!!!")).toBe("?");
  });
});

describe("kindImageSrc", () => {
  it("is versioned, so a changed picture is not served from an old cache", () => {
    expect(kindImageSrc(kind("abc", "Ramayana", 1699))).toBe(
      "/api/session-kinds/abc/image?v=1699",
    );
  });

  it("is null for a kind with no picture, so nothing points at a 404", () => {
    expect(kindImageSrc(kind("abc", "Routine Thursday", null))).toBeNull();
  });
});

describe("dayMarks", () => {
  const kinds = new Map([
    ["r", kind("r", "Ramayana", 7)],
    ["t", kind("t", "Routine Thursday", 8)],
  ]);

  it("gives one mark per session kind", () => {
    const { marks, overflow } = dayMarks([{ categoryId: "r" }], kinds);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ name: "Ramayana", initials: "RA", count: 1 });
    expect(marks[0].src).toBe("/api/session-kinds/r/image?v=7");
    expect(overflow).toBe(0);
  });

  it("collapses two sessions of the same kind into one mark with a count", () => {
    const { marks } = dayMarks([{ categoryId: "r" }, { categoryId: "r" }], kinds);
    expect(marks).toHaveLength(1);
    expect(marks[0].count).toBe(2);
  });

  it("keeps two different kinds apart, in the order the day holds them", () => {
    const { marks } = dayMarks([{ categoryId: "t" }, { categoryId: "r" }], kinds);
    expect(marks.map((m) => m.name)).toEqual(["Routine Thursday", "Ramayana"]);
  });

  it("falls back to initials for a kind that has no picture", () => {
    const noPic = new Map([["t", kind("t", "Routine Thursday", null)]]);
    const { marks } = dayMarks([{ categoryId: "t" }], noPic);
    expect(marks[0]).toMatchObject({ src: null, initials: "RT", name: "Routine Thursday" });
  });

  it("shows nothing for a session with no kind set", () => {
    // The bar under the cell already says a session is there.
    const { marks } = dayMarks([{ categoryId: null }, { categoryId: undefined }], kinds);
    expect(marks).toEqual([]);
  });

  it("counts what will not fit rather than dropping it silently", () => {
    const many = new Map([
      ...kinds,
      ["e", kind("e", "Ekadasi", 1)],
      ["q", kind("q", "Q&A", 2)],
    ]);
    const { marks, overflow } = dayMarks(
      [{ categoryId: "r" }, { categoryId: "t" }, { categoryId: "e" }, { categoryId: "q" }],
      many,
      2,
    );
    expect(marks).toHaveLength(2);
    expect(overflow).toBe(2);
  });

  it("still shows a kind the client was never told about", () => {
    // A month fetched after a new kind was created, say.
    const { marks } = dayMarks([{ categoryId: "z", categoryName: "New Year" }], kinds);
    expect(marks[0]).toMatchObject({ name: "New Year", initials: "NY", src: null });
  });
});

describe("dayKindLabel", () => {
  const kinds = new Map([
    ["r", kind("r", "Ramayana", 1)],
    ["t", kind("t", "Routine Thursday", 1)],
  ]);

  it("names the kind when there is one", () => {
    const { marks, overflow } = dayMarks([{ categoryId: "r" }], kinds);
    expect(dayKindLabel(marks, overflow)).toBe("Ramayana");
  });

  it("says how many more when the day holds several", () => {
    const { marks, overflow } = dayMarks([{ categoryId: "r" }, { categoryId: "t" }], kinds);
    expect(dayKindLabel(marks, overflow)).toBe("Ramayana +1");
  });

  it("counts the ones that did not fit as well", () => {
    const many = new Map([...kinds, ["e", kind("e", "Ekadasi", 1)]]);
    const { marks, overflow } = dayMarks(
      [{ categoryId: "r" }, { categoryId: "t" }, { categoryId: "e" }],
      many,
      2,
    );
    expect(dayKindLabel(marks, overflow)).toBe("Ramayana +2");
  });

  it("is empty when no session that day has a kind", () => {
    expect(dayKindLabel([], 0)).toBe("");
  });
});

describe("fullnessStep", () => {
  it("uses the same steps the coloured bar used", () => {
    expect(fullnessStep(0)).toBe(0);
    expect(fullnessStep(1)).toBe(1);
    expect(fullnessStep(3)).toBe(1);
    expect(fullnessStep(4)).toBe(2);
    expect(fullnessStep(7)).toBe(2);
    expect(fullnessStep(8)).toBe(3);
    expect(fullnessStep(20)).toBe(3);
  });

  it("treats a session with nobody on it as empty, not as full", () => {
    expect(fullnessStep(0)).toBe(0);
  });
});

describe("sessionCountLabel", () => {
  it("says nothing for the ordinary single session", () => {
    expect(sessionCountLabel([{}])).toBe("");
    expect(sessionCountLabel([])).toBe("");
  });

  it("says how many when a day holds more than one", () => {
    // Two sessions of the same kind collapse to one mark, so without this a
    // day with a morning and an evening would read as one session.
    expect(sessionCountLabel([{}, {}])).toBe("×2");
    expect(sessionCountLabel([{}, {}, {}])).toBe("×3");
  });
});

describe("dayTooltip", () => {
  const kinds = new Map([["r", kind("r", "Ramayana", 1)]]);

  it("names the kind and counts the bhajans", () => {
    const { marks } = dayMarks([{ categoryId: "r" }], kinds);
    expect(dayTooltip(marks, 3, 1)).toBe("Ramayana · 3 bhajans");
    expect(dayTooltip(marks, 1, 1)).toBe("Ramayana · 1 bhajan");
  });

  it("counts the sessions when there are several", () => {
    const { marks } = dayMarks([{ categoryId: "r" }, { categoryId: "r" }], kinds);
    expect(dayTooltip(marks, 7, 2)).toBe("Ramayana ×2 · 2 sessions · 7 bhajans");
  });

  it("still says something for a session with no kind set", () => {
    expect(dayTooltip([], 3, 1)).toBe("3 bhajans");
  });

  it("is empty when the day holds no session", () => {
    expect(dayTooltip([], 0, 0)).toBe("");
  });
});
