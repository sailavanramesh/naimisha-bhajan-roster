"use client";

/**
 * The shruti a song is being sung at, beside its words.
 *
 * Sailavan, 2026-08-26: "when looking at running order and then opening words
 * or the words/meanings link to the song, we should have a shruti finder that
 * defaults to the shruti or pitch allocated for the song, but can be changed
 * for practice purposes (and reascribed to the song as an option)."
 *
 * So three things, in that order of importance:
 *
 *   1. It STARTS on the pitch the programme allocated. Somebody who opens the
 *      words wants the drone the group will actually sing against, and finding
 *      it should not be a second search.
 *   2. Stepping it changes NOTHING. Practice is the common case — the same
 *      words read at home by somebody who sings a tone lower — and a control
 *      that quietly rewrote the programme would make the running order unsafe
 *      to look at.
 *   3. Saving it back is an explicit press, offered only to whoever may edit
 *      programmes, and it says which programme it is about to change.
 *
 * ## Bare notes, not shruti labels
 *
 * A programme records pitch as the note alone (`ProgramItem.pitchNote`), unlike
 * the roster, which uses the group's full labels. So stepping here is
 * `stepNote`, not `transposeLabel`: there is no step number and no series to
 * keep, and no label vocabulary to snap into. `ShrutiPlayer` already reads both
 * spellings, so the drone needs nothing special.
 *
 * ## Not `PitchFinder`
 *
 * That one answers "what do *I* sing this at" and saves against the singer.
 * This one answers "what is *this programme* singing it at". Same shape on
 * purpose — step, listen, save — because it is the same gesture; different
 * question, different field, so deliberately not the same component.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { NOTE_NAMES, stepNote } from "@/lib/pitch";
import { ShrutiPlayer } from "@/components/ShrutiPlayer";
import { setItemPitch } from "@/app/program/[id]/actions";
import { cn } from "@/components/ui";

export function SongShrutiFinder({
  itemId,
  allocated,
  canAscribe,
  where,
  onAscribed,
  className,
}: {
  /** The programme item this pitch belongs to. Null when the song is in none. */
  itemId: string | null;
  /** The pitch that programme allocated, as a bare note. */
  allocated: string | null;
  /** May they write it back? Editors only — the same rule as the pitch dropdown. */
  canAscribe: boolean;
  /**
   * Which programme the allocation belongs to, e.g. "Sai Nite · 9 Aug 2026".
   * Null in the running order itself, where the answer is the page you are on.
   */
  where: string | null;
  /** So the running order's own copy of the pitch follows a save. */
  onAscribed?: (pitch: string) => void;
  className?: string;
}) {
  const start = (allocated ?? "").trim().toUpperCase();
  const [saved, setSaved] = useState(start);
  const [pitch, setPitch] = useState(start);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * FOLLOW THE ALLOCATION WHEN IT CHANGES ELSEWHERE.
   *
   * In the running order this sits inside the same card as the Pitch dropdown,
   * and both read the item's pitch. Initial state alone would leave the finder
   * insisting the programme "still says F" after somebody had just changed that
   * dropdown to G, and offering to save F back over it.
   *
   * Compared against the LAST ALLOCATION SEEN rather than against `saved`, so
   * this cannot fight the component's own save: after one, `allocated` arrives
   * as the value already stored and there is nothing to do — which is why the
   * confirmation message below survives.
   */
  const lastSeen = useRef(start);
  useEffect(() => {
    if (start === lastSeen.current) return;
    lastSeen.current = start;
    setSaved(start);
    setPitch(start);
  }, [start]);

  const dirty = pitch !== saved;
  const canSave = canAscribe && itemId !== null;

  function step(by: number) {
    setMessage(null);
    // From nothing, a step has nowhere to start — the dropdown is how a song
    // with no allocated pitch gets its first one.
    setPitch((current) => stepNote(current, by) ?? current);
  }

  function save() {
    if (!itemId || !dirty) return;
    startTransition(async () => {
      const res = await setItemPitch({ itemId, pitch });
      if (res.ok) {
        setSaved(pitch);
        onAscribed?.(pitch);
        setMessage(
          pitch
            ? `Saved. ${where ?? "This programme"} now says ${pitch}.`
            : `Cleared. ${where ?? "This programme"} no longer records a pitch.`,
        );
      } else {
        setMessage(res.error);
      }
    });
  }

  return (
    <div className={cn("rounded-[12px] border border-rule-surface bg-panel p-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-display text-sm font-semibold">Shruti</h3>
        <p className="text-[11px] text-on-surface-muted">
          {saved
            ? `sung at ${saved}${where ? ` · ${where}` : ""}`
            : where
              ? `no pitch recorded · ${where}`
              : "no pitch recorded yet"}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Down one semitone"
          title="Down one semitone"
          disabled={!pitch}
          onClick={() => step(-1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-rule-surface bg-field text-base leading-none hover:border-brass/50 disabled:opacity-40"
        >
          &minus;
        </button>

        {/*
          The note itself is the dropdown rather than a read-out beside one.

          Twelve notes is a short list, and this is also the only way in for a
          song with no allocated pitch — where stepping has nothing to step
          from. Same control as the running order's Pitch field, so the two
          screens do not disagree about what a pitch is.
        */}
        <label className="grow text-center">
          <span className="sr-only">Shruti to practise against</span>
          <select
            value={pitch}
            onChange={(e) => {
              setPitch(e.target.value);
              setMessage(null);
            }}
            className="h-9 w-full min-w-[5rem] rounded-key border border-rule-surface bg-field px-2 text-center font-mono text-base font-semibold"
          >
            <option value="">—</option>
            {NOTE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          aria-label="Up one semitone"
          title="Up one semitone"
          disabled={!pitch}
          onClick={() => step(1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-rule-surface bg-field text-base leading-none hover:border-brass/50 disabled:opacity-40"
        >
          +
        </button>

        {/* Follows the steps rather than restarting: the drone retunes. */}
        <ShrutiPlayer label={pitch} size="md" />
      </div>

      {/*
        WHAT A CHANGE MEANS, said while it is unsaved.

        Nobody should have to guess whether stepping the drone has just moved
        the pitch the group is expecting on the night. It has not, and this is
        where that is said.
      */}
      {dirty ? (
        <p className="mt-2 text-[11px] text-on-surface-muted">
          Yours to practise with —{" "}
          {saved ? (
            <>
              {where ?? "the programme"} still says <span className="font-mono">{saved}</span>
            </>
          ) : (
            <>nothing is saved against {where ?? "the programme"}</>
          )}
          .
        </p>
      ) : null}

      {canSave && dirty ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className={cn(
              "inline-flex h-9 items-center rounded-[10px] border border-transparent px-3 text-sm font-semibold transition",
              pending && "cursor-not-allowed opacity-60",
            )}
            style={{ background: "rgb(var(--brass))", color: "rgb(var(--brass-ink))" }}
          >
            {pending
              ? "Saving…"
              : pitch
                ? `Sing it at ${pitch}`
                : "Clear the pitch"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPitch(saved);
              setMessage(null);
            }}
            className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
          >
            {saved ? `back to ${saved}` : "back to no pitch"}
          </button>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="mt-2 text-[11px] text-on-surface-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
