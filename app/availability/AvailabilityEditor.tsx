"use client";

/**
 * A singer's own availability: dates they cannot sing, and optionally a cycle
 * to predict a few more.
 *
 * The wording here is part of the feature, not decoration. Somebody deciding
 * whether to turn cycle tracking on needs to know exactly what a rosterer will
 * see, and the honest answer — an unlabelled date, indistinguishable from a
 * holiday — is also the reassuring one. It is stated plainly rather than
 * buried, including the part that is not reassuring: an administrator with
 * database access can read the row.
 */

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, Input, cn } from "@/components/ui";
import {
  MAX_CYCLE_DAYS,
  MAX_DURATION_DAYS,
  MAX_RANGE_DAYS,
  MIN_CYCLE_DAYS,
  MIN_DURATION_DAYS,
  type OwnBlock,
} from "@/lib/availability";
import { blockDate, unblockDate, saveCycle, forgetCycle } from "./actions";

export type CycleView = { lastStart: string; cycleLengthDays: number; durationDays: number } | null;

export function AvailabilityEditor({
  blocks,
  cycle,
  today,
  showCycle,
  cycleIsPreview,
}: {
  blocks: OwnBlock[];
  cycle: CycleView;
  today: string;
  /** Whether the cycle section applies to this person at all. */
  showCycle: boolean;
  /** True when they are only seeing it to try it out, not because it is theirs. */
  cycleIsPreview: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [cycleOpen, setCycleOpen] = useState(cycle !== null);
  const [lastStart, setLastStart] = useState(cycle?.lastStart ?? "");
  const [len, setLen] = useState(String(cycle?.cycleLengthDays ?? 28));
  const [dur, setDur] = useState(String(cycle?.durationDays ?? 4));

  const manual = blocks.filter((b) => b.source === "manual");
  const predicted = blocks.filter((b) => b.source === "cycle");

  function add() {
    if (!date) return;
    setError(null);
    startTransition(async () => {
      const r = await blockDate({ date, until: until || undefined, note });
      if (r.ok) {
        setDate("");
        setUntil("");
        setNote("");
      } else setError(r.error ?? "Could not save that.");
    });
  }

  function remove(d: string) {
    setError(null);
    startTransition(async () => {
      const r = await unblockDate({ date: d });
      if (!r.ok) setError(r.error ?? "Could not remove that.");
    });
  }

  function storeCycle() {
    setError(null);
    startTransition(async () => {
      const r = await saveCycle({
        lastStart,
        cycleLengthDays: Number(len),
        durationDays: Number(dur),
      });
      if (!r.ok) setError(r.error ?? "Could not save that.");
    });
  }

  function stopCycle() {
    setError(null);
    startTransition(async () => {
      await forgetCycle();
      setCycleOpen(false);
      setLastStart("");
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Dates you cannot sing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-xs text-on-surface-muted">
              From
              <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            {/* Optional second date: "away the 3rd to the 17th" is one action,
                not fifteen. Left blank it marks the single day. */}
            <label className="grid gap-1 text-xs text-on-surface-muted">
              Until (optional)
              <Input
                type="date"
                value={until}
                min={date || today}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-on-surface-muted">
              Note, just for you (optional)
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="away for work"
                maxLength={200}
              />
            </label>
            <button
              type="button"
              onClick={add}
              disabled={!date || pending}
              className="inline-flex h-9 items-center rounded-[10px] border border-transparent px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-rule-surface disabled:bg-transparent disabled:text-on-surface-muted"
              style={date && !pending ? { background: "rgb(var(--brass))", color: "rgb(var(--brass-ink))" } : undefined}
            >
              {until && until !== date ? "Add these days" : "Add"}
            </button>
          </div>

          <p className="text-[11px] text-on-surface-muted">
            Leave <em>Until</em> blank for a single day. A run of up to {MAX_RANGE_DAYS} days can be
            marked at once, and any one day of it can be removed on its own afterwards.
          </p>

          {manual.length === 0 ? (
            <p className="text-sm text-on-surface-muted">
              Nothing marked. Add a date and you will not be rostered on it.
            </p>
          ) : (
            <ul className="grid gap-1">
              {manual.map((b) => (
                <li
                  key={b.date}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-rule-surface px-2 py-1.5 text-sm"
                >
                  <span className="font-mono tabular-nums">{b.date}</span>
                  {b.note ? <span className="min-w-0 grow truncate text-on-surface-muted">{b.note}</span> : null}
                  <button
                    type="button"
                    onClick={() => remove(b.date)}
                    disabled={pending}
                    className="text-[11px] text-on-surface-muted underline hover:text-on-surface"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showCycle ? (
      <Card>
        <CardHeader>
          <CardTitle>Predicted days off</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1 text-sm text-on-surface-muted">
            <p>
              Optional. If you tell the app roughly when your period starts and how long it lasts, it
              will keep those days out of the roster for you, so you are not put down for a session
              you would have to pull out of.
            </p>
            <p>
              <strong className="text-on-surface">What anyone else sees:</strong> a date you are
              unavailable, exactly like a date you had marked yourself. No reason, no mark, nothing
              that says a predicted date is different from a holiday. The dates below are visible to
              you and to nobody else in the app.
            </p>
            <p>
              It is not a secret from an administrator with direct access to the database, and it
              would be wrong to tell you otherwise. If that matters to you, mark dates by hand
              instead — it works just as well.
            </p>
          </div>

          {!cycleOpen ? (
            <button
              type="button"
              onClick={() => setCycleOpen(true)}
              className="inline-flex h-9 w-fit items-center rounded-[10px] border border-rule-surface bg-field px-3 text-sm hover:border-brass/50"
            >
              Set this up
            </button>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-on-surface-muted">
                  Last period started
                  <Input type="date" value={lastStart} onChange={(e) => setLastStart(e.target.value)} />
                </label>
                <label className="grid gap-1 text-xs text-on-surface-muted">
                  Days between periods
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MIN_CYCLE_DAYS}
                    max={MAX_CYCLE_DAYS}
                    value={len}
                    onChange={(e) => setLen(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs text-on-surface-muted">
                  Days you are out
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MIN_DURATION_DAYS}
                    max={MAX_DURATION_DAYS}
                    value={dur}
                    onChange={(e) => setDur(e.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={storeCycle}
                  disabled={!lastStart || pending}
                  className="inline-flex h-9 items-center rounded-[10px] border border-transparent px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:border-rule-surface disabled:bg-transparent disabled:text-on-surface-muted"
                  style={lastStart && !pending ? { background: "rgb(var(--brass))", color: "rgb(var(--brass-ink))" } : undefined}
                >
                  {cycle ? "Update" : "Turn on"}
                </button>
                {cycle ? (
                  <button
                    type="button"
                    onClick={stopCycle}
                    disabled={pending}
                    className="text-[11px] text-on-surface-muted underline hover:text-on-surface"
                  >
                    turn off and delete what is stored
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCycleOpen(false)}
                    className="text-[11px] text-on-surface-muted underline hover:text-on-surface"
                  >
                    never mind
                  </button>
                )}
              </div>

              <p className="text-[11px] text-on-surface-muted">
                Keep the date up to date as it changes — every prediction is counted forward from it,
                so a correction fixes all of them at once.
              </p>
            </>
          )}

          {cycleIsPreview ? (
            <p className="rounded-[10px] border border-rule-surface bg-field px-2 py-1.5 text-[11px] text-on-surface-muted">
              You are seeing this because you are an owner and asked to try it. It is otherwise
              shown only to singers recorded as Ladies.
            </p>
          ) : null}

          {cycle && predicted.length > 0 ? (
            <div className="grid gap-1">
              <span className="text-xs text-on-surface-muted">
                Predicted for the next six months — {predicted.length} days
              </span>
              <ul className="flex flex-wrap gap-1">
                {predicted.map((b) => (
                  <li
                    key={b.date}
                    className={cn(
                      "rounded-[8px] border border-rule-surface px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
                    )}
                  >
                    {b.date}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {error ? <p className="text-sm text-kumkum">{error}</p> : null}
    </div>
  );
}
