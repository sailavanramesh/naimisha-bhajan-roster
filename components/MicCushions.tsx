"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIC_COLOURS,
  mergeCushions,
  applyOwnWrite,
  micColourLabel,
  type CushionEntry,
  type MicColourValue,
} from "@/lib/micCushion";
import { setMicCushion } from "@/app/roster/[id]/micCushionActions";

/** Fast enough for setting up a desk, light enough for a B1 instance. */
const POLL_MS = 4000;
/** After a failed poll, back off rather than hammering a struggling server. */
const BACKOFF_MS = 15000;

export type CushionMap = ReadonlyMap<string, CushionEntry>;

export type CushionController = {
  get: (singerId: string) => CushionEntry | undefined;
  set: (singerId: string, colour: MicColourValue | null) => void;
  isPending: (singerId: string) => boolean;
  failed: string | null;
};

/**
 * Holds the cushion state for a session and keeps it current across devices.
 *
 * The polling loop is a self-rescheduling timeout rather than setInterval:
 * setInterval would stack requests if one hangs on a slow phone connection.
 * It pauses while the tab is hidden — phones in a hall spend most of a session
 * with the screen off — and polls immediately on becoming visible again, so
 * coming back to the app shows current state rather than waiting a cycle.
 */
export function useMicCushions(sessionId: string): CushionController {
  const [map, setMap] = useState<CushionMap>(() => new Map());
  const [failed, setFailed] = useState<string | null>(null);
  /*
   * A ref, not state: the polling loop must read the CURRENT pending set at
   * the moment a response lands. Held in state it would be captured stale by
   * the closure and a poll could overwrite a colour someone just tapped.
   */
  const pending = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (stopped) return;
      let delay = POLL_MS;

      if (typeof document === "undefined" || document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/cushions`, { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as { cushions: Array<CushionEntry & { singerId: string }> };
            if (!stopped) {
              setMap((cur) => mergeCushions(cur, data.cushions, pending.current));
              setFailed(null);
            }
          } else {
            delay = BACKOFF_MS;
          }
        } catch {
          delay = BACKOFF_MS;
        }
      }

      if (!stopped) timer = setTimeout(tick, delay);
    }

    void tick();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId]);

  const set = useCallback(
    (singerId: string, colour: MicColourValue | null) => {
      const previous = map.get(singerId);
      pending.current.add(singerId);
      // Optimistic: the tap has to feel instant on a phone. `pending` keeps a
      // concurrent poll from undoing it before the server answers.
      setMap((cur) => applyOwnWrite(cur, singerId, { colour, updatedAt: Date.now() }));

      void (async () => {
        try {
          const saved = await setMicCushion({ sessionId, singerId, colour });
          setMap((cur) =>
            applyOwnWrite(cur, singerId, {
              colour: saved.colour,
              updatedAt: saved.updatedAt,
              setByName: saved.setByName,
            }),
          );
          setFailed(null);
        } catch {
          // Put it back rather than leaving a colour on screen that is not
          // saved — the sound desk would act on it.
          setMap((cur) => {
            const next = new Map(cur);
            if (previous) next.set(singerId, previous);
            else next.delete(singerId);
            return next;
          });
          setFailed(singerId);
        } finally {
          pending.current.delete(singerId);
        }
      })();
    },
    [map, sessionId],
  );

  return {
    get: (singerId: string) => map.get(singerId),
    set,
    isPending: (singerId: string) => pending.current.has(singerId),
    failed,
  };
}

/**
 * The four cushion dots.
 *
 * Colour alone would be an unusable control for a colour-blind user, and the
 * thing being identified IS a colour — so every dot carries its name as an
 * accessible label and a tooltip, and the selected one takes a ring plus a
 * checkmark rather than relying on the fill.
 */
export function MicCushionDots({
  singerId,
  controller,
  canSet,
}: {
  singerId: string;
  controller: CushionController;
  canSet: boolean;
}) {
  const entry = controller.get(singerId);
  const selected = entry?.colour ?? null;
  const errored = controller.failed === singerId;

  const setBy = entry?.setByName ? ` · set by ${entry.setByName}` : "";

  if (!canSet) {
    if (!selected) return null;
    const c = MIC_COLOURS.find((x) => x.value === selected)!;
    return (
      <span
        className="mt-1 inline-flex items-center gap-1 text-[11px] text-on-surface-muted"
        title={`${c.label} cushion${setBy}`}
      >
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-full ring-1 ring-black/20"
          style={{ background: c.dot }}
        />
        {c.label}
      </span>
    );
  }

  return (
    <div
      role="group"
      aria-label="Mic cushion colour"
      /*
       * Bigger targets on a phone, compact on desktop. This gets tapped
       * one-handed, standing up, in a hall — an 18px target is a miss waiting
       * to happen. The stacked mobile layout has the width to spare.
       */
      className="mt-1 flex items-center gap-2 sm:gap-1"
      title={selected ? `${micColourLabel(selected)} cushion${setBy}` : "Mic cushion"}
    >
      {MIC_COLOURS.map((c) => {
        const on = selected === c.value;
        return (
          <button
            key={c.value}
            type="button"
            aria-label={`${c.label} mic cushion`}
            aria-pressed={on}
            onClick={() => controller.set(singerId, on ? null : c.value)}
            className={[
              "relative inline-flex h-7 w-7 items-center justify-center rounded-full sm:h-[18px] sm:w-[18px]",
              "touch-manipulation",
              "ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brass",
              on ? "ring-2 ring-brass-ink" : "ring-black/20 opacity-55 hover:opacity-100",
            ].join(" ")}
            style={{ background: c.dot }}
          >
            {on ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-white drop-shadow sm:h-3 sm:w-3" aria-hidden>
                <path
                  d="M20 6L9 17l-5-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </button>
        );
      })}
      {/* Tapping the active dot already clears it, but that is not something
          anyone discovers. An explicit control makes "no cushion" reachable,
          and it only occupies space once there is something to clear. */}
      {selected ? (
        <button
          type="button"
          aria-label="No mic cushion"
          title="Clear the mic cushion"
          onClick={() => controller.set(singerId, null)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[15px] leading-none text-on-surface-muted transition hover:bg-rule-surface hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brass sm:h-[18px] sm:w-[18px] sm:text-[13px]"
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
      {errored ? (
        <span className="text-[11px] font-semibold text-warn" role="status">
          not saved
        </span>
      ) : null}
    </div>
  );
}

/**
 * The row tint for a cushion colour, or null when there is none.
 *
 * `color-mix` produces an OPAQUE colour rather than a translucent wash. That
 * matters because the singer column is sticky: a translucent background would
 * let the rest of the row scroll visibly underneath it. Browsers without
 * color-mix simply ignore the declaration and fall back to the plain surface,
 * which is a safe way to degrade — the dots still carry the information.
 *
 * The mix is deliberately weak. This sits behind body text that has to stay
 * readable, and the tint is a glanceable hint, not the signal itself.
 */
export function cushionTint(colour: MicColourValue | null): { row: string; edge: string } | null {
  if (!colour) return null;
  const dot = MIC_COLOURS.find((c) => c.value === colour)?.dot;
  if (!dot) return null;
  return {
    row: `color-mix(in srgb, ${dot} 13%, rgb(var(--surface)))`,
    edge: dot,
  };
}
