"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DeskStrips, stripName } from "@/components/DeskStrips";
import {
  planLiveDeskForSlots,
  stripWho,
  type CushionPerson,
  type LiveSlotInput,
  type LiveStrip,
} from "@/lib/liveDesk";
import { micColourLabel } from "@/lib/micCushion";
import { setCurrentBhajan, setSessionDesk } from "./deskActions";

/**
 * The desk, on a bhajan night — every bhajan of it, at once.
 *
 * The same drawn mixer the programme side uses, and now the same shape of
 * screen: one desk per bhajan down the page, the way "All songs" reads on
 * /program/[id]/desk. Sailavan asked for all three in the one view, and the
 * reason it is worth doing per bhajan rather than once for the session is that
 * the answer genuinely differs — the lead changes every bhajan, and the chorus
 * cushions belong to the bhajan rather than to the night.
 *
 * NOTHING IS ASSIGNED HERE. On a Thursday a singer takes a cushion for the
 * night, the cushions sit on fixed channels, and tapping a coloured dot on the
 * board has already said who is on channel 1. See lib/liveDesk.ts, where the
 * join is a pure function.
 *
 * UNDERSTATED ON PURPOSE. Sailavan: "viewable to all, but not as obvious as in
 * the programs, just a button to toggle". Most people on this screen want the
 * bhajan and the shruti; this is for the one person at the back.
 */
