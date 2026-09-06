"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

/**
 * Back to the top of a long page, without a scroll listener.
 *
 * The lists here are deep — 3,600 bhajans on /explore, a whole masterlist on
 * /bhajans, a session grid that runs well past a screen — and the only way back
 * to the filters at the top was to scroll all of it again.
 *
 * It lives in app/layout.tsx, once, rather than on the pages that happen to be
 * long today. The distance threshold does the filtering: a page shorter than
 * the sentinel never shows the button at all, so there is no list of "the long
 * pages" to keep in step as pages grow.
 *
 * WHY A SENTINEL RATHER THAN A SCROLL HANDLER
 *
 * The pages this exists for are exactly the pages that already run
 * components/KeepScroll.tsx, whose passive scroll listener fires hundreds of
 * times a second on a phone. A second one, to answer a question that only
 * changes twice per page visit, is work for nothing. An IntersectionObserver
 * watching one absolutely-positioned block costs nothing per frame and the
 * browser answers it off the main thread.
 *
 * The block is 150vh, so the button appears about a screen and a half down.
 * Expressing it in viewport heights rather than pixels means a phone and a
 * desktop each get a threshold proportionate to what they can already see —
 * "past what fits, and then some" — instead of one number that is too far on
 * one and too near on the other.
 *
 * It needs a positioned ancestor to hang off; <main> carries `relative` for it.
 */
export function BackToTop() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div
        ref={sentinel}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[150vh]"
      />

      <button
        type="button"
        aria-label="Back to top"
        /*
          Faded out rather than unmounted, so it can transition — but a
          transparent button is still a button, and a keyboard user would find
          it in the tab order and a screen reader would read it out while
          nothing is on screen. Both have to be told as well.
        */
        aria-hidden={!show}
        tabIndex={show ? 0 : -1}
        onClick={() => {
          /*
           * The `scroll-behavior: auto !important` rule in globals.css does NOT
           * cover this. That property governs scrolls the CSSOM starts; an
           * explicit `behavior` passed to scrollTo wins over it, so a reduced
           * motion setting has to be honoured here in so many words.
           */
          const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
          /*
           * Take the keyboard with the page. Without this, focus stays on a
           * button that is now at the bottom of the window, and the next Tab
           * drops you back exactly where you asked to leave.
           */
          document.getElementById("main")?.focus({ preventScroll: true });
        }}
        className={cn(
          // z-40: above sticky cells (10-20), below the mobile navigation (60),
          // and well below the live view. See the layering note in globals.css.
          "no-print fixed bottom-4 right-4 z-40",
          // 44px, the same box as the mobile navigation button — this is tapped
          // with a thumb, standing up, in a hall.
          "flex h-11 w-11 items-center justify-center rounded-key",
          // The chrome palette, not the card one: this floats on the ground,
          // the way the hamburger does, not on a panel.
          "border border-rule bg-ground-raised/95 text-on-ground shadow-lg backdrop-blur",
          "hover:bg-white/[0.08]",
          "transition-opacity motion-reduce:transition-none",
          show ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <span className="text-lg leading-none">↑</span>
      </button>
    </>
  );
}
