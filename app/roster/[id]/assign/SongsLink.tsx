"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * The "songs" half of a singer chip.
 *
 * A plain <Link> was correct but felt broken: opening a singer's suggestions
 * is a server round trip, and until it returned the click produced no visible
 * response at all, so people clicked again. The server work is down from ~1.7s
 * to ~0.75s, but that is still long enough to need an answer straight away.
 *
 * Two things fix the feel:
 *   - `useTransition` gives an immediate pending state on the control itself,
 *     so the click is acknowledged before the data exists.
 *   - Prefetching on hover or focus starts the request before the click, which
 *     on a desktop usually hides the latency entirely.
 *
 * Still a real navigation, so the URL stays shareable and the back button
 * works — the suggestions are server-rendered, not fetched into client state.
 */
export function SongsLink({
  href,
  open,
  singerName,
}: {
  href: string;
  open: boolean;
  singerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      onClick={() => startTransition(() => router.push(href, { scroll: false }))}
      aria-label={open ? `Hide suggestions for ${singerName}` : `Show suggestions for ${singerName}`}
      aria-busy={pending}
      title={open ? "Hide suggestions" : "Show what they could sing"}
      className="inline-flex h-8 min-w-[3.1rem] items-center justify-center border-l border-rule-surface px-2 text-[11px] text-on-surface-muted hover:bg-panel-hover hover:text-on-surface disabled:opacity-100"
      disabled={pending}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none"
          />
          <span className="sr-only">Loading suggestions</span>
        </span>
      ) : open ? (
        "hide"
      ) : (
        "songs"
      )}
    </button>
  );
}
