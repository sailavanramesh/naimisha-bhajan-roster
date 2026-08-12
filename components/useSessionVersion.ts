"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Slower than the cushions: a bhajan changes far less often than a mic does. */
const POLL_MS = 10_000;

/**
 * Refresh a read-only session view when the session changes underneath it.
 *
 * The same shape as the mic-cushion poll and for the same reasons: a
 * self-rescheduling timeout rather than setInterval, so a slow phone cannot
 * stack requests; and it stops while the tab is hidden, because a live view
 * left open overnight should not talk to the server until somebody looks at
 * it again.
 *
 * It asks for a stamp, not the session, and only calls router.refresh() when
 * the stamp moves — so the common case costs one small query and repaints
 * nothing.
 */
export function useSessionVersion(sessionId: string) {
  const router = useRouter();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (!live) return;
      try {
        const res = await fetch(`/api/sessions/version?id=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const { version } = await res.json();
          if (typeof version === "string") {
            // The first answer establishes the baseline; it is not a change.
            if (seen.current !== null && seen.current !== version) {
              router.refresh();
            }
            seen.current = version;
          }
        }
      } catch {
        // A failed poll is not worth showing anybody. The next one will do.
      } finally {
        if (live) timer = setTimeout(poll, POLL_MS);
      }
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void poll();
    }

    void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, router]);
}
