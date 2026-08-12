"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDefaultRosterView } from "./viewActions";

/**
 * Which view opens by default, and how to change it.
 *
 * The first version held the answer in local state seeded from a prop, so once
 * you had set a default it said "your default" for ever — switching views
 * re-rendered the same component instance, the prop changed, and the state did
 * not. It also never said WHICH view was the default, so on the wrong screen
 * it was both stale and mute.
 *
 * So there is no local copy of the answer now. The server knows the default,
 * this renders it, and saving refreshes rather than remembering. And it always
 * names the view, so "Calendar is your default" reads as a fact rather than as
 * a label on whatever happens to be on screen.
 */
export function DefaultViewToggle({
  view,
  defaultView,
}: {
  /** The view being looked at. */
  view: "calendar" | "list";
  /** What they have chosen to open on, if they have chosen. */
  defaultView: "calendar" | "list" | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (next: "calendar" | "list") =>
    startTransition(async () => {
      const res = await setDefaultRosterView(next);
      if (res.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });

  const name = (v: "calendar" | "list") => (v === "calendar" ? "Calendar" : "List");
  const isDefault = defaultView === view;

  return (
    <span className="flex items-center gap-2 text-[11px] text-on-surface-muted">
      {isDefault ? (
        <span>{name(view)} is your default</span>
      ) : (
        <>
          {/* Says what the default IS, so the offer is never ambiguous. */}
          {defaultView ? <span>{name(defaultView)} opens by default</span> : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => save(view)}
            className="underline underline-offset-2 hover:text-on-surface"
          >
            {pending ? "Saving…" : `Use ${name(view).toLowerCase()} instead`}
          </button>
        </>
      )}
      {error ? <span className="text-warn">{error}</span> : null}
    </span>
  );
}
