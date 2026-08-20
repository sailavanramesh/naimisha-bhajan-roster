"use client";

/**
 * Find the pitch you sing a bhajan at, by ear.
 *
 * The problem this solves: a member cannot open a roster, so the only place in
 * the app where somebody could hear a shruti and step it up and down was a
 * screen they are not allowed on. This is that control, on a page they are.
 *
 * It starts from the best guess the app already has — their own predicted
 * pitch where there is enough history for one, otherwise the reference for
 * their side — then gets out of the way: play, step until it sits right, save.
 *
 * Everything audible here is the tanpura engine: one drone at a time, and a
 * step retunes the drone that is already sounding rather than restarting it.
 */

import { useState, useTransition } from "react";
import { transposeLabel, parsePitchLabel, NOTE_NAMES, saOf } from "@/lib/pitch";
import { ShrutiPlayer } from "@/components/ShrutiPlayer";
import { setPreferredPitch } from "@/app/my-list/actions";
import { cn } from "@/components/ui";

export type PitchFinderProps = {
  singerId: string;
  /** The bhajan being pitched. Title, because that is what a list row is keyed by. */
  title: string;
  /** Where to start: their prediction, or the reference for their side. */
  startPitch: string | null;
  /** What they have already settled on, if anything. */
  savedPitch: string | null;
  /** Why the starting pitch is what it is — shown so it is not a mystery number. */
  startReason: string | null;
  /** The group's real labels, so stepping stays in their own vocabulary. */
  options: readonly string[];
  /** False for a viewer, who may listen but not save. */
  canSave: boolean;
  className?: string;
};

export function PitchFinder({
  singerId,
  title,
  startPitch,
  savedPitch,
  startReason,
  options,
  canSave,
  className,
}: PitchFinderProps) {
  const [pitch, setPitch] = useState<string | null>(savedPitch ?? startPitch);
  const [saved, setSaved] = useState<string | null>(savedPitch);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Stepping stays inside the series the label is written in, exactly as the
  // roster grid does — crossing between Madhyam and Pancham is a decision, not
  // a nudge, and the dropdown is where that belongs.
  function step(by: number) {
    setPitch((current) => (current ? transposeLabel(current, by, options) ?? current : current));
    setMessage(null);
  }

  const parsed = parsePitchLabel(pitch);
  const sa = saOf(pitch);
  const dirty = pitch !== saved;

  function save() {
    if (!pitch) return;
    startTransition(async () => {
      const r = await setPreferredPitch({ singerId, title, pitch });
      if (r.ok) {
        setSaved(r.pitch);
        setMessage(
          r.created
            ? "Saved, and added to your list so it has somewhere to live."
            : "Saved. The rosterer will see this as your pitch.",
        );
      } else {
        setMessage(r.error);
      }
    });
  }

  if (!pitch) {
    return (
      <div className={cn("rounded-[12px] border border-rule-surface bg-panel p-3 text-sm", className)}>
        <p className="text-on-surface-muted">
          No reference pitch is recorded for this bhajan yet, so there is nothing to start from.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-[12px] border border-rule-surface bg-panel p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">Find your pitch</h3>
        {saved ? (
          <span className="text-[11px] text-on-surface-muted">
            saved: <span className="font-mono">{saved}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Down one semitone"
          title="Down one semitone"
          onClick={() => step(-1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-rule-surface bg-field text-base leading-none hover:border-brass/50"
        >
          −
        </button>

        <div className="min-w-0 grow text-center">
          <div className="font-mono text-lg font-semibold leading-tight">{pitch}</div>
          {parsed && sa !== null ? (
            <div className="text-[11px] text-on-surface-muted">
              Sa is {NOTE_NAMES[sa]} · {parsed.series === "Madhyam" ? "Ma" : "Pa"} drones against it
            </div>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Up one semitone"
          title="Up one semitone"
          onClick={() => step(1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-rule-surface bg-field text-base leading-none hover:border-brass/50"
        >
          +
        </button>

        {/* The drone follows the steps above rather than restarting on each. */}
        <ShrutiPlayer label={pitch} size="md" />
      </div>

      {startReason && !saved ? (
        <p className="mt-2 text-[11px] text-on-surface-muted">Starting from {startReason}.</p>
      ) : null}

      {canSave ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className={cn(
              "inline-flex h-9 items-center rounded-[10px] px-3 text-sm font-semibold transition",
              dirty && !pending
                ? "border border-transparent"
                : "cursor-not-allowed border border-rule-surface text-on-surface-muted",
            )}
            style={
              dirty && !pending
                ? { background: "rgb(var(--brass))", color: "rgb(var(--brass-ink))" }
                : undefined
            }
          >
            {pending ? "Saving…" : dirty ? "This is my pitch" : "Saved"}
          </button>
          {dirty && saved ? (
            <button
              type="button"
              onClick={() => {
                setPitch(saved);
                setMessage(null);
              }}
              className="text-[11px] text-on-surface-muted underline hover:text-on-surface"
            >
              back to {saved}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-on-surface-muted">
          Sign in as yourself to keep a pitch against this bhajan.
        </p>
      )}

      {message ? <p className="mt-2 text-[11px] text-on-surface-muted">{message}</p> : null}
    </div>
  );
}
