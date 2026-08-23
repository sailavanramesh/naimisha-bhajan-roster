"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { type Cushion, type ChorusMic, type MicColourValue } from "@/lib/micCushion";
import {
  addChorusSinger,
  copyChorusDown,
  removeChorusSinger,
  setChorusCushion,
  type ChorusResult,
} from "./chorusActions";

/**
 * The chorus mics on one bhajan: who is on them, and what colour each cushion
 * is.
 *
 * SEVERAL people, not one. It was a single select and a row of dots, because
 * the column began as one chorus singer; the desk puts two and three people on
 * chorus mics at once, each on their own cushion, so this is now a list you add
 * to and take from.
 *
 * Writes immediately, one mic at a time, exactly like the mic cushion dots next
 * door — and deliberately NOT through the grid's save. That save carries the
 * historical record and refuses when somebody else has touched the same rows;
 * routing a cushion tap through it would make a sound person's tap fail a
 * coordinator's save as a conflict that is not one, during a session, which is
 * precisely when both happen at once.
 *
 * Because it saves on its own, it SAYS so. Nothing here joins the "3 unsaved
 * changes" count on the button above, so without a word from the cell the only
 * honest reading of the screen was that a chorus mic was unsaved work you could
 * lose by leaving — which is why it now confirms each write where it happened.
 *
 * ONE permission, `setMicCushion`, which is everybody signed in. It was two —
 * adding and removing needed `assignSingers` on the reasoning that WHO choruses
 * is an allocation. Sailavan, 2026-08-18: "chorus mic selection and entry should
 * be open to all users (with the copy down features too)." A chorus mic is not
 * a rostered part; it is who has picked up the third mic tonight, and the
 * person who knows that is standing at the desk, not editing the roster.
 */

