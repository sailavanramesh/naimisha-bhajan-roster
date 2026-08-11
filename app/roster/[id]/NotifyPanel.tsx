"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { sendManualNotice } from "./notifyActions";

export type NotifyPerson = {
  id: string;
  name: string;
  /** "" when their row is complete. Otherwise "no bhajan", "no pitch", … */
  gap: string;
  /** False when nobody has turned notifications on for them on any device. */
  hasDevice: boolean;
};

/**
 * Send one person a reminder, by hand.
 *
 * Collapsed to a single line of text until asked for — the same idiom as
 * "Copy rows to another day" directly above it. Sailavan asked for this to be
 * discreet, and it should be: the app nudges people on its own at 3pm, so a
 * button that pushes to somebody's phone is the exception, not part of the
 * normal run of editing a session. A prominent one invites use it does not
 * need.
 *
 * Every rostered person is listed whether or not their row is complete,
 * because "you are singing Bhaja Govindam on Thursday" is a legitimate thing
 * to want to send somebody who has gone quiet.
 */
export function NotifyPanel({
  sessionId,
  people,
}: {
  sessionId: string;
  people: NotifyPerson[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (people.length === 0) return null;

  const send = (singerId: string) => {
    setBusy(singerId);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await sendManualNotice({ sessionId, singerId });
        setResult(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      } finally {
        setBusy(null);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="justify-self-start text-sm text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
      >
        Send someone a reminder
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-[12px] border border-rule-surface bg-panel p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Send a reminder</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-on-surface-muted underline underline-offset-2"
        >
          Close
        </button>
      </div>

      <p className="text-[11px] text-on-surface-muted">
        Goes straight to their phone. Everyone rostered is reminded automatically at 3pm on the
        day, so this is only for when that is not enough.
      </p>

      {/* Fixed tracks: name, then state, then the button on one right edge. */}
      <ul className="grid gap-1">
        {people.map((p) => (
          <li
            key={p.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[8px] px-2 py-1 text-sm odd:bg-surface/60 sm:grid-cols-[8rem_minmax(0,1fr)_5.5rem]"
          >
            <span className="truncate font-medium">{p.name}</span>
            <span className="col-span-2 truncate text-[11px] text-on-surface-muted sm:col-span-1">
              {!p.hasDevice
                ? "no device set up"
                : p.gap
                  ? p.gap
                  : "row complete — will be reminded what they are singing"}
            </span>
            <Button
              type="button"
              variant="quiet"
              className="col-start-2 h-8 justify-self-end px-3 text-xs sm:col-start-3"
              disabled={pending || !p.hasDevice}
              onClick={() => send(p.id)}
            >
              {busy === p.id ? "Sending…" : "Send"}
            </Button>
          </li>
        ))}
      </ul>

      {result ? (
        <p
          role="status"
          className={[
            "rounded-[10px] px-3 py-2 text-sm",
            result.ok
              ? "border border-brass/40 bg-brass/[0.08]"
              : "border border-warn/40 bg-warn/[0.08]",
          ].join(" ")}
        >
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
