"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";

/**
 * A link that admits it is working — and, just as importantly, admits when it
 * has finished.
 *
 * Sailavan, 2026-08-21: "show me another set is a bit slow". Measured on dev
 * the same day, about 400ms — 180ms of that the plain cost of reaching
 * australiaeast at all. Re-roll is a navigation to the same route with a new
 * seed, and Next holds the old screen until the new payload arrives, so for
 * those 400ms the list sat there showing the set you had just asked to be rid
 * of. In a hall, on phone data, that reads as a button that does not work.
 *
 * THIS USED TO USE `useLinkStatus`, AND IT STUCK ON.
 *
 * Sailavan, 2026-08-24: the first re-roll worked and the second "gives me this
 * perpetual load", surviving a reload and a browser restart. The screenshot is
 * what gives it away — a NEW set of bhajans on screen with the spinner still
 * going. The navigation had completed; only the indicator had not. And because
 * the button disables itself while pending, every later tap hit a dead
 * control, which is what made a stuck spinner look like a frozen app.
 *
 * The server was innocent throughout: zero 5xx across the whole session and an
 * average response of 0.37s.
 *
 * `useLinkStatus` reads Next's optimistic navigation state, which reverts when
 * React considers the transition complete. On this page it did not — the route
 * is `force-dynamic` and carries a Suspense boundary, and the pending flag
 * outlived the navigation that set it. Rather than depend on that internal
 * reverting, the state is now ours and is cleared by something observable:
 *
 *   1. THE HREF CHANGING. Both callers are force-dynamic and mint a fresh
 *      random seed on every server render, so the arriving page always brings a
 *      different href. That IS the new payload — nothing else can deliver it.
 *   2. A FAILSAFE. If neither the navigation nor the href ever arrives, the
 *      control re-enables itself rather than trapping somebody in a spinner
 *      forever. A slow link is a nuisance; a dead button is the bug above.
 *
 * `<Link>` is kept rather than pushing through the router by hand, so prefetch,
 * middle-click and open-in-new-tab all still behave like a link. Those modified
 * clicks deliberately do not raise the spinner: nothing is being navigated in
 * this tab.
 *
 * The spinner is a CSS animation, so the global `prefers-reduced-motion` rule in
 * globals.css stops it. That is why the label changes too — with motion off, the
 * word is the whole signal.
 */

/** Long enough to never fire on a working navigation, short enough to rescue. */
const FAILSAFE_MS = 10_000;

export function PendingLink({
  href,
  children,
  busyLabel,
  variant = "secondary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  /**
   * What the button says while the next set is on its way. Omit on a narrow
   * control and the label stays put, so only the spinner's width is added
   * (~22px) rather than that plus a longer word.
   */
  busyLabel?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * The new page has arrived. Clearing on `href` rather than on a router hook
   * keeps this component honest about what it is waiting for: the thing it
   * links to has been replaced, so the wait is over by definition.
   */
  useEffect(() => {
    setPending(false);
  }, [href]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const start = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // A modified click opens somewhere else. Nothing is loading here.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    setPending(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPending(false), FAILSAFE_MS);
  };

  return (
    <Link href={href} scroll={false} onClick={start}>
      <Button
        type="button"
        variant={variant}
        aria-busy={pending}
        disabled={pending}
        className={cn("gap-2", pending && "cursor-wait opacity-70", className)}
      >
        {pending ? (
          <>
            <span
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            {busyLabel ?? children}
          </>
        ) : (
          children
        )}
      </Button>
    </Link>
  );
}
