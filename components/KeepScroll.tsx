"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Remember where you were on a long list, and put you back there.
 *
 * The bhajan list is 3,600 rows deep. Open one from halfway down, press Back,
 * and you landed at the top with the scroll thrown away — so finding your place
 * again meant scrolling past everything you had already read. The filters
 * survived, because they live in the URL; the position did not, because it
 * lives nowhere.
 *
 * Next restores scroll on back/forward when it can serve the page from its
 * router cache, and this list is `force-dynamic`, so it usually cannot: Back
 * re-fetches from the server and the restore lands before the rows do.
 *
 * So the position is remembered here instead, keyed by the FULL url including
 * the query. That key matters — scrolled to "Shiva, page down four" and then
 * searching for something else should start at the top, because it is a
 * different list, and it does.
 *
 * sessionStorage rather than localStorage: per tab, and gone when the tab is.
 * Where you were reading is not something to remember next week.
 */
export function KeepScroll({ prefix = "scroll" }: { prefix?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${prefix}:${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    let saved = 0;

    /*
     * Restore after the rows are actually on the page.
     *
     * A layout effect would run against an empty document and scroll to zero.
     * Two animation frames is the cheap, reliable version of "after paint" —
     * one to get out of this render, one to let the list lay out.
     */
    const stored = Number(sessionStorage.getItem(key) ?? "");
    if (Number.isFinite(stored) && stored > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo(0, stored));
      });
    }

    // Written on a timer rather than on every scroll event: a phone fires
    // hundreds of those a second and sessionStorage is synchronous.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      saved = window.scrollY;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        sessionStorage.setItem(key, String(saved));
      }, 250);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      // The last position, written on the way out — the scroll that took you
      // to a bhajan is the one that matters and it may not have been flushed.
      if (saved > 0) sessionStorage.setItem(key, String(saved));
    };
  }, [key]);

  return null;
}