export function LiveDesk({
  sessionId,
  deskName,
  deskId,
  desks,
  strips,
  instruments,
  slots,
  currentPosition,
  canSetUpDesk,
}: {
  sessionId: string;
  deskName: string | null;
  /** Null when the session is riding the default desk rather than a chosen one. */
  deskId: string | null;
  desks: { id: string; name: string }[];
  strips: LiveStrip[];
  /** Lines live on every bhajan — the tabla, when the drum is mic'd. */
  instruments: { label: string; person: string | null }[];
  slots: LiveSlotInput[];
  /** Which bhajan the room is on. Null until somebody says. */
  currentPosition: number | null;
  canSetUpDesk: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const plans = planLiveDeskForSlots({ strips, slots, instruments });

  if (strips.length === 0) {
    return (
      <div className="grid gap-2 p-4 text-sm text-on-ground-muted">
        <p>No desk set up yet, so there are no channels to show.</p>
        {canSetUpDesk ? (
          <p>
            Describe one in Admin → Sound desks and tick it as the default; every session
            reads it from there.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-on-ground-muted">
          {deskName ?? "No desk"} · who is on which channel, from the cushions.
        </p>

        {/*
          Which desk, for the night that is not the usual one — a festival patch
          rather than an ordinary Thursday. Only for editors and the two sound
          jobs; the action checks the same rule again server-side.
        */}
        <span className="flex flex-wrap items-center gap-3">
        {/*
          Editing the desk itself — its strips, and which cushion is on which
          channel — as opposed to which desk this session is on. Shown to the
          same people, because the two sets are the same: editPrograms or one of
          the sound roles on one side, `manageDesks` by role or grant on the
          other. /admin/desks enforces its own rule regardless.
        */}
        {canSetUpDesk ? (
          <Link
            href="/admin/desks"
            className="text-xs text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
          >
            Set up the desk →
          </Link>
        ) : null}

        {canSetUpDesk && desks.length > 0 ? (
          <select
            value={deskId ?? ""}
            aria-label="Which desk this session is on"
            disabled={pending}
            className="h-8 rounded-key border border-rule bg-surface px-2 text-xs"
            onChange={(e) =>
              startTransition(async () => {
                setError(null);
                const res = await setSessionDesk({ sessionId, deskId: e.target.value });
                if (!res.ok) setError(res.error);
              })
            }
          >
            <option value="">The default desk</option>
            {desks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : null}
        </span>
      </div>

      {error ? (
        <p role="status" className="text-xs text-warn">
          {error}
        </p>
      ) : null}

      {plans.length === 0 ? (
        <p className="text-sm text-on-ground-muted">Nothing rostered on this session yet.</p>
      ) : null}

      <ul className="grid gap-2">
        {plans.map((s) => {
          const here = s.position === currentPosition;

          return (
            <li
              key={s.position}
              /*
                THE BHAJAN THE ROOM IS ON, ringed in brass.

                The same mark an open strip carries, for the same reason: on
                this screen brass means "this one, now". Lifted from the
                programme desk's all-songs view rather than invented, because
                these two screens are read the same way — from across a hall,
                looking for your place.
              */
              className={[
                "grid gap-1.5 rounded-[12px] px-2 py-2",
                here ? "bg-brass/[0.06] ring-2 ring-brass/70" : "",
              ].join(" ")}
            >
              {/*
                Tapping a bhajan moves THE ROOM to it, not just this screen —
                Session.currentItemPosition is shared, so the desk, the stage
                and anybody watching follow within a poll. Tapping the one
                already current puts the session back to "not begun", which is
                the only way to undo a mis-tap.
              */}
              <button
                type="button"
                disabled={pending}
                aria-pressed={here}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const res = await setCurrentBhajan({
                      sessionId,
                      position: here ? null : s.position,
                    });
                    if (!res.ok) setError(res.error);
                  })
                }
                className="flex flex-wrap items-baseline gap-2 text-left"
              >
                <span
                  className={[
                    "rounded-key px-1.5 py-0.5 font-mono text-[11px] font-bold",
                    here ? "bg-brass-ink text-ivory" : "text-on-ground-muted",
                  ].join(" ")}
                >
                  {s.position}
                </span>
                <span className={here ? "font-semibold" : ""}>{s.title}</span>
                <span className="text-xs text-on-ground-muted">
                  {s.openIds.size} of {strips.length} open
                  {here ? " · now" : ""}
                </span>
              </button>

              <DeskStrips
                dense
                strips={s.plan.strips.map((a) => ({
                  id: a.strip.id,
                  number: a.strip.number,
                  label: a.strip.label,
                  kind: a.strip.kind,
                  colour: a.strip.colour,
                  mic: a.strip.mic,
                  stereo: a.strip.stereo,
                  who: stripName(stripWho(a), a.strip.label),
                }))}
                openIds={s.openIds}
                /*
                  The ring means "look at this". On a programme it marks a mic
                  that has changed hands for one item; here it marks a channel
                  two people are on, which is the same instruction — read this
                  strip before the session starts.
                */
                swappedIds={new Set(s.plan.strips.filter((a) => a.clash).map((a) => a.strip.id))}
                leadIds={s.leadStripIds}
                flagLabel="two people on this cushion"
              />

              {/*
                THE TWO WAYS THE COLOURS DO NOT LINE UP, said plainly, under the
                bhajan they apply to.

                Both are setup problems somebody can fix in ten seconds if they
                are told — and both would otherwise show as a strip that quietly
                says one name when two people are holding that mic.
              */}
              {s.plan.hasProblem ? (
                <div className="grid gap-1 rounded-[10px] border border-warn/40 bg-surface/60 px-2.5 py-2 text-xs">
                  {s.plan.strips
                    .filter((a) => a.clash)
                    .map((a) => (
                      <p key={a.strip.id} className="text-warn">
                        Channel {a.strip.number} has {a.people.map((p) => p.name).join(" and ")} on
                        the same cushion.
                      </p>
                    ))}
                  {s.plan.unplaced.length > 0 ? (
                    <p className="text-warn">
                      {s.plan.unplaced.map(named).join(", ")}{" "}
                      {s.plan.unplaced.length === 1 ? "is on a cushion" : "are on cushions"} this
                      desk has no channel for.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {s.plan.noCushion.length > 0 ? (
                <p className="text-xs text-on-ground-muted">
                  No cushion yet: {s.plan.noCushion.map((p) => p.name).join(", ")}.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Jothsna (maroon)" — the name is not enough when the colour is the problem. */
function named(p: CushionPerson): string {
  return `${p.name} (${micColourLabel(p.cushion).toLowerCase()})`;
}
