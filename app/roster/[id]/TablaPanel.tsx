"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTablaOverride } from "./tablaActions";
import { ASHRAM_TABLAS } from "@/lib/tabla";

export type PanelSlot = {
  position: number;
  title: string;
  raga: string | null;
  confirmedPitch: string | null;
  sa: number | null;
  note: string | null;
  why: string;
  confidence: "certain" | "assumed" | "none";
  overridden: boolean;
  alternatives: string[];
};

export type PanelCall = { note: string; forBhajans: string[]; anyAssumed: boolean };

/**
 * "Which tablas to bring and tune", above the roster entries.
 *
 * The headline is the set of distinct drums, because that is the question
 * being asked before leaving home. The per-bhajan rows below are the working,
 * so a player can see WHY a drum is on the list and disagree with it.
 *
 * Every answer is overridable, and an override is stored against (raga, Sa) so
 * it applies next time the same combination comes up rather than having to be
 * repeated.
 */
export function TablaPanel({
  sessionId,
  slots,
  calls,
  canEdit,
}: {
  sessionId: string;
  slots: PanelSlot[];
  calls: PanelCall[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const unresolved = slots.filter((s) => !s.note && s.confirmedPitch);
  const anyAssumed = slots.some((s) => s.confidence === "assumed");

  const save = (slot: PanelSlot, note: string, scope: "raga" | "any") => {
    if (slot.sa === null) return;
    setBusy(slot.position);
    startTransition(async () => {
      try {
        const res = await setTablaOverride({
          sessionId,
          raga: slot.raga,
          sa: slot.sa!,
          note,
          scope,
        });
        if (!res.ok) setError(res.error);
        else {
          setError(null);
          setOpenRow(null);
        }
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="grid gap-3 rounded-[14px] border border-brass/35 bg-brass/[0.05] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-muted">
          Tablas to bring
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-on-surface-muted">
            Ashram has {ASHRAM_TABLAS.join(", ")}
          </span>
          {/*
            THE LIVE VIEW, FOR THE ONE PERSON THIS PANEL PUSHES DOWN THE PAGE.

            There is already a Live view button in the session header — but this
            panel sits ABOVE that header, and it is the only thing on the page
            that does. It has to: it answers "which drums do I put in the car",
            which is asked before leaving home, so it cannot be below the
            roster grid.

            The cost is paid by the same person who benefits. On a session with
            a dozen bhajans the working list below is a dozen rows, and on a
            phone that is most of a screen to scroll past before the header
            button comes into view — at exactly the moment a tabla player wants
            it, which is when the session is starting. Sailavan, 2026-08-27:
            "if there are many bhajans the tablas to use section fills up the
            page on the phone and they have to scroll to get to the live view."

            So the button is repeated here, at the top of the thing that is in
            its way. Same destination as the header's; nobody else sees two.
          */}
          <Link
            href={`/roster/${sessionId}/live`}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-brass/45 bg-brass/10 px-3 text-[13px] font-semibold text-brass-ink hover:border-brass/70"
          >
            <span aria-hidden>▶</span> Live view
          </Link>
        </div>
      </div>

      {calls.length === 0 && unresolved.length === 0 ? (
        <p className="text-sm text-on-surface-muted">
          No confirmed pitches yet, so there is nothing to tune to.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {calls.map((c) => (
            <span
              key={c.note}
              /* One width for every drum, so they read as a row of keys rather
                 than chips of different sizes. */
              className="inline-flex w-[5.5rem] flex-col items-center rounded-[10px] border-2 border-brass/45 bg-field px-2 py-1.5"
              title={c.forBhajans.join(", ")}
            >
              <span className="font-mono text-xl font-semibold leading-none">{c.note}</span>
              <span className="mt-0.5 text-[10px] text-on-surface-muted">
                {c.forBhajans.length} bhajan{c.forBhajans.length === 1 ? "" : "s"}
              </span>
            </span>
          ))}
          {unresolved.length > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-[10px] border border-warn/50 bg-warn/[0.08] px-3 py-1.5 text-sm">
              {unresolved.length} need{unresolved.length === 1 ? "s" : ""} a decision
            </span>
          ) : null}
        </div>
      )}

      {anyAssumed ? (
        <p className="text-xs text-on-surface-muted">
          Some rows assume the raga has Sa, Pa and Ma because its notes are not recorded.
          Correct any of them below and the choice sticks for that raga at that pitch.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <ul className="grid gap-1">
        {slots.map((s) => (
          <li
            key={s.position}
            className="grid gap-1 rounded-[10px] border border-rule-surface bg-surface px-3 py-1.5"
          >
            {/*
              A fixed grid, not a flex row.
              
              Every piece here varies in length — a bhajan title, a dual raga
              name, "the fourth of G# — tune to C#" against a bare "Sa" — so a
              flex row put the drum and the change link in a different place on
              every line and the column read as random. Fixed tracks mean the
              answer is always in the same spot, which is the whole use of this
              panel: run your eye down one column.

              On a phone five columns will not fit honestly, so the answer
              drops to a second line — still drum, then reason, then change, in
              that order and at fixed widths. `sm:contents` dissolves that
              wrapper back into the grid at width, so there is one markup for
              both.
            */}
            <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 sm:grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_11rem_4rem]">
              <span className="font-mono text-xs text-on-surface-muted">{s.position}</span>

              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                {s.raga ? (
                  <span className="block truncate text-xs italic text-on-surface-muted">
                    {s.raga}
                  </span>
                ) : null}
              </span>

              <div className="col-start-2 flex items-center gap-2 sm:contents">
              {/* The drum, always in the same column and always the same width. */}
              <span
                className={[
                  "inline-flex h-7 w-[3.25rem] shrink-0 items-center justify-center rounded-[8px] border font-mono text-sm font-semibold sm:col-start-3",
                  s.note ? "border-brass/45 bg-field" : "border-warn/50 bg-warn/[0.08]",
                ].join(" ")}
                title={s.why}
              >
                {s.note ?? "—"}
              </span>

              <span className="min-w-0 flex-1 truncate text-[11px] text-on-surface-muted sm:col-start-4 sm:self-center">
                {s.overridden ? "set by hand" : s.confidence === "assumed" ? "assumed" : s.why}
              </span>

              {canEdit && s.sa !== null ? (
                <button
                  type="button"
                  onClick={() => setOpenRow(openRow === s.position ? null : s.position)}
                  className="shrink-0 text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface sm:col-start-5 sm:justify-self-end sm:self-center"
                >
                  {openRow === s.position ? "close" : "change"}
                </button>
              ) : (
                <span className="hidden sm:block" />
              )}
              </div>
            </div>

            {!s.note && s.alternatives.length > 0 ? (
              <p className="text-xs text-on-surface-muted">
                Nothing fits {s.confirmedPitch}. Singing at {s.alternatives.join(" or ")} would
                work.
              </p>
            ) : null}

            {openRow === s.position && canEdit ? (
              <div className="grid gap-1.5 border-t border-rule-surface pt-1.5">
                <p className="text-[11px] text-on-surface-muted">
                  Applies to <strong>{s.raga || "any raga"}</strong> at this pitch, now and in
                  future.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ASHRAM_TABLAS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy === s.position}
                      onClick={() => save(s, t, s.raga ? "raga" : "any")}
                      className={[
                        "h-7 rounded-[8px] border px-2 font-mono text-sm",
                        s.note === t ? "border-brass bg-brass/15 font-semibold" : "border-rule-surface bg-field hover:border-brass/50",
                      ].join(" ")}
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy === s.position}
                    onClick={() => save(s, "none", s.raga ? "raga" : "any")}
                    className="h-7 rounded-[8px] border border-rule-surface bg-field px-2 text-xs hover:border-brass/50"
                  >
                    none fits
                  </button>
                  {s.overridden ? (
                    <button
                      type="button"
                      disabled={busy === s.position}
                      onClick={() => save(s, "", s.raga ? "raga" : "any")}
                      className="h-7 rounded-[8px] border border-rule-surface bg-field px-2 text-xs text-on-surface-muted hover:border-brass/50"
                    >
                      use the rule again
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
