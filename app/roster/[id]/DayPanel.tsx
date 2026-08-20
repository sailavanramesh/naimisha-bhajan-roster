"use client";

/**
 * A second session on the same day: add one, or split this one into two.
 *
 * Both live here because they are the same thought — "this evening is really
 * two" — and a coordinator arriving at it does not yet know which of the two
 * they want. Adding an empty one suits transcribing an old paper roster; the
 * split suits an evening that has already been half built.
 *
 * The split MOVES the chosen rows. That is stated on the panel, because the
 * hand-rolled version of this cost three confirmed pitches their historical
 * recommendation, and somebody deciding between the two ways deserves to know
 * which one keeps the history.
 */

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, Input, cn } from "@/components/ui";
import { addSessionOnSameDay, splitSession } from "./dayActions";

export type SplitRow = { slotId: string; singerName: string | null; bhajanTitle: string | null };

export function DayPanel({
  sessionId,
  rows,
  suggestedTime,
}: {
  sessionId: string;
  rows: SplitRow[];
  /** A time that is not already taken that day. */
  suggestedTime: string;
}) {
  const [mode, setMode] = useState<"none" | "add" | "split">("none");
  const [time, setTime] = useState(suggestedTime);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setError(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function add() {
    setError(null);
    startTransition(async () => {
      const r = await addSessionOnSameDay({ sessionId, startsAt: time });
      if (r && !r.ok) setError(r.error);
    });
  }

  function split() {
    setError(null);
    startTransition(async () => {
      const r = await splitSession({ sessionId, slotIds: [...picked], startsAt: time });
      if (r && !r.ok) setError(r.error);
    });
  }

  const movingAll = picked.size > 0 && picked.size === rows.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Another session this day</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {mode === "none" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("add")}
              className="inline-flex h-9 items-center rounded-[10px] border border-rule-surface bg-field px-3 text-sm hover:border-brass/50"
            >
              Add an empty one
            </button>
            <button
              type="button"
              onClick={() => setMode("split")}
              disabled={rows.length < 2}
              title={
                rows.length < 2
                  ? "There needs to be more than one singer to split"
                  : "Move some of these singers to a second session"
              }
              className="inline-flex h-9 items-center rounded-[10px] border border-rule-surface bg-field px-3 text-sm hover:border-brass/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Split this one in two
            </button>
            <span className="text-[11px] text-on-surface-muted">
              For a day that runs twice — a morning and an evening, say.
            </span>
          </div>
        ) : null}

        {mode !== "none" ? (
          <>
            <label className="grid w-fit gap-1 text-xs text-on-surface-muted">
              The new session starts at
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-32"
              />
            </label>

            {mode === "split" ? (
              <div className="grid gap-2">
                <span className="text-xs text-on-surface-muted">
                  Who moves across? Their confirmed pitch and their history move with them — nothing
                  is retyped.
                </span>
                <ul className="grid gap-1">
                  {rows.map((r) => {
                    const on = picked.has(r.slotId);
                    return (
                      <li key={r.slotId}>
                        <button
                          type="button"
                          onClick={() => toggle(r.slotId)}
                          aria-pressed={on}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-[10px] border px-2 py-1.5 text-left text-sm transition",
                            on
                              ? "border-brass/60 bg-brass/[0.10]"
                              : "border-rule-surface hover:border-brass/50",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "inline-block h-4 w-4 shrink-0 rounded-[5px] border",
                              on ? "border-transparent bg-brass" : "border-rule-surface",
                            )}
                          />
                          <span className="min-w-0 truncate">
                            {r.singerName ?? "(nobody yet)"}
                            {r.bhajanTitle ? (
                              <span className="text-on-surface-muted"> · {r.bhajanTitle}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {movingAll ? (
                  <p className="text-[11px]" style={{ color: "rgb(var(--kumkum))" }}>
                    That is everybody — this session would be left empty. Leave at least one here, or
                    just change this session&rsquo;s start time instead.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={mode === "add" ? add : split}
                disabled={pending || (mode === "split" && (picked.size === 0 || movingAll))}
                className="inline-flex h-9 items-center rounded-[10px] border border-transparent px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-rule-surface disabled:bg-transparent disabled:text-on-surface-muted"
                style={
                  !pending && (mode === "add" || (picked.size > 0 && !movingAll))
                    ? { background: "rgb(var(--brass))", color: "rgb(var(--brass-ink))" }
                    : undefined
                }
              >
                {pending
                  ? "working…"
                  : mode === "add"
                    ? `Add a session at ${time}`
                    : `Move ${picked.size} to a new ${time} session`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("none");
                  setPicked(new Set());
                  setError(null);
                }}
                className="text-[11px] text-on-surface-muted underline hover:text-on-surface"
              >
                never mind
              </button>
            </div>
          </>
        ) : null}

        {error ? <p className="text-sm text-kumkum">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
