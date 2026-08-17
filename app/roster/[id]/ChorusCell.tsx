"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CHORUS_COLOURS, type ChorusMic, type MicColourValue } from "@/lib/micCushion";
import {
  addChorusSinger,
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
 * Two permissions, because they are two different acts. WHO choruses is an
 * allocation (`assignSingers`); the CUSHION is live desk state that anybody
 * signed in may set (`setMicCushion`). A person may well be able to do one and
 * not the other, so each control is enabled on its own.
 */

export function ChorusCell({
  slotId,
  singers,
  mics: fromServer,
  canAssign,
  canSetCushion,
}: {
  slotId: string | null;
  singers: { id: string; name: string }[];
  mics: ChorusMic[];
  canAssign: boolean;
  canSetCushion: boolean;
}) {
  const [mics, setMics] = useState<ChorusMic[]>(fromServer);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    };
  }, []);

  /** Every write ends here: the server's list wins, and the cell says so. */
  function apply(run: () => Promise<ChorusResult>) {
    startTransition(async () => {
      setStatus("idle");
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

  // A row that has never been saved has no id to write against. It gets the
  // controls once it exists, rather than silently dropping what was chosen.
  if (!slotId) {
    return <span className="text-[11px] text-on-surface-muted">save the row first</span>;
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
            {canAssign ? (
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
            {CHORUS_COLOURS.map((c) => {
              const on = mic.cushion === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  disabled={!canSetCushion || pending}
                  aria-pressed={on}
                  aria-label={`${c.label} chorus cushion for ${mic.name}`}
                  title={`${c.label} chorus cushion for ${mic.name}`}
                  className={`h-4 w-4 rounded-full border transition-transform ${
                    on ? "scale-110 border-on-surface" : "border-rule-surface opacity-70"
                  } ${canSetCushion ? "hover:opacity-100" : "cursor-default"}`}
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

      {canAssign ? (
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
        Said here, in the cell, not on the toolbar: this is the only place that
        can tell you the write has already happened.
      */}
      <span aria-live="polite" className="min-h-[13px] text-[11px] leading-none">
        {pending ? (
          <span className="text-on-surface-muted">Saving…</span>
        ) : status === "saved" ? (
          <span className="text-on-surface-muted">Saved ✓</span>
        ) : status === "failed" ? (
          <span className="text-warn">Did not save.</span>
        ) : null}
      </span>
    </div>
  );
}
