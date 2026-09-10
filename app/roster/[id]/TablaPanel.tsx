"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTablaOverride, setTablaRagaRule } from "./tablaActions";
import { ASHRAM_TABLAS, DEGREE_PREFERENCE, type DegreeKey, type TablaStep } from "@/lib/tabla";
import { NOTE_NAMES } from "@/lib/pitch";

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
  /** Every degree the rule considered, and what became of each. */
  steps: TablaStep[];
  /** The raga's notes as semitones above Sa, or null when not recorded. */
  ragaSemitones: number[] | null;
  /** Which layer answered: the standard order, a raga rule, or a hand-set note. */
  decidedBy: "rule" | "raga" | "hand";
  /** The raga rule in force for this raga, if any. */
  ragaRuleDegree: DegreeKey | null;
};

/** Sa, R, G… for the degrees the raga actually has. Read left to right. */
const SEMITONE_NAMES = ["Sa", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];

function describeScale(semitones: number[] | null): string {
  if (!semitones) return "notes not recorded";
  return [...semitones].sort((a, b) => a - b).map((n) => SEMITONE_NAMES[n] ?? n).join(" ");
}

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
  /*
   * The working is a SEPARATE disclosure from the change control.
   *
   * Sailavan, 2026-09-10, asked for "that amount of the working being visible"
   * AND for "me being able to visually select the one i'd prefer" — two things,
   * and reading the rule is much the commoner of them. Folding them into one
   * panel would mean opening an editor to answer a question.
   */
  const [openWhy, setOpenWhy] = useState<number | null>(null);

  const unresolved = slots.filter((s) => !s.note && s.confirmedPitch);
  const anyAssumed = slots.some((s) => s.confidence === "assumed");

  const run = (
    slot: PanelSlot,
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) => {
    setBusy(slot.position);
    startTransition(async () => {
      try {
        const res = await fn();
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

  /** A drum, pinned to one pitch. `scope: "any"` means every raga at that Sa. */
  const saveNote = (slot: PanelSlot, note: string, scope: "raga" | "any") => {
    if (slot.sa === null) return;
    run(slot, () =>
      setTablaOverride({ sessionId, raga: slot.raga, sa: slot.sa!, note, scope }),
    );
  };

  /**
   * A degree, for this raga, at every pitch.
   *
   * The one an override cannot express: a stored note only ever answers one Sa,
   * whereas "for Desh, prefer the fifth" answers all twelve. Picking a DRUM
   * here would be the wrong question, so the buttons below offer degrees and
   * name the drum each would give at this pitch.
   */
  const saveRagaRule = (slot: PanelSlot, degree: string) => {
    if (!slot.raga) return;
    run(slot, () => setTablaRagaRule({ sessionId, raga: slot.raga!, degree }));
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

              <span className="flex shrink-0 items-center gap-2 sm:col-start-5 sm:justify-self-end sm:self-center">
                {/*
                  "why" is open to EVERYBODY, unlike "change".
                  
                  A tabla player who cannot edit the roster is exactly the
                  person who most wants to know why they are being sent for a
                  C — and they are the one carrying it.
                */}
                {s.steps.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenWhy(openWhy === s.position ? null : s.position)}
                    aria-expanded={openWhy === s.position}
                    className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                  >
                    {openWhy === s.position ? "hide" : "why"}
                  </button>
                ) : null}
                {canEdit && s.sa !== null ? (
                  <button
                    type="button"
                    onClick={() => setOpenRow(openRow === s.position ? null : s.position)}
                    aria-expanded={openRow === s.position}
                    className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                  >
                    {openRow === s.position ? "close" : "change"}
                  </button>
                ) : null}
              </span>
              </div>
            </div>

            {/*
              THE WORKING.

              Sailavan, 2026-09-10: "I like that amount of the working being
              visible... so its not manually being changed everytime and the
              rule can cover more scenarios." The point is not transparency for
              its own sake — it is that seeing WHERE the rule went wrong tells
              you which level to correct it at. A row that reads "Ma · C · in
              the raga · a better degree won" is a preference; one that reads
              "P · D · not in this raga" is the scale table being wrong.

              Every degree, including the ones tried after the winner, so the
              list is the rule rather than an excerpt of it.
            */}
            {openWhy === s.position ? (
              <div className="grid gap-1.5 border-t border-rule-surface pt-1.5">
                <p className="text-[11px] text-on-surface-muted">
                  {s.raga ? <strong>{s.raga}</strong> : "No raga recorded"}
                  {" · "}
                  {describeScale(s.ragaSemitones)}
                  {s.sa !== null ? ` · Sa is ${NOTE_NAMES[s.sa]}` : ""}
                </p>

                <p className="text-[11px] text-on-surface-muted">
                  {s.decidedBy === "hand"
                    ? "Set by hand for this raga and pitch — the rule below is what it replaced."
                    : s.decidedBy === "raga"
                      ? `A rule for this raga puts ${DEGREE_PREFERENCE.find((d) => d.key === s.ragaRuleDegree)?.description ?? "a degree"} first.`
                      : "The standard order: Sa, then the fifth, then the fourth, then a third, a sixth, a flat seventh."}
                </p>

                <ul className="grid gap-0.5 text-[11px]">
                  {s.steps.map((st, i) => (
                    <li
                      key={`${st.degree}-${st.semitone}-${i}`}
                      className={[
                        "grid grid-cols-[2.25rem_2.5rem_minmax(0,1fr)] items-baseline gap-x-2 rounded-[6px] px-1.5 py-0.5",
                        st.chosen ? "bg-brass/[0.12] font-semibold" : "odd:bg-panel",
                      ].join(" ")}
                    >
                      <span className="font-mono">{st.label}</span>
                      <span className="font-mono">{st.note}</span>
                      <span className="min-w-0 text-on-surface-muted">
                        {st.chosen ? "chosen" : st.passed}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!s.note && s.alternatives.length > 0 ? (
              <p className="text-xs text-on-surface-muted">
                Nothing fits {s.confirmedPitch}. Singing at {s.alternatives.join(" or ")} would
                work.
              </p>
            ) : null}

            {openRow === s.position && canEdit ? (
              <div className="grid gap-2.5 border-t border-rule-surface pt-1.5">
                {/*
                  TWO SCOPES, because they answer different questions.

                  Sailavan, 2026-09-10: an override should be "not just
                  remembering it for that pitch and that raag, but almost for
                  that raag". The upper block is the raga-wide one and comes
                  first for that reason — it is the one that stops a question
                  recurring, and the per-pitch drum below is the escape hatch
                  for a genuine one-off.

                  The raga-wide block offers DEGREES, not drums, and that is
                  forced rather than chosen: a drum cannot generalise across
                  pitches. The fifth of G is D and the fifth of F is C, so a
                  stored "D" would be wrong for the same raga a week later.
                  Each button names the drum its degree gives AT THIS PITCH, so
                  the abstract choice still has a concrete answer beside it.
                */}
                {s.raga ? (
                  <div className="grid gap-1">
                    <p className="text-[11px] text-on-surface-muted">
                      For <strong>{s.raga}</strong>, at every pitch — prefer:
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {DEGREE_PREFERENCE.map((d) => {
                        const step = s.steps.find((st) => st.degree === d.key);
                        const on = s.ragaRuleDegree === d.key;
                        // Not in the raga, or not a drum the centre owns: the
                        // rule would quietly do nothing, so say so rather than
                        // offering a button that looks like it works.
                        const dead = step ? step.inRaga === false || !step.owned : false;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            disabled={busy === s.position || dead}
                            title={
                              dead
                                ? `${d.description} is not available here — ${step?.passed ?? ""}`
                                : `Prefer ${d.description} for ${s.raga}, at every pitch`
                            }
                            onClick={() => saveRagaRule(s, on ? "" : d.key)}
                            className={[
                              "h-7 rounded-[8px] border px-2 text-xs",
                              on
                                ? "border-brass bg-brass/15 font-semibold"
                                : "border-rule-surface bg-field hover:border-brass/50",
                              dead ? "opacity-40" : "",
                            ].join(" ")}
                          >
                            {d.description}
                            {step ? (
                              <span className="ms-1 font-mono text-on-surface-muted">
                                {step.note}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                      {s.ragaRuleDegree ? (
                        <button
                          type="button"
                          disabled={busy === s.position}
                          onClick={() => saveRagaRule(s, "")}
                          className="h-7 rounded-[8px] border border-rule-surface bg-field px-2 text-xs text-on-surface-muted hover:border-brass/50"
                        >
                          drop this raga rule
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <p className="text-[11px] text-on-surface-muted">
                  Or pin a drum for <strong>{s.raga || "any raga"}</strong> at{" "}
                  <strong>this pitch only</strong>:
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ASHRAM_TABLAS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy === s.position}
                      onClick={() => saveNote(s, t, s.raga ? "raga" : "any")}
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
                    onClick={() => saveNote(s, "none", s.raga ? "raga" : "any")}
                    className="h-7 rounded-[8px] border border-rule-surface bg-field px-2 text-xs hover:border-brass/50"
                  >
                    none fits
                  </button>
                  {s.overridden ? (
                    <button
                      type="button"
                      disabled={busy === s.position}
                      onClick={() => saveNote(s, "", s.raga ? "raga" : "any")}
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
