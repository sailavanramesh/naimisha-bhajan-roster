"use client";

import { useState, useTransition } from "react";
import { DeskStrips, stripName } from "@/app/program/[id]/DeskStrips";
import { planLiveDesk, stripWho, type CushionPerson, type LiveStrip } from "@/lib/liveDesk";
import { micColourDot, micColourLabel } from "@/lib/micCushion";
import { setSessionDesk } from "./deskActions";

/**
 * The desk, on a bhajan night.
 *
 * The same drawn mixer the programme side uses — one picture of the desk, not
 * two that drift — but with nothing to assign. On a Thursday a singer takes a
 * cushion for the night and the cushions are on fixed channels, so tapping a
 * coloured dot on the board has already said who is on channel 1. See
 * lib/liveDesk.ts, where the join is a pure function.
 *
 * UNDERSTATED ON PURPOSE. Sailavan: "viewable to all, but not as obvious as in
 * the programs, just a button to toggle to switch to that view and see the mic
 * view." Most people on this screen want the bhajan and the shruti; this is for
 * the one person at the back, and it costs them one press to reach.
 */
export function LiveDesk({
  sessionId,
  deskName,
  deskId,
  desks,
  strips,
  people,
  chorus,
  canSetUpDesk,
}: {
  sessionId: string;
  deskName: string | null;
  /** Null when the session is riding the default desk rather than a chosen one. */
  deskId: string | null;
  desks: { id: string; name: string }[];
  strips: LiveStrip[];
  /** The night's lead singers, with whatever cushion each is on. */
  people: CushionPerson[];
  /** Chorus mics, which belong to a bhajan rather than to the night. */
  chorus: { position: number; bhajanTitle: string; mics: CushionPerson[] }[];
  canSetUpDesk: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const plan = planLiveDesk({ strips, people });

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
    <div className="grid gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-on-ground-muted">
          {deskName ?? "No desk"} · who is on which channel, from the cushions.
        </p>

        {/*
          Which desk, for the night that is not the usual one — a festival patch
          rather than an ordinary Thursday. Only for editors and the two sound
          jobs; the action checks the same rule again server-side.
        */}
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
      </div>

      {error ? (
        <p role="status" className="text-xs text-warn">
          {error}
        </p>
      ) : null}

      <DeskStrips
        strips={plan.strips.map((a) => ({
          id: a.strip.id,
          number: a.strip.number,
          label: a.strip.label,
          kind: a.strip.kind,
          colour: a.strip.colour,
          mic: a.strip.mic,
          stereo: a.strip.stereo,
          who: stripName(stripWho(a), a.strip.label),
        }))}
        /*
         * Lit where somebody is on the mic. `openIds` means "this fader is up"
         * on the programme side, and it means the same thing here: an empty
         * strip is a channel nobody is singing on tonight.
         */
        openIds={new Set(plan.strips.filter((a) => a.people.length > 0).map((a) => a.strip.id))}
        /*
         * The ring means "look at this". On a programme it marks a mic that has
         * changed hands for one item; here it marks a channel two people are on,
         * which is the same instruction — read this strip before the session
         * starts — so `flagLabel` renames it rather than a second mechanism.
         */
        swappedIds={new Set(plan.strips.filter((a) => a.clash).map((a) => a.strip.id))}
        flagLabel="two people on this cushion"
      />

      {/*
        THE TWO WAYS THE COLOURS DO NOT LINE UP, said plainly.

        Both are setup problems somebody can fix in ten seconds if they are told
        — and both would otherwise show as a strip that quietly says one name
        when two people are holding that mic.
      */}
      {plan.hasProblem ? (
        <div className="grid gap-1.5 rounded-[10px] border border-warn/40 bg-surface/60 p-2.5 text-xs">
          {plan.strips
            .filter((a) => a.clash)
            .map((a) => (
              <p key={a.strip.id} className="text-warn">
                Channel {a.strip.number} has {a.people.map((p) => p.name).join(" and ")} on the
                same cushion.
              </p>
            ))}
          {plan.unplaced.length > 0 ? (
            <p className="text-warn">
              {plan.unplaced
                .map((p) => `${p.name} (${micColourLabel(p.cushion).toLowerCase()})`)
                .join(", ")}{" "}
              {plan.unplaced.length === 1 ? "is on a cushion" : "are on cushions"} this desk has
              no channel for.
            </p>
          ) : null}
        </div>
      ) : null}

      {plan.noCushion.length > 0 ? (
        <p className="text-xs text-on-ground-muted">
          No cushion yet: {plan.noCushion.map((p) => p.name).join(", ")}.
        </p>
      ) : null}

      {/*
        The chorus, listed rather than laid on the desk.

        A chorus cushion belongs to a BHAJAN, not to the night — the same singer
        may lead one on blue and chorus another on green — so laying them over
        the same strips would invent a clash on every session that has any.
      */}
      {chorus.length > 0 ? (
        <div className="grid gap-1.5">
          <p className="text-[11px] uppercase tracking-wide text-on-ground-muted">Chorus mics</p>
          <ul className="grid gap-1 text-xs">
            {chorus.map((c) => (
              <li key={c.position} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-on-ground-muted">{c.position}</span>
                <span className="min-w-0 truncate text-on-ground-muted">{c.bhajanTitle}</span>
                {c.mics.map((m) => (
                  <span key={m.singerId} className="flex items-center gap-1">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full border border-rule"
                      style={{ background: micColourDot(m.cushion) ?? "transparent" }}
                    />
                    <span>{m.name}</span>
                    <span className="sr-only">{micColourLabel(m.cushion)}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
