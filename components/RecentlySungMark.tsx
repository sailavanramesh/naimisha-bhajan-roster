"use client";

/**
 * components/RecentlySungMark.tsx — "we sang this before", said in one place.
 *
 * One component for the three places a bhajan gets chosen: the roster grid, the
 * assign page, and the set /build proposes. They asked the same question three
 * different ways before this existed — /build had a chip in raw `amber-400`
 * that said "sung recently" with no date, no count and no way through to
 * anything, which is both off-theme and less than the grid's.
 *
 * ## It opens rather than navigates
 *
 * Sailavan, 2026-09-10: the first version linked out, "could that history
 * section of a bhajan potentially link to the session its referencing... any
 * other suggestions to make it a nice workflow". Leaving the page is the wrong
 * move in the middle of building a roster — the grid holds unsaved edits, and
 * the question being asked ("when did we sing this?") deserves an answer where
 * you already are. So the chip opens a small panel with the actual dates, each
 * one a way into that evening, and the bhajan's own page is a link at the foot
 * for when the answer is not enough.
 *
 * ## Two states
 *
 * LOUD when it was sung inside the window: ochre lead, firmer edge. QUIET when
 * it was sung, but longer ago than that: no lead, no colour, just the date.
 * The quiet state is the point — without it, four months ago looked exactly
 * like never, and the absence of a marker meant nothing at all. With it, a row
 * carrying nothing has genuinely never been sung here.
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { anchoredBox, currentViewport } from "@/lib/anchoredBox";
import {
  formatSessionDate,
  recentlySungParts,
  recentlySungTitle,
  wasSungRecently,
  type SungBefore,
} from "@/lib/recentlySung";

export function RecentlySungMark({
  bhajanId,
  sung,
  className,
}: {
  bhajanId: string;
  sung: SungBefore | null | undefined;
  /** Extra classes on the chip — spacing differs between the three callers. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  /*
   * Close on Escape, on a click elsewhere, and on scroll or resize.
   *
   * Closing on scroll rather than following the anchor is deliberate: the
   * roster grid is a wide table inside its own horizontal scroller, so "follow
   * the anchor" means tracking two scroll containers and a resize observer to
   * keep a panel glued to a chip somebody has already read. Closing is both
   * simpler and what the existing bhajan dropdown does.
   */
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Focus goes back where it came from, or it lands at the top of the page
      // and a keyboard user loses their place in a fifteen-row grid.
      triggerRef.current?.focus();
    }
    function onDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if ((t as Element).closest?.(`[data-sung-panel="${panelId}"]`)) return;
      setOpen(false);
    }
    const close = () => setOpen(false);

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("resize", close);
    // Capture, so a scroll inside the table's own scroller is heard too.
    window.addEventListener("scroll", close, true);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, panelId]);

  if (!sung) return null;

  const recent = wasSungRecently(sung);
  const parts = recentlySungParts(sung);
  const title = recentlySungTitle(sung);

  /*
   * LOUD AND QUIET, AND WHY NEITHER IS A SIZE.
   *
   * Sailavan on the first version: "it blends in a bit too nicely now... but it
   * shouldn't become an eyesore just bcos it blends in." A bigger chip would
   * outrank the bhajan's own title, which is what the eye should land on first,
   * so the loud state spends its budget on ONE warm phrase — semibold `warn`
   * against a column of greys — plus a firmer edge and an arrow. The arrow
   * matters more than it looks: half of "it does not stand out" was that it did
   * not look like it went anywhere.
   *
   * `warn` and not `kumkum`: globals.css reserves kumkum for pitch deviation
   * and says so twice.
   */
  const chip = recent
    ? "border-warn/55 bg-warn/[0.12] hover:border-warn/80 hover:bg-warn/[0.2]"
    : "border-rule-surface bg-panel hover:border-rule-surface hover:bg-panel-hover";

  const box = rect ? anchoredBox(rect, currentViewport(), { preferredWidth: 288, maxHeight: 300 }) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const el = triggerRef.current;
          if (!el) return;
          setRect(el.getBoundingClientRect());
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        title={title}
        className={`group/sung flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-left text-[11px] transition-colors ${chip} ${className ?? ""}`}
      >
        <span aria-hidden className={recent ? "text-warn" : "text-on-surface-muted"}>
          ♪
        </span>
        <span className="whitespace-normal break-words">
          {parts.lead ? <span className="font-semibold text-warn">{parts.lead}</span> : null}
          <span className="text-on-surface-muted">
            {parts.lead ? " · " : ""}
            {parts.when}
            {parts.times ? ` · ${parts.times}` : ""}
          </span>
        </span>
        <span
          aria-hidden
          className={recent ? "text-warn/70 group-hover/sung:text-warn" : "text-on-surface-muted"}
        >
          {open ? "▴" : "▾"}
        </span>
        <span className="sr-only">— {title}</span>
      </button>

      {open && box
        ? createPortal(
            <div
              data-sung-panel={panelId}
              id={panelId}
              role="dialog"
              aria-label={title}
              style={{
                position: "fixed",
                left: box.left,
                top: box.top,
                width: box.width,
                maxHeight: box.maxHeight,
                zIndex: 9999,
              }}
              className="overflow-auto rounded-[12px] border border-rule-surface bg-panel p-2 text-[12px] shadow-xl"
            >
              <p className="px-1 pb-1 text-[11px] font-semibold text-on-surface">
                {recent ? "Sung recently" : "Last sung"}
              </p>

              <ul className="grid gap-0.5">
                {sung.occurrences.map((o, i) => (
                  <li
                    key={`${o.sessionId}-${o.singerName ?? ""}-${i}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-[8px] px-1 py-1 odd:bg-surface/60"
                  >
                    {/* The date is the way into that evening — same rule as the
                        bhajan page's history table. */}
                    <Link
                      href={`/roster/${o.sessionId}`}
                      className="whitespace-nowrap font-mono text-[11px] text-brass-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
                    >
                      {formatSessionDate(o.dateISO, { year: false })}
                    </Link>
                    <span className="min-w-0 text-on-surface-muted">
                      {o.singerName ?? "unassigned"}
                      {o.confirmedPitch ? ` · ${o.confirmedPitch}` : ""}
                    </span>
                  </li>
                ))}
              </ul>

              {sung.more > 0 ? (
                <p className="px-1 pt-1 text-[11px] text-on-surface-muted">
                  and {sung.more} more before that
                </p>
              ) : null}

              <Link
                href={`/bhajans/${bhajanId}#sung`}
                className="mt-1.5 block rounded-[8px] px-1 py-1 text-[11px] text-brass-ink underline underline-offset-2 hover:bg-panel-hover"
              >
                Open the bhajan&rsquo;s full history →
              </Link>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
