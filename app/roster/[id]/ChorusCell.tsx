"use client";

import { useState, useTransition } from "react";
import { CHORUS_COLOURS, type MicColourValue } from "@/lib/micCushion";
import { setChorusCushion, setChorusSinger } from "./chorusActions";

/**
 * The chorus mic on one bhajan: who is on it, and what colour the cushion is.
 *
 * Writes immediately, on its own, exactly like the mic cushion dots next to it
 * — and deliberately NOT through the grid's save. That save carries the
 * historical record and refuses when somebody else has touched the same rows;
 * routing a cushion tap through it would make a sound person's tap fail a
 * coordinator's save as a conflict that is not one, during a session, which is
 * precisely when both happen at once.
 *
 * Two permissions, because they are two different acts. WHO choruses is an
 * allocation (`assignSingers`); the CUSHION is live desk state that anybody
 * signed in may set (`setMicCushion`). A person may well be able to do one and
 * not the other, so each control is enabled on its own.
 */
export function ChorusCell({
  slotId,
  singers,
  chorusSingerId,
  chorusCushion,
  canAssign,
  canSetCushion,
}: {
  slotId: string | null;
  singers: { id: string; name: string }[];
  chorusSingerId: string | null;
  chorusCushion: MicColourValue | null;
  canAssign: boolean;
  canSetCushion: boolean;
}) {
  const [singerId, setSingerId] = useState(chorusSingerId ?? "");
  const [cushion, setCushion] = useState<MicColourValue | null>(chorusCushion);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  // A row that has never been saved has no id to write against. It gets the
  // controls once it exists, rather than silently dropping what was chosen.
  if (!slotId) {
    return <span className="text-[11px] text-on-surface-muted">save the row first</span>;
  }

  const chosen = singers.find((s) => s.id === singerId);

  return (
    <div className="grid gap-1">
      {canAssign ? (
        <select
          value={singerId}
          disabled={pending}
          aria-label="Chorus mic singer"
          className="h-8 w-full rounded-key border border-rule-surface bg-field px-2 text-[12px]"
          onChange={(e) => {
            const next = e.target.value;
            setSingerId(next);
            startTransition(async () => {
              setFailed(false);
              const res = await setChorusSinger({ slotId, singerId: next || null });
              if (!res.ok) {
                setFailed(true);
                setSingerId(chorusSingerId ?? "");
              }
            });
          }}
        >
          <option value="">—</option>
          {singers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-[12px]">{chosen?.name ?? "—"}</span>
      )}

      {/*
        The cushion is only worth choosing once somebody is on the mic. Shown
        as dots rather than a second select: it is the control the desk taps
        mid-session, and five colours read faster than a list does.
      */}
      {singerId ? (
        <span className="flex flex-wrap items-center gap-1">
          {CHORUS_COLOURS.map((c) => {
            const on = cushion === c.value;
            return (
              <button
                key={c.value}
                type="button"
                disabled={!canSetCushion || pending}
                aria-pressed={on}
                aria-label={`${c.label} chorus cushion`}
                title={`${c.label} chorus cushion`}
                className={`h-4 w-4 rounded-full border transition-transform ${
                  on ? "scale-110 border-on-surface" : "border-rule-surface opacity-70"
                } ${canSetCushion ? "hover:opacity-100" : "cursor-default"}`}
                style={{ background: c.dot }}
                onClick={() => {
                  // Tapping the colour it already is clears it, which is how
                  // the dots next door behave and what a second tap means.
                  const next = on ? null : (c.value as MicColourValue);
                  setCushion(next);
                  startTransition(async () => {
                    setFailed(false);
                    const res = await setChorusCushion({ slotId, colour: next });
                    if (!res.ok) {
                      setFailed(true);
                      setCushion(chorusCushion);
                    }
                  });
                }}
              />
            );
          })}
        </span>
      ) : null}

      {failed ? <span className="text-[11px] text-warn">Did not save.</span> : null}
    </div>
  );
}
