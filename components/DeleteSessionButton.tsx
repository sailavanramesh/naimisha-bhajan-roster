"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "@/app/roster/[id]/metaActions";

/**
 * Delete this session. Two steps, and quiet until asked.
 *
 * LIVES HERE, not in app/roster/[id]/, and that matters. It was in the route
 * directory and imported two ways — `./DeleteSessionButton` from the session
 * page and `@/app/roster/[id]/DeleteSessionButton` from the programme page. A
 * shared CLIENT component inside a dynamic route segment breaks the React
 * Client Manifest, and it breaks NON-DETERMINISTICALLY, depending on how that
 * build happened to chunk things:
 *
 *   Error: Could not find the module ".../app/roster/[id]/DeleteSessionButton
 *   .tsx#DeleteSessionButton" in the React Client Manifest.
 *
 * Which surfaces as "Application error: a server-side exception has occurred" on
 * every session and programme page, for anybody who may delete one. Sailavan hit
 * exactly that on 2026-08-21, on a laptop and a phone, while the build before and
 * the build after were both fine — which is why it looked like an outage rather
 * than a bug.
 *
 * Importing the server ACTION back across the same bracketed path is fine and
 * proven — components/MicCushions.tsx has done it for weeks. It is the client
 * component reference that cannot live there.
 *
 * A plain line of text rather than a red button: deleting a session is a rare
 * correction — a day tapped by mistake, a duplicate — not part of running a
 * roster, and a destructive control sitting in the eyeline all evening is one
 * that eventually gets pressed.
 *
 * IT ARCHIVES. Since 2026-08-18 this takes the session out of every view and
 * every history but keeps the row, and only an owner can finish the job from
 * /admin/archive. So the confirm step guards against a mis-click rather than
 * against data loss — nothing here is final.
 *
 * It still says what will go, because "3 rows" is the difference between an
 * empty mistake and somebody's plan for Thursday, and it says so louder when
 * confirmed pitches are involved: those come out of the history for as long as
 * the session is archived, which is the one consequence that is not obvious
 * from the words "removed from the list".
 */
export function DeleteSessionButton({
  sessionId,
  dateLabel,
  rows,
  pitches = 0,
  kind = "session",
  backTo = "/roster",
}: {
  sessionId: string;
  dateLabel: string;
  rows: number;
  /** Confirmed pitches on it — what somebody actually sang. Worth naming. */
  pitches?: number;
  /**
   * What is being deleted, in the words on screen. A music program is a Session
   * underneath and deletes through the same action, but nobody at the centre
   * calls it a session, and "the 3 rows on it" is not what a program has.
   */
  kind?: "session" | "program";
  /** Where to go afterwards — the list this thing came from. */
  backTo?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirm = () =>
    startTransition(async () => {
      const res = await deleteSession(sessionId);
      if (!res.ok) {
        setError(res.error);
        setArmed(false);
        return;
      }
      router.push(backTo);
      router.refresh();
    });

  if (!armed) {
    return (
      <div className="grid gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          className="justify-self-start text-xs text-on-surface-muted underline underline-offset-2 hover:text-warn"
        >
          Remove this {kind}
        </button>
        {error ? (
          <p role="alert" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2">
      <p className="text-xs">
        Remove <strong>{dateLabel}</strong>
        {rows > 0 ? (
          <>
            {" "}
            and the {rows} {kind === "program" ? "item" : "row"}
            {rows === 1 ? "" : "s"} on it
          </>
        ) : kind === "program" ? (
          " (nothing is in it)"
        ) : (
          " (nothing is rostered on it)"
        )}
        ? It goes out of every list and every history, and stays in the archive where an
        owner can put it back.
      </p>
      {pitches > 0 ? (
        <p className="text-xs font-semibold">
          {pitches} confirmed pitch{pitches === 1 ? "" : "es"} on it — what those singers
          actually sang — will not count towards anybody&rsquo;s history until it is restored.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="h-8 rounded-[8px] border border-warn/60 bg-warn/15 px-3 text-xs font-semibold hover:bg-warn/25"
        >
          {pending ? "Removing…" : "Yes, remove it"}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={pending}
          className="text-xs text-on-surface-muted underline underline-offset-2"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
