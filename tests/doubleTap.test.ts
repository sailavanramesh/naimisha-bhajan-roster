import { describe, expect, it } from "vitest";
import { countTap, DOUBLE_TAP_MS, type Tap } from "@/lib/doubleTap";

describe("one tap selects, two open", () => {
  it("says nothing on the first tap", () => {
    const r = countTap(null, "2026-08-31", 1000);
    expect(r.open).toBe(false);
    expect(r.next).toEqual({ date: "2026-08-31", at: 1000 });
  });

  it("opens on a second tap on the same day, inside the window", () => {
    const first = countTap(null, "2026-08-31", 1000);
    const second = countTap(first.next, "2026-08-31", 1000 + DOUBLE_TAP_MS - 1);
    expect(second.open).toBe(true);
  });

  it("does not open when the second tap is too late", () => {
    const first = countTap(null, "2026-08-31", 1000);
    const second = countTap(first.next, "2026-08-31", 1000 + DOUBLE_TAP_MS);
    expect(second.open).toBe(false);
    // …and it becomes the first tap of a new pair rather than being thrown away.
    expect(second.next).toEqual({ date: "2026-08-31", at: 1000 + DOUBLE_TAP_MS });
  });

  it("does not open when the two taps are on different days", () => {
    // Scanning across a week is a run of quick taps on neighbouring cells. Not
    // one of them may open anything.
    const a = countTap(null, "2026-08-30", 1000);
    const b = countTap(a.next, "2026-08-31", 1050);
    const c = countTap(b.next, "2026-09-01", 1100);
    expect([a.open, b.open, c.open]).toEqual([false, false, false]);
    expect(c.next).toEqual({ date: "2026-09-01", at: 1100 });
  });

  it("a third quick tap does not open it a second time", () => {
    const a = countTap(null, "2026-08-31", 1000);
    const b = countTap(a.next, "2026-08-31", 1100);
    const c = countTap(b.next, "2026-08-31", 1200);
    expect([a.open, b.open, c.open]).toEqual([false, true, false]);
    // The third tap starts a fresh pair, so a fourth still works.
    const d = countTap(c.next, "2026-08-31", 1300);
    expect(d.open).toBe(true);
  });

  it("counts a pair that arrives at the same millisecond", () => {
    const prev: Tap = { date: "2026-08-31", at: 1000 };
    expect(countTap(prev, "2026-08-31", 1000).open).toBe(true);
  });
});
