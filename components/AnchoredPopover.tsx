"use client";

/**
 * components/AnchoredPopover.tsx — a panel that hangs off a control.
 *
 * The fiddly half of a popover is not the markup, it is everything around it:
 * portalling out so a narrow table cell cannot clip it, positioning against the
 * VISUAL viewport (lib/anchoredBox.ts), and the four ways it has to close —
 * Escape, a click elsewhere, a scroll, a resize — with focus handed back to the
 * control that opened it.
 *
 * Written once here because it was about to be written a third time. The
 * bhajan dropdown in the roster grid had the positioning, the recently-sung
 * marker had the dismissal, and the chorus mic picker needed both.
 *
 * `onClose` rather than owning the state: which control is open belongs to the
 * caller, and two of the three callers need to know for their own `aria-expanded`.
 */

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { anchoredBox, currentViewport, type AnchoredBoxOptions } from "@/lib/anchoredBox";
import { useRef, useState } from "react";

/**
 * Trigger wiring, for the common case.
 *
 * The rect is captured ON OPEN rather than tracked, which is the same trade the
 * bhajan dropdown makes: the panel closes on scroll instead of following its
 * anchor through two nested scroll containers.
 */
export function useAnchor<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [open, setOpen] = useState(false);

  return {
    ref,
    rect,
    open,
    toggle() {
      const el = ref.current;
      if (!el) return;
      setRect(el.getBoundingClientRect());
      setOpen((v) => !v);
    },
    /**
     * Focus goes back to the trigger by default. In a fifteen-row grid, losing
     * the caret to the top of the page is a real cost for anybody on a
     * keyboard — and it is the thing every hand-rolled popover forgets.
     */
    close(refocus = true) {
      setOpen(false);
      if (refocus) ref.current?.focus();
    },
  };
}

export function AnchoredPopover({
  open,
  anchor,
  onClose,
  label,
  id,
  children,
  box,
  className,
}: {
  open: boolean;
  /** Where the trigger was when it was pressed. */
  anchor: DOMRect | null;
  /** Escape, a click elsewhere, a scroll or a resize. `true` = restore focus. */
  onClose: (refocus: boolean) => void;
  /** What the panel is, for screen readers. */
  label: string;
  id?: string;
  box?: AnchoredBoxOptions;
  className?: string;
  children: ReactNode;
}) {
  const fallbackId = useId();
  const panelId = id ?? fallbackId;

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(true);
    }
    function onDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      // Inside the panel, or on the trigger (which toggles itself shut).
      if ((t as Element).closest?.(`[data-anchored-popover="${panelId}"]`)) return;
      if ((t as Element).closest?.(`[aria-controls="${panelId}"]`)) return;
      onClose(false);
    }
    /*
     * Closing on scroll, but NOT on the panel's own scroll.
     *
     * The listener is in the CAPTURE phase so that a scroll inside the roster
     * grid's table scroller is heard — and that same reach means it hears the
     * panel scrolling itself. With eleven names capped at 300px, reaching the
     * last one shut the picker as you scrolled towards it. Caught by
     * scripts/smokeChorusPicker.mjs, whose `check()` scrolls a name into view
     * before ticking it; it would have been maddening on a phone and invisible
     * on a desk, where the whole list fits.
     */
    const shut = (e?: Event) => {
      const t = e?.target as Element | null;
      if (t?.closest?.(`[data-anchored-popover="${panelId}"]`)) return;
      onClose(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("resize", shut);
    // Capture, so a scroll inside a table's own scroller is heard too.
    window.addEventListener("scroll", shut, true);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("resize", shut);
      window.removeEventListener("scroll", shut, true);
    };
  }, [open, panelId, onClose]);

  if (!open || !anchor) return null;

  const at = anchoredBox(anchor, currentViewport(), box);

  return createPortal(
    <div
      data-anchored-popover={panelId}
      id={panelId}
      role="dialog"
      aria-label={label}
      style={{
        position: "fixed",
        left: at.left,
        top: at.top,
        width: at.width,
        maxHeight: at.maxHeight,
        zIndex: 9999,
      }}
      className={`overflow-auto rounded-[12px] border border-rule-surface bg-panel shadow-xl ${className ?? ""}`}
    >
      {children}
    </div>,
    document.body,
  );
}
