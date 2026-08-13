"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * "You have unsaved changes" — with the changes actually named.
 *
 * A browser will not let a page put its own words in front of somebody closing
 * a tab; `beforeunload` shows the browser's generic sentence and nothing else.
 * But moving between pages INSIDE the app is ours to intercept, and that is
 * where this appears: a nav link, Assign, Live view, the calendar.
 *
 * It lists what is unsaved rather than asserting that something is, because
 * "you have unsaved changes" on a roster somebody has been poking at for ten
 * minutes is not enough to decide with. Seeing "Prasanna: pitch — → 2 Pancham
 * / D" is.
 *
 * Three ways out, and Stay is the default the Escape key and the backdrop
 * both take: the safe answer should be the easiest one to give by accident.
 */
export function LeaveWithChangesDialog({
  open,
  changes,
  saving,
  onSave,
  onDiscard,
  onStay,
}: {
  open: boolean;
  /** One short line per change, from `describeChanges`. */
  changes: string[];
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onStay]);

  if (!open) return null;

  // Long enough to recognise the work, short enough to read standing up.
  const SHOWN = 6;
  const listed = changes.slice(0, SHOWN);
  const rest = changes.length - listed.length;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onStay();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        className="w-full max-w-md rounded-[14px] border border-rule-surface bg-panel p-4 shadow-xl"
      >
        <h2 id="leave-title" className="text-sm font-semibold">
          {changes.length} unsaved change{changes.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-1 text-xs text-on-surface-muted">
          Leaving this page now would drop {changes.length === 1 ? "it" : "them"}.
        </p>

        <ul className="mt-3 grid gap-1 text-xs">
          {listed.map((c, i) => (
            <li
              key={i}
              className="rounded-[8px] border border-rule-surface bg-field px-2 py-1 text-on-surface"
            >
              {c}
            </li>
          ))}
          {rest > 0 ? (
            <li className="px-2 py-0.5 text-on-surface-muted">and {rest} more</li>
          ) : null}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="text-xs text-on-surface-muted underline underline-offset-2 hover:text-warn disabled:opacity-50"
          >
            Discard and leave
          </button>
          {/* Focus lands on the safe answer, not on the destructive one. */}
          <Button autoFocus onClick={onStay} disabled={saving}>
            Stay here
          </Button>
          <Button onClick={onSave} variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save and leave"}
          </Button>
        </div>
      </div>
    </div>
  );
}
