"use client";

import { useEffect, useState, useTransition } from "react";
import { setGroupAnnounce } from "./notifyActions";

export type GroupAnnounceState = {
  /** Session.announceToGroup. On for every session unless somebody turned it off. */
  announce: boolean;
  /** How many people the quiet notice would go to — everybody not singing. */
  othersCount: number;
  /** Set once the notice has gone. Nothing can unsend it. */
  announced: boolean;
  /** When the settle window is up, ISO. */
  dueAtISO: string;
};

/**
 * Whether the rest of the group is told this session exists — in the header,
 * where the person who just made it will see it.
 *
 * Two audiences and only one of them is ever in doubt. The people rostered are
 * alerted the moment they are put on; this toggle does not offer to change that
 * and never will. Everybody ELSE gets the quiet "the roster is up" twenty
 * minutes after the roster stops changing, and that is what this controls.
 *
 * ON BY DEFAULT, ON EVERY SESSION. Sailavan, 2026-08-24: the option "should be
 * set by default but visible to the person creating the session when they do
 * it… so they can manually toggle it on/off as appropriate or required." An
 * earlier version silenced sessions of two or fewer singers on its own; that
 * was removed on the same instruction. A default that changes shape by itself
 * is harder to trust than one that is always the same and always on screen.
 *
 * In the HEADER rather than down the page with the reminder controls, for the
 * same reason. You land here the moment a session is created, and the twenty
 * minutes in which the decision can still be made are the twenty minutes you
 * are most likely to be looking at the top of this page. A control you have to
 * scroll to find is one you find after it has fired.
 */
export function GroupAnnounceToggle({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: GroupAnnounceState;
}) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const flip = () =>
    startTransition(async () => {
      setError(null);
      const next = !state.announce;
      const res = await setGroupAnnounce({ sessionId, announce: next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState((s) => ({ ...s, announce: next, announced: res.sentNow || s.announced }));
    });

  /*
   * Once it has gone, it has gone. A toggle still sitting there would offer to
   * undo something that cannot be undone — the phones have already buzzed.
   */
  if (state.announced) {
    return (
      <span
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-rule-surface px-3 text-[13px] text-on-surface-muted"
        title="The quiet 'roster is up' notice has been sent. The people singing were alerted separately, when they were put on."
      >
        <Bell on aria-hidden />
        Group told
      </span>
    );
  }

  const label = state.announce ? "Group will be told" : "Group not told";

  const detail = state.announce
    ? state.othersCount > 0
      ? `The ${state.othersCount} ${state.othersCount === 1 ? "person" : "people"} not singing will get the quiet "roster is up" notice.`
      : "Everybody is on this session, so there is nobody left to tell."
    : "Only the people singing are notified. The rest of the group will not hear that this session exists.";

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={state.announce}
        disabled={pending}
        onClick={flip}
        title={`${detail} Click to turn it ${state.announce ? "off" : "on"}.`}
        className={[
          "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors disabled:opacity-60",
          state.announce
            ? "border-brass/45 bg-brass/10 text-brass-ink hover:border-brass/70"
            : "border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
        ].join(" ")}
      >
        <Bell on={state.announce} aria-hidden />
        {pending ? "Saving…" : label}
      </button>

      {/*
        The countdown, under the pill and only while it is on. It is the part
        that makes the toggle actionable rather than informational: twenty
        minutes is long enough to change your mind and short enough that you
        need to know it is running.
      */}
      {state.announce ? (
        <span className="ps-1 text-[10px] text-on-surface-muted">
          <Countdown dueAtISO={state.dueAtISO} />
        </span>
      ) : null}

      {error ? (
        <span role="alert" className="ps-1 text-[10px] text-warn">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** A bell, struck through when nobody is being told. Decorative; the text says it. */
function Bell({ on }: { on: boolean; "aria-hidden"?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z" strokeLinejoin="round" />
      <path d="M6.5 13a1.6 1.6 0 0 0 3 0" strokeLinecap="round" />
      {on ? null : <path d="M2.5 2.5l11 11" strokeLinecap="round" />}
    </svg>
  );
}

/**
 * "In about 14 minutes", filled in after mount.
 *
 * The server has no clock it can offer — a countdown rendered there would be
 * stale by the time it arrived and would differ from the browser's first
 * render, which is a hydration mismatch. Same reasoning as SessionTime: render
 * the part that cannot be wrong, then add the part that needs a reader.
 *
 * Ticks every thirty seconds. It is a twenty-minute deadline, not a stopwatch.
 */
function Countdown({ dueAtISO }: { dueAtISO: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const due = new Date(dueAtISO).getTime();
    if (Number.isNaN(due)) return;

    const tick = () => {
      const mins = Math.round((due - Date.now()) / 60_000);
      setText(
        mins <= 0
          ? "on the next save, or within the hour"
          : mins === 1
            ? "in about a minute, unless the roster changes"
            : `in about ${mins} minutes, unless the roster changes`,
      );
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [dueAtISO]);

  return <>{text ?? "once the roster has stopped changing"}</>;
}
