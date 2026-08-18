"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { purgeSession, restoreSession } from "./actions";

/**
 * One archived session, with the two things an owner can do to it.
 *
 * Restore is the ordinary one and reads as ordinary. Deleting for good is two
 * steps and stays folded away — it is the only irreversible control in the app,
 * and the archive exists precisely so that it is rarely the answer.
 */
export function ArchiveRow({
  id,
  dateLabel,
  kind,
  topic,
  rows,
  pitches,
  archivedAt,
  archivedBy,
}: {
  id: string;
  dateLabel: string;
  kind: "session" | "program";
  topic: string | null;
  rows: number;
  /** Confirmed pitches on it. Any at all and it cannot be deleted for good. */
  pitches: number;
  archivedAt: string;
  archivedBy: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await work();
      if (!res.ok) {
        setError(res.error ?? "That did not work.");
        setArmed(false);
        return;
      }
      router.refresh();
    });

  return (
    <li className="grid gap-2 rounded-[12px] border border-rule-surface bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold">
            {dateLabel}
            {topic ? <span className="ms-2 font-normal text-on-surface-muted">{topic}</span> : null}
          </p>
          <p className="text-xs text-on-surface-muted">
            {kind === "program" ? "Music programme" : "Bhajan session"} ·{" "}
            {rows === 0
              ? "nothing on it"
              : `${rows} ${kind === "program" ? "item" : "row"}${rows === 1 ? "" : "s"}`}
            {pitches > 0 ? ` · ${pitches} confirmed pitch${pitches === 1 ? "" : "es"}` : ""}
          </p>
          <p className="text-xs text-on-surface-muted">
            Removed {archivedAt}
            {archivedBy ? ` by ${archivedBy}` : ""}.
          </p>
        </div>
        {pitches > 0 ? <Badge tone="brass">has history</Badge> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
          {error}
        </p>
      ) : null}

      {armed ? (
        <div className="grid gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2">
          <p className="text-xs">
            Delete <strong>{dateLabel}</strong> for good? There is nothing after this — no
            archive, no undo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => purgeSession({ id }))}
              className="h-8 rounded-[8px] border border-warn/60 bg-warn/15 px-3 text-xs font-semibold hover:bg-warn/25"
            >
              {pending ? "Deleting…" : "Yes, delete it for good"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setArmed(false)}
              className="text-xs text-on-surface-muted underline underline-offset-2"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            className="h-8 text-xs"
            disabled={pending}
            onClick={() => run(() => restoreSession({ id }))}
          >
            Put it back
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setArmed(true);
            }}
            className="text-xs text-on-surface-muted underline underline-offset-2 hover:text-warn"
          >
            delete for good
          </button>
        </div>
      )}
    </li>
  );
}
