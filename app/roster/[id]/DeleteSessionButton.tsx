"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "./metaActions";

/**
 * Delete this session. Two steps, and quiet until asked.
 *
 * A plain line of text rather than a red button: deleting a session is a rare
 * correction — a day tapped by mistake, a duplicate — not part of running a
 * roster, and a destructive control sitting in the eyeline all evening is one
 * that eventually gets pressed.
 *
 * The server refuses anything holding a confirmed pitch, so the confirm step
 * guards against a mis-click rather than against data loss. It still says what
 * will go, because "3 rows" is the difference between an empty mistake and
 * somebody's plan for Thursday.
 */
export function DeleteSessionButton({
  sessionId,
  dateLabel,
  rows,
  kind = "session",
  backTo = "/roster",
}: {
  sessionId: string;
  dateLabel: string;
  rows: number;
  /**
   * What is being deleted, in the words on screen. A music program is a Session
   * underneath and deletes through the same action, but nobody at the centre
   * calls it a session, and "the 3 rows on it" is not what a program has.
   */
  kind?: "session" | "program";
  /** Where to go afterwards — the list this thing came from. */
  backTo?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirm = () =>
    startTransition(async () => {
      const res = await deleteSession(sessionId);
      if (!res.ok) {
        setError(res.error);
        setArmed(false);
        return;
      }
      router.push(backTo);
      router.refresh();
    });

  if (!armed) {
    return (
      <div className="grid gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          className="justify-self-start text-xs text-on-surface-muted underline underline-offset-2 hover:text-warn"
        >
          Delete this {kind}
        </button>
        {error ? (
          <p role="alert" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2">
      <p className="text-xs">
        Delete <strong>{dateLabel}</strong>
        {rows > 0 ? (
          <>
            {" "}
            and the {rows} {kind === "program" ? "item" : "row"}
            {rows === 1 ? "" : "s"} on it
          </>
        ) : kind === "program" ? (
          " (nothing is in it)"
        ) : (
          " (nothing is rostered on it)"
        )}
        ? This cannot be undone.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="h-8 rounded-[8px] border border-warn/60 bg-warn/15 px-3 text-xs font-semibold hover:bg-warn/25"
        >
          {pending ? "Deleting…" : "Yes, delete it"}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={pending}
          className="text-xs text-on-surface-muted underline underline-offset-2"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