export function ChorusCell({
  slotId,
  onSaveRow,
  singers,
  mics: fromServer,
  canEdit,
  cushions,
  canCopyDown = false,
  onCopied,
}: {
  slotId: string | null;
  /**
   * Save the grid, so an unsaved row becomes a real slot.
   *
   * Chorus mics are rows in the database hanging off a slot, so a row that has
   * never been saved has nothing for them to hang off. That used to be a dead
   * end — "save the row first", with the Save button somewhere else on a wide
   * table. Sailavan, 2026-08-23: "when adding a row to a session, i can't copy
   * down chorus mics until saving changes as it thinks no row exists yet."
   */
  onSaveRow?: () => void;
  singers: { id: string; name: string }[];
  mics: ChorusMic[];
  /** The cushions this session's desk carries, in channel order. */
  cushions: ReadonlyArray<Cushion>;
  /** May work the chorus mics at all: add, remove, colour, copy down. */
  canEdit: boolean;
  /** Is there a bhajan below this one to copy onto? Not shown on the last row. */
  canCopyDown?: boolean;
  /**
   * The server's word on every slot the copy touched, this one included.
   *
   * Handed up rather than left to a page refresh: each cell owns its own list
   * once it has seeded (see below), so the only honest way to move another
   * cell is to give the grid fresh server data and let it re-seed that cell.
   */
  onCopied?: (mics: Record<string, ChorusMic[]>) => void;
}) {
  const [mics, setMics] = useState<ChorusMic[]>(fromServer);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  /*
   * What the copy down did, in words — and it GOES AWAY, like the tick.
   *
   * It did not, at first. Sailavan copied, then deleted every chorus mic, and
   * "Copied to 1 bhajan. Left 1 that already had mics." was still sitting under
   * an empty cell describing a session that no longer existed. The rule was
   * already written four lines below for the tick — "short enough not to sit
   * there claiming the last thing you did" — and this broke it.
   *
   * Longer than the tick because it is a sentence rather than a mark, and
   * cleared outright by the next write in this cell: once somebody adds or
   * removes a mic here, what the copy did is no longer what the screen shows.
   */
  const [copied, setCopied] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Drop the copy-down sentence, on a timer or because something moved. */
  function clearCopied() {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = null;
    setCopied(null);
  }

  /*
   * `mics` SEEDS from the prop and then owns itself. Do not add an effect that
   * re-adopts the prop — one was here, and it wiped every edit.
   *
   * The prop looks like live server truth and is not. The grid seeds its own
   * `rows` from `props.initialRows` into useState once, at mount, and never
   * re-syncs — deliberately, because re-syncing would throw away a
   * coordinator's unsaved edits. So `r.chorus` is frozen at whatever it was
   * when the page loaded, and revalidating the session does not move it.
   *
   * What that cost: add somebody to a chorus mic, the write succeeds, the cell
   * shows them — and then the effect compares the fresh list against a prop
   * still holding the page-load value, decides the server disagrees, and
   * adopts the empty one. The person vanished from the cell while being saved
   * perfectly well, which is exactly what the live board showed. Choosing a
   * cushion did the same thing. Reported by Sailavan, 2026-08-17.
   *
   * The server's answer to our own write is the authority instead: every
   * action returns the whole list for the bhajan and `apply` takes it.
   * Somebody else's change arrives on the next page load, which is the same
   * deal the rest of this grid offers.
   */

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  /** Every write ends here: the server's list wins, and the cell says so. */
  function apply(run: () => Promise<ChorusResult>) {
    startTransition(async () => {
      setStatus("idle");
      // Whatever the copy said is about to stop being true of this cell.
      clearCopied();
      const res = await run();
      if (!res.ok) {
        setStatus("failed");
        return;
      }
      setMics(res.mics);
      setStatus("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      // Long enough to be read by somebody who was looking elsewhere as they
      // tapped, short enough not to sit there claiming the last thing you did.
      savedTimer.current = setTimeout(() => setStatus("idle"), 4000);
    });
  }

  /*
   * A row that has never been saved has no id for a chorus mic to hang off, so
   * the controls cannot appear yet — but the way out is one tap from here rather
   * than a sentence pointing at a button somewhere else on a wide table.
   */
  if (!slotId) {
    return onSaveRow ? (
      <button
        type="button"
        onClick={onSaveRow}
        className="self-start text-left text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
        title="Chorus mics attach to a saved row. This saves the session, then the controls appear here."
      >
        save to add chorus mics
      </button>
    ) : (
      <span className="text-[11px] text-on-surface-muted">save the row first</span>
    );
  }

  const taken = new Set(mics.map((m) => m.singerId));
  const available = singers.filter((s) => !taken.has(s.id));

  return (
    <div className="grid gap-1.5">
      {mics.map((mic) => (
        <div key={mic.singerId} className="grid gap-0.5">
          <span className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-[12px]" title={mic.name}>
              {mic.name}
            </span>
            {canEdit ? (
              <button
                type="button"
                disabled={pending}
                aria-label={`Take ${mic.name} off the chorus mic`}
                title={`Take ${mic.name} off the chorus mic`}
                className="shrink-0 rounded-key px-1 text-[13px] leading-none text-on-surface-muted hover:text-on-surface disabled:opacity-50"
                onClick={() =>
                  apply(() => removeChorusSinger({ slotId, singerId: mic.singerId }))
                }
              >
                ×
              </button>
            ) : null}
          </span>

          {/*
            The cushion as dots rather than a second select: it is the control
            the desk taps mid-session, and five colours read faster than a list
            does. One row of them per person, because each chorus mic has its
            own cushion.
          */}
          <span className="flex flex-wrap items-center gap-1">
            {/* The desk's cushions, same list the lead dots use — a chorus
                mic is a different mic, not a different set of cushions. */}
            {cushions.map((c) => {
              const on = mic.cushion === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  disabled={!canEdit || pending}
                  aria-pressed={on}
                  aria-label={`${c.label} chorus cushion for ${mic.name}`}
                  title={`${c.label} chorus cushion for ${mic.name}`}
                  className={`h-4 w-4 rounded-full border transition-transform ${
                    on ? "scale-110 border-on-surface" : "border-rule-surface opacity-70"
                  } ${canEdit ? "hover:opacity-100" : "cursor-default"}`}
                  style={{ background: c.dot }}
                  onClick={() =>
                    // Tapping the colour it already is clears it, which is how
                    // the dots next door behave and what a second tap means.
                    apply(() =>
                      setChorusCushion({
                        slotId,
                        singerId: mic.singerId,
                        colour: on ? null : (c.value as MicColourValue),
                      }),
                    )
                  }
                />
              );
            })}
          </span>
        </div>
      ))}

      {canEdit ? (
        /*
          Stays a select rather than becoming a multi-select list box. The
          people already on are shown above with their cushions, which a
          multi-select cannot do, and adding is one name at a time on a phone
          held in one hand.
        */
        available.length > 0 ? (
          <select
            value=""
            disabled={pending}
            aria-label="Add somebody to a chorus mic"
            className="h-8 w-full rounded-key border border-rule-surface bg-field px-2 text-[12px]"
            onChange={(e) => {
              const singerId = e.target.value;
              if (!singerId) return;
              e.target.value = "";
              apply(() => addChorusSinger({ slotId, singerId }));
            }}
          >
            <option value="">{mics.length ? "+ another" : "+ chorus mic"}</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null
      ) : mics.length === 0 ? (
        <span className="text-[12px]">—</span>
      ) : null}

      {/*
        COPY DOWN — the chorus is usually the same people all evening.

        Only offered where it can do something: somebody may allocate, there is
        a chorus here to copy, and there is a bhajan below to copy onto. It
        fills the empty ones and leaves any that have already been answered, so
        there is no confirm step and nothing to undo — and it says which it did,
        because "all of them already had mics" is a correct press that otherwise
        looks like a broken button.
      */}
      {canEdit && canCopyDown && mics.length > 0 ? (
        <button
          type="button"
          disabled={pending || !slotId}
          title="Put these chorus mics and cushions on the bhajans below that have none"
          className="self-start text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              if (!slotId) return;
              clearCopied();
              const res = await copyChorusDown({ slotId });
              setCopied(res.ok ? res.message : res.error);
              // Same reasoning as the tick, with longer on the clock: a
              // sentence takes longer to read than a mark does.
              copyTimer.current = setTimeout(() => setCopied(null), 8000);
              if (res.ok) onCopied?.(res.mics);
            })
          }
        >
          ↴ copy down
        </button>
      ) : null}

      {/*
        Said here, in the cell, not on the toolbar: this is the only place that
        can tell you the write has already happened.
      */}
      <span aria-live="polite" className="min-h-[13px] text-[11px] leading-none">
        {pending ? (
          <span className="text-on-surface-muted">Saving…</span>
        ) : copied ? (
          <span className="text-on-surface-muted">{copied}</span>
        ) : status === "saved" ? (
          <span className="text-on-surface-muted">Saved ✓</span>
        ) : status === "failed" ? (
          <span className="text-warn">Did not save.</span>
        ) : null}
      </span>
    </div>
  );
}
