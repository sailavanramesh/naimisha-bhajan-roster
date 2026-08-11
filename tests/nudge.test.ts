import { describe, expect, it } from "vitest";
import {
  dueNudge,
  missingParts,
  nudgeNotification,
  NUDGE_HOUR,
  NUDGE_FINAL_HOUR,
  NUDGE_LATEST_HOUR,
} from "@/lib/notify";
import { melbourneHour } from "@/lib/dates";

describe("missingParts", () => {
  it("finds nothing missing on a complete row", () => {
    expect(missingParts({ bhajanTitle: "Bhaja Govindam", confirmedPitch: "2 Pancham / D" })).toEqual(
      [],
    );
  });

  it("names each gap", () => {
    expect(missingParts({ bhajanTitle: null, confirmedPitch: "2 Pancham / D" })).toEqual(["bhajan"]);
    expect(missingParts({ bhajanTitle: "Bhaja Govindam", confirmedPitch: null })).toEqual(["pitch"]);
    expect(missingParts({ bhajanTitle: null, confirmedPitch: null })).toEqual(["bhajan", "pitch"]);
  });

  it("treats whitespace as empty", () => {
    // A cleared text input submits "", and " " survives a stray keystroke.
    expect(missingParts({ bhajanTitle: "  ", confirmedPitch: "" })).toEqual(["bhajan", "pitch"]);
  });
});

describe("nudgeNotification", () => {
  const base = { sessionId: "s1", dateISO: "2026-08-13" };

  it("asks for both when both are missing", () => {
    const n = nudgeNotification({ ...base, missing: ["bhajan", "pitch"] });
    expect(n.body).toMatch(/bhajan and confirm your pitch/);
    expect(n.alert).toBe(true);
    expect(n.url).toBe("/roster/s1");
  });

  it("names the bhajan when only the pitch is missing", () => {
    const n = nudgeNotification({
      ...base,
      missing: ["pitch"],
      bhajanTitle: "Bhaja Govindam",
    });
    expect(n.body).toContain("Bhaja Govindam");
    expect(n.body).not.toMatch(/choose your bhajan/i);
  });

  it("does not ask for a pitch that is already there", () => {
    const n = nudgeNotification({
      ...base,
      missing: ["bhajan"],
      confirmedPitch: "2 Pancham / D",
    });
    expect(n.body).toContain("2 Pancham / D");
    expect(n.body).toMatch(/Which bhajan\?/);
  });

  it("still reads sensibly when the known half is absent", () => {
    const n = nudgeNotification({ ...base, missing: ["pitch"], bhajanTitle: null });
    expect(n.body).toMatch(/Confirm your pitch/);
    expect(n.body).not.toContain("null");
  });

  it("collapses onto one tag so the last one replaces the first", () => {
    const first = nudgeNotification({ ...base, missing: ["pitch"] });
    const final = nudgeNotification({ ...base, missing: ["pitch"], final: true });
    expect(final.tag).toBe(first.tag);
    expect(final.title).toMatch(/Last reminder/);
    expect(first.title).not.toMatch(/Last reminder/);
  });
});

describe("dueNudge", () => {
  it("says nothing before 3pm", () => {
    expect(dueNudge(0, [])).toBeNull();
    expect(dueNudge(NUDGE_HOUR - 1, [])).toBeNull();
  });

  it("sends the first one from 3pm", () => {
    expect(dueNudge(NUDGE_HOUR, [])).toBe("nudge");
    expect(dueNudge(NUDGE_FINAL_HOUR - 1, [])).toBe("nudge");
  });

  it("does not repeat the first one within its window", () => {
    expect(dueNudge(NUDGE_HOUR, ["nudge"])).toBeNull();
    expect(dueNudge(NUDGE_FINAL_HOUR - 1, ["nudge"])).toBeNull();
  });

  it("sends the final one from 5pm, even to somebody who got the first", () => {
    expect(dueNudge(NUDGE_FINAL_HOUR, ["nudge"])).toBe("nudge_final");
  });

  it("sends the final one when the 3pm run was missed altogether", () => {
    // The whole reason the 5pm check does not depend on the 3pm one having run.
    expect(dueNudge(NUDGE_FINAL_HOUR, [])).toBe("nudge_final");
  });

  it("never sends a third", () => {
    expect(dueNudge(NUDGE_FINAL_HOUR, ["nudge", "nudge_final"])).toBeNull();
    expect(dueNudge(NUDGE_LATEST_HOUR - 1, ["nudge_final"])).toBeNull();
  });

  it("stops once people are on their way to the hall", () => {
    expect(dueNudge(NUDGE_LATEST_HOUR, [])).toBeNull();
    expect(dueNudge(23, [])).toBeNull();
  });

  it("ignores notices of other kinds", () => {
    expect(dueNudge(NUDGE_HOUR, ["rostered", "published"])).toBe("nudge");
  });
});

describe("melbourneHour", () => {
  it("reads 3pm Melbourne on both sides of daylight saving", () => {
    // Melbourne is UTC+10 in July and UTC+11 in January. Both of these are
    // 15:00 in the hall; neither is 15:00 UTC.
    expect(melbourneHour(new Date("2026-07-16T05:00:00Z"))).toBe(15);
    expect(melbourneHour(new Date("2026-01-15T04:00:00Z"))).toBe(15);
  });

  it("returns 0 at midnight, not 24", () => {
    expect(melbourneHour(new Date("2026-07-16T14:00:00Z"))).toBe(0);
  });
});
