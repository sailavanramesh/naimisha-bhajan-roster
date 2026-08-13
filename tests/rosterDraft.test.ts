import { describe, it, expect } from "vitest";
import {
  describeChanges,
  isDirty,
  draftKey,
  readDraft,
  restorePlan,
  ageLabel,
  DRAFT_TTL_MS,
  type DraftRow,
} from "@/lib/rosterDraft";

const row = (over: Partial<DraftRow> & { id: string }): DraftRow => ({
  singerId: "s1",
  singerName: "Ashwin",
  bhajanId: null,
  bhajanTitle: null,
  festivalBhajanTitle: null,
  confirmedPitch: null,
  alternativeTablaPitch: null,
  ...over,
});

describe("describeChanges", () => {
  it("says nothing when nothing changed", () => {
    const rows = [row({ id: "a", confirmedPitch: "2 Pancham / D" })];
    expect(describeChanges(rows, rows)).toEqual([]);
    expect(isDirty(rows, rows)).toBe(false);
  });

  it("names the singer and both pitches", () => {
    const before = [row({ id: "a", confirmedPitch: "2 Pancham / D" })];
    const after = [row({ id: "a", confirmedPitch: "5 Pancham / G" })];
    expect(describeChanges(before, after)).toEqual([
      "Ashwin: pitch 2 Pancham / D → 5 Pancham / G",
    ]);
    expect(isDirty(before, after)).toBe(true);
  });

  it("treats blank and absent as the same, so whitespace is not a change", () => {
    const before = [row({ id: "a", confirmedPitch: null, bhajanTitle: "" })];
    const after = [row({ id: "a", confirmedPitch: "  ", bhajanTitle: null })];
    expect(describeChanges(before, after)).toEqual([]);
  });

  it("shows an em dash where there was nothing", () => {
    const before = [row({ id: "a" })];
    const after = [row({ id: "a", confirmedPitch: "1 Pancham / C" })];
    expect(describeChanges(before, after)).toEqual(["Ashwin: pitch — → 1 Pancham / C"]);
  });

  it("describes a bhajan change, free text and masterlist alike", () => {
    const before = [row({ id: "a", bhajanTitle: "Ganesha Sharanam" })];
    const after = [row({ id: "a", bhajanId: "b2", bhajanTitle: "Sai Ram Sai Ram" })];
    expect(describeChanges(before, after)).toEqual([
      "Ashwin: Ganesha Sharanam → Sai Ram Sai Ram",
    ]);
  });

  it("describes a swapped singer from both sides", () => {
    const before = [row({ id: "a", singerId: "s1", singerName: "Ashwin" })];
    const after = [row({ id: "a", singerId: "s2", singerName: "Prasanna" })];
    expect(describeChanges(before, after)).toEqual(["Ashwin replaced by Prasanna"]);
  });

  it("reports an added row with its bhajan, and a removed one by name", () => {
    const before = [row({ id: "a" })];
    const after = [
      row({ id: "a" }),
      row({ id: "new_1", singerName: "Jothsna", bhajanTitle: "Jaya Ganesha" }),
    ];
    expect(describeChanges(before, after)).toEqual(["Jothsna added, singing Jaya Ganesha"]);
    expect(describeChanges(after, before)).toEqual(["Jothsna removed"]);
  });

  it("calls a row with no singer an empty row rather than naming nobody", () => {
    const before: DraftRow[] = [];
    const after = [row({ id: "new_1", singerId: "", singerName: null })];
    expect(describeChanges(before, after)).toEqual(["An empty row added"]);
  });

  it("notices reordering without naming which row moved", () => {
    const a = row({ id: "a", singerName: "Ashwin" });
    const b = row({ id: "b", singerName: "Prasanna" });
    expect(describeChanges([a, b], [b, a])).toEqual(["The order of the bhajans changed"]);
  });

  it("does not call an add a reorder", () => {
    const a = row({ id: "a" });
    const b = row({ id: "b", singerName: "Prasanna" });
    expect(describeChanges([a], [a, b])).toEqual(["Prasanna added"]);
  });

  it("shortens a long bhajan title so the dialog stays readable on a phone", () => {
    const before = [row({ id: "a", bhajanTitle: null })];
    const after = [
      row({ id: "a", bhajanTitle: "Vanamali Vasudeva Jaganmohana Radha Ramana Govinda" }),
    ];
    const [line] = describeChanges(before, after);
    expect(line.length).toBeLessThan(60);
    expect(line).toContain("…");
  });

  it("does not count the tabla twice when it merely followed the pitch", () => {
    // Tabla pitch is Sa + 7 semitones, so choosing a pitch moves it too.
    const tablaFor = (p: string | null) =>
      p === "2 Pancham / D" ? "3 Pancham / A" : p === "5 Pancham / G" ? "6 Pancham / D" : null;

    const before = [row({ id: "a", confirmedPitch: "2 Pancham / D", alternativeTablaPitch: "3 Pancham / A" })];
    const after = [row({ id: "a", confirmedPitch: "5 Pancham / G", alternativeTablaPitch: "6 Pancham / D" })];

    expect(describeChanges(before, after, { tablaFor })).toEqual([
      "Ashwin: pitch 2 Pancham / D → 5 Pancham / G",
    ]);
  });

  it("still reports a tabla the singer overrode by hand", () => {
    const tablaFor = (p: string | null) => (p === "5 Pancham / G" ? "6 Pancham / D" : null);
    const before = [row({ id: "a", confirmedPitch: "2 Pancham / D", alternativeTablaPitch: "3 Pancham / A" })];
    const after = [row({ id: "a", confirmedPitch: "5 Pancham / G", alternativeTablaPitch: "9 Pancham / E" })];

    expect(describeChanges(before, after, { tablaFor })).toHaveLength(2);
  });

  it("reports a tabla changed on its own, pitch untouched", () => {
    const tablaFor = () => null;
    const before = [row({ id: "a", confirmedPitch: "2 Pancham / D", alternativeTablaPitch: "3 Pancham / A" })];
    const after = [row({ id: "a", confirmedPitch: "2 Pancham / D", alternativeTablaPitch: "9 Pancham / E" })];

    expect(describeChanges(before, after, { tablaFor })).toEqual([
      "Ashwin: tabla 3 Pancham / A → 9 Pancham / E",
    ]);
  });

  it("assumes the tabla followed when there is no map to check against", () => {
    const before = [row({ id: "a", confirmedPitch: "2 Pancham / D", alternativeTablaPitch: "3 Pancham / A" })];
    const after = [row({ id: "a", confirmedPitch: "5 Pancham / G", alternativeTablaPitch: "6 Pancham / D" })];
    expect(describeChanges(before, after)).toHaveLength(1);
  });

  it("lists several changes to one row separately", () => {
    const before = [row({ id: "a", bhajanTitle: "Ganesha Sharanam" })];
    const after = [
      row({
        id: "a",
        bhajanTitle: "Sai Ram",
        confirmedPitch: "3 Pancham / D#",
        alternativeTablaPitch: "5 Pancham / G",
      }),
    ];
    // Bhajan and pitch. The tabla came along with the pitch, as above.
    expect(describeChanges(before, after)).toHaveLength(2);
  });
});

