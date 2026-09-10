import { describe, expect, it } from "vitest";
import { anchoredBox, type AnchorRect, type Viewport } from "@/lib/anchoredBox";

/** A roomy desktop viewport. */
const desk: Viewport = { top: 0, left: 0, width: 1200, height: 900 };

/** A field near the top of the page. */
const high: AnchorRect = { top: 100, bottom: 140, left: 300, width: 240 };

describe("anchoredBox", () => {
  it("hangs below the anchor, at its width", () => {
    const box = anchoredBox(high, desk);
    expect(box.top).toBe(146); // bottom + gap
    expect(box.left).toBe(300);
    expect(box.width).toBe(240);
  });

  it("takes a preferred width instead of the anchor's", () => {
    expect(anchoredBox(high, desk, { preferredWidth: 320 }).width).toBe(320);
  });

  /*
   * The lesson from the phone keyboard. A field low on the screen has no room
   * below it, so the box has to go above rather than render at zero height —
   * or, worse, at a negative one.
   */
  it("flips above when there is no room below", () => {
    const low: AnchorRect = { top: 800, bottom: 840, left: 20, width: 200 };
    const box = anchoredBox(low, desk);
    expect(box.top).toBeLessThan(low.top);
    expect(box.maxHeight).toBeGreaterThanOrEqual(120);
  });

  /*
   * Both halves of the flip condition matter. On a short screen everything is
   * tight, and flipping into the WORSE direction because the better one was
   * merely not good enough is how a dropdown leaves the top of the page.
   */
  it("stays below when above is even tighter", () => {
    const shortView: Viewport = { top: 0, left: 0, width: 400, height: 300 };
    const nearTop: AnchorRect = { top: 30, bottom: 70, left: 10, width: 200 };
    const box = anchoredBox(nearTop, shortView);
    expect(box.top).toBeGreaterThan(nearTop.bottom);
  });

  it("never renders shorter than the minimum, however tight it is", () => {
    const tiny: Viewport = { top: 0, left: 0, width: 320, height: 120 };
    const box = anchoredBox({ top: 60, bottom: 100, left: 10, width: 200 }, tiny);
    expect(box.maxHeight).toBe(120);
  });

  it("clamps to the right edge rather than hanging off it", () => {
    const box = anchoredBox({ top: 100, bottom: 140, left: 1150, width: 40 }, desk, {
      preferredWidth: 300,
    });
    expect(box.left + box.width).toBeLessThanOrEqual(desk.width - 8);
  });

  it("clamps to the left edge too", () => {
    const box = anchoredBox({ top: 100, bottom: 140, left: -50, width: 200 }, desk);
    expect(box.left).toBe(8);
  });

  it("narrows to fit a viewport smaller than the width asked for", () => {
    const phone: Viewport = { top: 0, left: 0, width: 375, height: 800 };
    const box = anchoredBox({ top: 100, bottom: 140, left: 10, width: 100 }, phone, {
      preferredWidth: 400,
    });
    expect(box.width).toBe(375 - 16);
    expect(box.left).toBe(8);
  });

  /*
   * On iOS the keyboard shrinks the VISUAL viewport and offsets it, leaving the
   * layout viewport alone. An offset viewport must not be treated as starting
   * at zero, or the box is placed behind the keyboard.
   */
  it("respects an offset visual viewport", () => {
    const shifted: Viewport = { top: 200, left: 0, width: 375, height: 400 };
    const box = anchoredBox({ top: 250, bottom: 290, left: 10, width: 200 }, shifted);
    expect(box.top).toBe(296);
    expect(box.maxHeight).toBeLessThanOrEqual(600 - 290 - 6 - 8);
  });
});
