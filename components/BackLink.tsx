"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/**
 * A Back button that goes BACK, rather than to one fixed page.
 *
 * The bhajan page used to send everybody to /bhajans. Eleven different screens
 * link to a bhajan — the list, Build, a singer, Explore, Fairness, the roster
 * grid, the live board, the learning list — and from every one of them Back
 * meant "the bhajan list", which was the wrong answer ten times out of eleven.
 * Worse on the list itself, where /bhajans threw away the search and the deity
 * filter that were sitting in the URL a moment before.
 *
 * `router.back()` returns to whatever the browser actually came from, with its
 * query string and its scroll position, so filters and a half-built session
 * survive the detour. It is also exactly what the swipe gesture does, which
 * means the button and the gesture stop disagreeing.
 *
 * `fallback` covers arriving cold — a shared link, a new tab, a refresh — where
 * there is no history to go back through and `router.back()` would either do
 * nothing or leave the app. Detected by asking whether this page is the first
 * entry in the session's history.
 */
export function BackLink({
  fallback,
  label = "Back",
  className,
}: {
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    /*
     * `history.length > 1` is the honest signal available to us. It counts the
     * whole tab's history rather than our own, so a visitor who arrived from
     * elsewhere on the web could send us out of the app — which is the same
     * thing the browser's own Back button would do, and therefore not a
     * surprise. What it reliably catches is the fresh tab, where it is 1.
     */
    setCanGoBack(window.history.length > 1);
  }, []);

  if (!canGoBack) {
    return (
      <Button type="button" className={className} onClick={() => router.push(fallback)}>
        {label}
      </Button>
    );
  }

  return (
    <Button type="button" className={className} onClick={() => router.back()}>
      {label}
    </Button>
  );
}