describe("readDraft", () => {
  const now = 1_700_000_000_000;
  const good = JSON.stringify({
    savedAt: now - 60_000,
    rows: [{ id: "a", singerId: "s1", confirmedPitch: "2 Pancham / D" }],
    base: [{ id: "a", singerId: "s1", confirmedPitch: "6 Pancham / A" }],
  });

  it("reads back what was stored", () => {
    const d = readDraft(good, now);
    expect(d?.rows).toHaveLength(1);
    expect(d?.rows[0].confirmedPitch).toBe("2 Pancham / D");
    // Absent fields come back as null rather than undefined.
    expect(d?.rows[0].bhajanTitle).toBeNull();
  });

  it("remembers what the edits were made to", () => {
    expect(readDraft(good, now)?.base[0].confirmedPitch).toBe("6 Pancham / A");
  });

  it("refuses a draft with no record of what it was edited from", () => {
    // Without it, a stale draft cannot be told apart from somebody else's
    // newer save, and restoring would put the stale pitch back over the top.
    const noBase = JSON.stringify({ savedAt: now, rows: [{ id: "a", singerId: "s1" }] });
    expect(readDraft(noBase, now)).toBeNull();
  });

  it("returns null for nothing stored, rubbish, or the wrong shape", () => {
    expect(readDraft(null, now)).toBeNull();
    expect(readDraft("not json", now)).toBeNull();
    expect(readDraft("[]", now)).toBeNull();
    expect(readDraft(JSON.stringify({ savedAt: now }), now)).toBeNull();
    expect(readDraft(JSON.stringify({ rows: [] }), now)).toBeNull();
    expect(readDraft(JSON.stringify({ savedAt: now, rows: [{ id: "a" }], base: [] }), now)).toBeNull();
  });

  it("refuses a draft older than the week it is kept for", () => {
    const stale = JSON.stringify({ savedAt: now - DRAFT_TTL_MS - 1, rows: [], base: [] });
    expect(readDraft(stale, now)).toBeNull();
  });

  it("refuses a draft from the future, which means the clock moved", () => {
    const future = JSON.stringify({ savedAt: now + 4 * 60 * 60 * 1000, rows: [], base: [] });
    expect(readDraft(future, now)).toBeNull();
  });

  it("keys drafts per session so two sessions do not share one", () => {
    expect(draftKey("abc")).toBe("roster-draft:abc");
    expect(draftKey("abc")).not.toBe(draftKey("abd"));
  });
});

