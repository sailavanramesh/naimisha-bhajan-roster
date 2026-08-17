import { describe, it, expect } from "vitest";
import {
  decideHarmoniumNotice,
  describeChange,
  harmoniumChangeNotification,
  harmoniumChanges,
  harmoniumLines,
  harmoniumReadyNotification,
  isReadyForHarmonium,
  type HarmoniumLine,
} from "../lib/harmoniumNotice";

describe("isReadyForHarmonium", () => {
  it("is ready when every row has a bhajan and a pitch", () => {
    expect(
      isReadyForHarmonium([
        { bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
        { bhajan: "Sai Ram", pitch: "1 Madhyam / F" },
      ]),
    ).toBe(true);
  });

  /*
   * Partial is not useful. "Three of the four are decided" asks the reader to
   * keep checking, which is the thing this replaces.
   */
  it("is not ready while one row is missing its pitch", () => {
    expect(
      isReadyForHarmonium([
        { bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
        { bhajan: "Sai Ram", pitch: null },
      ]),
    ).toBe(false);
  });

  it("is not ready while one row is missing its bhajan", () => {
    expect(isReadyForHarmonium([{ bhajan: null, pitch: "2 Pancham / D" }])).toBe(false);
  });

  it("treats whitespace as missing, because it is", () => {
    expect(isReadyForHarmonium([{ bhajan: "  ", pitch: "2 Pancham / D" }])).toBe(false);
    expect(isReadyForHarmonium([{ bhajan: "Sai Ram", pitch: "   " }])).toBe(false);
  });

  it("an empty session is never ready", () => {
    expect(isReadyForHarmonium([])).toBe(false);
  });
});

describe("harmoniumLines", () => {
  it("orders by position and trims", () => {
    expect(
      harmoniumLines([
        { position: 2, bhajan: " Sai Ram ", pitch: " 1 Madhyam / F " },
        { position: 1, bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
      ]),
    ).toEqual([
      { position: 1, bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
      { position: 2, bhajan: "Sai Ram", pitch: "1 Madhyam / F" },
    ]);
  });
});

describe("harmoniumChanges", () => {
  const before: HarmoniumLine[] = [
    { position: 1, bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
    { position: 2, bhajan: "Sai Ram", pitch: "1 Madhyam / F" },
  ];

  it("sees nothing when nothing moved", () => {
    expect(harmoniumChanges(before, before)).toEqual([]);
  });

  it("sees a pitch move on its own", () => {
    const after = [before[0], { ...before[1], pitch: "3 Pancham / G" }];
    expect(harmoniumChanges(before, after)).toEqual([
      { kind: "pitch", position: 2, before: before[1], after: after[1] },
    ]);
  });

  it("sees a bhajan move on its own", () => {
    const after = [{ ...before[0], bhajan: "Ganesha Sharanam" }, before[1]];
    expect(harmoniumChanges(before, after)[0].kind).toBe("bhajan");
  });

  /* One edit as far as anybody in the hall is concerned, so one change. */
  it("counts a row whose bhajan and pitch both moved as one change", () => {
    const after = [{ position: 1, bhajan: "Ganesha Sharanam", pitch: "4 Pancham / A" }, before[1]];
    const changes = harmoniumChanges(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("both");
  });

  it("sees an added row and a removed one", () => {
    const added = [...before, { position: 3, bhajan: "Sai Bhajan", pitch: "2 Pancham / D" }];
    expect(harmoniumChanges(before, added)).toEqual([
      { kind: "added", position: 3, after: added[2] },
    ]);
    expect(harmoniumChanges(added, before)).toEqual([
      { kind: "removed", position: 3, before: added[2] },
    ]);
  });

  it("reports changes in running order", () => {
    const after = [
      { position: 1, bhajan: "Ganesha Sharanam", pitch: "2 Pancham / D" },
      { position: 2, bhajan: "Sai Ram", pitch: "5 Pancham / B" },
    ];
    expect(harmoniumChanges(before, after).map((c) => c.position)).toEqual([1, 2]);
  });
});

describe("describeChange", () => {
  const a: HarmoniumLine = { position: 2, bhajan: "Sai Ram", pitch: "1 Madhyam / F" };
  const b: HarmoniumLine = { position: 2, bhajan: "Sai Ram", pitch: "3 Pancham / G" };

  it("names the bhajan when only the shruti moved", () => {
    expect(describeChange({ kind: "pitch", position: 2, before: a, after: b })).toBe(
      "Sai Ram #2 is now at 3 Pancham / G, not 1 Madhyam / F",
    );
  });

  it("says what a slot became and what it was", () => {
    expect(
      describeChange({
        kind: "bhajan",
        position: 2,
        before: a,
        after: { position: 2, bhajan: "Sai Gayatri", pitch: "1 Madhyam / F" },
      }),
    ).toBe("#2 is now Sai Gayatri at 1 Madhyam / F, not Sai Ram");
  });

  it("says added and removed plainly", () => {
    expect(describeChange({ kind: "added", position: 3, after: a })).toContain("added");
    expect(describeChange({ kind: "removed", position: 3, before: a })).toContain("removed");
  });
});

describe("the notifications themselves", () => {
  const lines: HarmoniumLine[] = [
    { position: 1, bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
    { position: 2, bhajan: "Sai Ram", pitch: "1 Madhyam / F" },
  ];

  it("the summary lists every bhajan with its shruti", () => {
    const n = harmoniumReadyNotification({ sessionId: "s1", dateLabel: "Thursday 20 August", lines });
    expect(n.title).toBe("Thursday 20 August: bhajans and shrutis are set");
    expect(n.body).toBe("1. Jaya Ganesha — 2 Pancham / D\n2. Sai Ram — 1 Madhyam / F");
    expect(n.url).toBe("/roster/s1");
    expect(n.alert).toBe(true);
  });

  /*
   * One tag per session, so a change collapses the summary rather than sitting
   * beside it. Two unread notices that disagree is worse than either alone.
   */
  it("a change shares the summary's tag", () => {
    const a = harmoniumReadyNotification({ sessionId: "s1", dateLabel: "x", lines });
    const b = harmoniumChangeNotification({
      sessionId: "s1",
      dateLabel: "x",
      changes: [{ kind: "removed", position: 2, before: lines[1] }],
    });
    expect(b.tag).toBe(a.tag);
  });

  it("counts the changes in its title", () => {
    const one = harmoniumChangeNotification({
      sessionId: "s1",
      dateLabel: "Thursday",
      changes: [{ kind: "removed", position: 2, before: lines[1] }],
    });
    expect(one.title).toBe("Thursday: a bhajan has changed");

    const two = harmoniumChangeNotification({
      sessionId: "s1",
      dateLabel: "Thursday",
      changes: [
        { kind: "removed", position: 2, before: lines[1] },
        { kind: "added", position: 3, after: lines[0] },
      ],
    });
    expect(two.title).toBe("Thursday: 2 bhajans have changed");
  });
});

describe("decideHarmoniumNotice", () => {
  const ready: HarmoniumLine[] = [
    { position: 1, bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
    { position: 2, bhajan: "Sai Ram", pitch: "1 Madhyam / F" },
  ];
  const partial: HarmoniumLine[] = [
    { position: 1, bhajan: "Jaya Ganesha", pitch: "2 Pancham / D" },
    { position: 2, bhajan: "Sai Ram", pitch: "" },
  ];

  it("says nothing about a half-decided session nobody has been told about", () => {
    expect(decideHarmoniumNotice(null, partial)).toEqual({ send: "nothing", why: "not ready" });
  });

  it("sends the whole set the first time it is complete", () => {
    expect(decideHarmoniumNotice(null, ready)).toEqual({ send: "summary", lines: ready });
  });

  it("says nothing when nothing has moved since", () => {
    expect(decideHarmoniumNotice(ready, ready)).toEqual({ send: "nothing", why: "unchanged" });
  });

  it("sends the difference once the set has been announced", () => {
    const after = [ready[0], { ...ready[1], pitch: "3 Pancham / G" }];
    const decision = decideHarmoniumNotice(ready, after);
    expect(decision.send).toBe("changes");
    if (decision.send === "changes") {
      expect(decision.changes).toHaveLength(1);
      expect(decision.changes[0].kind).toBe("pitch");
      expect(decision.lines).toEqual(after);
    }
  });

  /*
   * The case that must not be swallowed. Somebody clearing a shruti at six
   * o'clock leaves the session incomplete — and is exactly what the harmonium
   * needs to hear about, so readiness stops being the gate once they have been
   * told.
   */
  it("still reports a change that leaves the session incomplete", () => {
    const decision = decideHarmoniumNotice(ready, partial);
    expect(decision.send).toBe("changes");
    if (decision.send === "changes") expect(decision.changes[0].kind).toBe("pitch");
  });

  it("reports a bhajan being removed after the set went out", () => {
    const decision = decideHarmoniumNotice(ready, [ready[0]]);
    expect(decision.send).toBe("changes");
    if (decision.send === "changes") expect(decision.changes[0].kind).toBe("removed");
  });

  it("an empty session nobody was told about stays quiet", () => {
    expect(decideHarmoniumNotice(null, [])).toEqual({ send: "nothing", why: "not ready" });
  });
});
