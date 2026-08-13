import { describe, it, expect } from "vitest";
import { resolveRosterView } from "@/lib/rosterView";

describe("resolveRosterView", () => {
  it("honours what the person chose when the URL says nothing", () => {
    // The case that was broken in production: a saved default of "list"
    // that never got a say, because the way in always carried ?view=calendar.
    expect(resolveRosterView(undefined, "list")).toBe("list");
    expect(resolveRosterView(null, "list")).toBe("list");
    expect(resolveRosterView("", "list")).toBe("list");
  });

  it("lets an explicit view win, so a shared link shows what was meant", () => {
    expect(resolveRosterView("calendar", "list")).toBe("calendar");
    expect(resolveRosterView("list", "calendar")).toBe("list");
  });

  it("falls back to the calendar for somebody who has never said", () => {
    expect(resolveRosterView(undefined, null)).toBe("calendar");
    expect(resolveRosterView(undefined, undefined)).toBe("calendar");
  });

  it("ignores rubbish in the URL rather than falling back past the person's choice", () => {
    expect(resolveRosterView("grid", "list")).toBe("list");
    expect(resolveRosterView("LIST", "list")).toBe("list");
    expect(resolveRosterView("grid", null)).toBe("calendar");
  });
});
