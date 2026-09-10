/**
 * lib/anchoredBox.ts — where to put a thing that hangs off another thing.
 *
 * Dropdowns and popovers are portalled to the body and positioned `fixed`, so
 * something has to work out the coordinates. This is that something, and it is
 * pure: the viewport is passed in rather than read, which is what makes the
 * awkward cases testable instead of only reproducible on a phone.
 *
 * Lifted out of `dropdownBox` in app/roster/[id]/SessionSingersGrid.tsx, which
 * had learned two lessons the hard way and was the only place that knew them:
 *
 *   - Height cannot be `viewportHeight - anchorBottom`. That collapses to
 *     nothing, or past nothing, when the anchor sits low on the screen — which
 *     it does the moment a phone keyboard is up.
 *   - It cannot always open downwards, or it opens into that keyboard.
 *
 * `visualViewport` rather than `innerHeight` for the same reason: on iOS the
 * keyboard shrinks the visual viewport and leaves the layout viewport alone, so
 * `innerHeight` cheerfully reports space that is underneath the keyboard.
 */

export type Viewport = { top: number; left: number; width: number; height: number };

/** Only the parts of a DOMRect this needs, so a test can hand it four numbers. */
export type AnchorRect = { top: number; bottom: number; left: number; width: number };

export type AnchoredBox = { left: number; top: number; width: number; maxHeight: number };

export type AnchoredBoxOptions = {
  /**
   * How wide to try to be. Defaults to the anchor's own width, which is what a
   * dropdown under a text field wants; a popover hanging off a small chip wants
   * to say a number instead.
   */
  preferredWidth?: number;
  /** Never render shorter than this — a couple of rows — even in a tight spot. */
  minHeight?: number;
  /** Never render taller than this. */
  maxHeight?: number;
  /** Space between the anchor and the box. */
  gap?: number;
  /** Space kept clear at the edges of the viewport. */
  margin?: number;
};

/** The live viewport, in the browser. Separated out so `anchoredBox` stays pure. */
export function currentViewport(): Viewport {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  return {
    top: vv?.offsetTop ?? 0,
    left: vv?.offsetLeft ?? 0,
    width: vv?.width ?? (typeof window !== "undefined" ? window.innerWidth : 0),
    height: vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0),
  };
}

/**
 * Where to draw a box hanging off `rect`, inside `view`.
 *
 * Below the anchor by default; above it when there is not enough room below AND
 * more room above. Clamped horizontally so it never hangs off either edge, and
 * narrowed if the viewport is smaller than the width asked for.
 */
export function anchoredBox(
  rect: AnchorRect,
  view: Viewport,
  opts: AnchoredBoxOptions = {},
): AnchoredBox {
  const gap = opts.gap ?? 6;
  const margin = opts.margin ?? 8;
  const min = opts.minHeight ?? 120;
  const max = opts.maxHeight ?? 320;

  const roomBelow = view.top + view.height - rect.bottom - gap - margin;
  const roomAbove = rect.top - view.top - gap - margin;

  /*
   * Flip only when below is genuinely too tight AND above is roomier. Both
   * halves matter: on a short screen every direction is tight, and flipping to
   * the worse one because the better one was not good enough is how a dropdown
   * ends up off the top of the page.
   */
  const flip = roomBelow < min && roomAbove > roomBelow;

  const maxHeight = Math.max(min, Math.min(max, flip ? roomAbove : roomBelow));
  const width = Math.min(opts.preferredWidth ?? rect.width, view.width - margin * 2);

  return {
    left: Math.max(view.left + margin, Math.min(rect.left, view.left + view.width - margin - width)),
    top: flip ? rect.top - gap - maxHeight : rect.bottom + gap,
    width,
    maxHeight,
  };
}