describe("restorePlan", () => {
  it("puts back a change nobody else has touched", () => {
    const base = [row({ id: "a", confirmedPitch: "2 Pancham / D" })];
    const draft = [row({ id: "a", confirmedPitch: "5 Pancham / G" })];
    const plan = restorePlan(draft, base, base);
    expect(plan.rows[0].confirmedPitch).toBe("5 Pancham / G");
    expect(plan.conflicts).toEqual([]);
  });

  it("keeps somebody else's saved pitch rather than overwriting it", () => {
    const base = [row({ id: "a", confirmedPitch: "2 Pancham / D" })];
    const draft = [row({ id: "a", confirmedPitch: "5 Pancham / G" })];
    const current = [row({ id: "a", confirmedPitch: "1 Pancham / C" })];

    const plan = restorePlan(draft, base, current);
    expect(plan.rows[0].confirmedPitch).toBe("1 Pancham / C");
    expect(plan.conflicts).toHaveLength(1);
    // Names the singer once, then what the draft wanted.
    expect(plan.conflicts[0]).toBe(
      "Ashwin: kept the saved version — your draft had pitch 2 Pancham / D → 5 Pancham / G",
    );
  });

  it("leaves rows the draft never changed exactly as the database has them", () => {
    const base = [row({ id: "a" }), row({ id: "b", singerName: "Prasanna" })];
    const draft = [row({ id: "a", confirmedPitch: "5 Pancham / G" }), row({ id: "b", singerName: "Prasanna" })];
    const current = [row({ id: "a" }), row({ id: "b", singerName: "Prasanna", confirmedPitch: "7 Pancham / A#" })];

    const plan = restorePlan(draft, base, current);
    expect(plan.rows[1].confirmedPitch).toBe("7 Pancham / A#");
    expect(plan.conflicts).toEqual([]);
  });

  it("drops a row that has since been deleted", () => {
    const base = [row({ id: "a" }), row({ id: "b" })];
    const draft = [row({ id: "a", confirmedPitch: "5 Pancham / G" }), row({ id: "b" })];
    const plan = restorePlan(draft, base, [row({ id: "a" })]);
    expect(plan.rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("brings back a row that was added but never saved", () => {
    const base = [row({ id: "a" })];
    const draft = [row({ id: "a" }), row({ id: "new_1", singerName: "Jothsna" })];
    const plan = restorePlan(draft, base, base);
    expect(plan.rows.map((r) => r.id)).toEqual(["a", "new_1"]);
  });
});

describe("ageLabel", () => {
  const now = 1_700_000_000_000;
  it("reads the way somebody would say it", () => {
    expect(ageLabel(now - 10_000, now)).toBe("just now");
    expect(ageLabel(now - 60_000, now)).toBe("a minute ago");
    expect(ageLabel(now - 12 * 60_000, now)).toBe("12 minutes ago");
    expect(ageLabel(now - 60 * 60_000, now)).toBe("an hour ago");
    expect(ageLabel(now - 5 * 60 * 60_000, now)).toBe("5 hours ago");
    expect(ageLabel(now - 25 * 60 * 60_000, now)).toBe("yesterday");
    expect(ageLabel(now - 3 * 24 * 60 * 60_000, now)).toBe("3 days ago");
  });
});
