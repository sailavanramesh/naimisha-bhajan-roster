"use client";

/**
 * A play control for one shruti label.
 *
 * Sits beside a rendered pitch anywhere in the app — the roster, a bhajan
 * page, a song in a programme. It renders NOTHING when the label has no
 * parseable note, so it can be dropped next to any pitch field, including the
 * many that are blank, without each call site guarding first.
 *
 * All the state lives in `lib/tanpuraEngine`, not here: several of these are on
 * screen at once and only one drone may sound, so "am I playing?" is a fact
 * about the page rather than about this button.
 */

import { useEffect, useSyncExternalStore } from "react";
import { tanpuraVoice } from "@/lib/tanpura";
import { getState, play, stop, subscribe, type PlayingState } from "@/lib/tanpuraEngine";
import { cn } from "@/components/ui";

const SERVER_STATE: PlayingState = { label: null, loading: false, error: null };

function usePlaying(): PlayingState {
  // getState is a live read of module state, so it is already the "current"
  // snapshot React wants; subscribe re-renders every mounted control when the
  // sounding label changes.
  return useSyncExternalStore(subscribe, getState, () => SERVER_STATE);
}

export function ShrutiPlayer({
  label,
  size = "sm",
  className,
}: {
  label?: string | null;
  /** `sm` for inline use in a dense table; `md` beside a heading. */
  size?: "sm" | "md";
  className?: string;
}) {
  const voice = tanpuraVoice(label);
  const playing = usePlaying();

  // A drone left sounding after the control leaves the screen has no way to be
  // stopped — the button that owns it is gone. So unmounting while playing
  // stops it. Navigating away from a roster therefore falls silent, which is
  // what someone closing the page expects.
  const isThis = voice !== null && playing.label === label;
  useEffect(() => {
    return () => {
      if (isThis) stop();
    };
  }, [isThis]);

  if (!voice || !label) return null;

  const loading = playing.loading && !playing.label;
  const box = size === "sm" ? "h-6 w-6" : "h-8 w-8";

  // A recording that is not there yet is the expected failure until the audio
  // is added (public/audio/tanpura/README.md). Say so on the button rather
  // than letting the click do nothing visible — a control that silently does
  // nothing reads as a bug in the roster, not as a missing file.
  const failed = playing.error !== null && playing.label === null;

  return (
    <button
      type="button"
      onClick={() => void play(label)}
      aria-pressed={isThis}
      aria-label={
        isThis
          ? `Stop the tanpura on ${label}`
          : `Play the tanpura on ${label} — Sa is ${voice.note}, ${voice.series} tuning`
      }
      title={
        failed
          ? `${playing.error} — the tanpura recordings have not been added yet.`
          : `${voice.series} tanpura, Sa = ${voice.note}`
      }
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border align-middle transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        box,
        isThis
          ? "border-transparent"
          : "border-[rgb(var(--rule-on-surface))] hover:bg-[rgb(var(--panel-hover))]",
        failed && "opacity-60",
        className,
      )}
      style={
        isThis
          ? { background: "rgb(var(--brass))", color: "rgb(var(--brass-ink))" }
          : { color: "rgb(var(--on-surface-muted))" }
      }
    >
      <Icon playing={isThis} loading={loading} failed={failed} />
    </button>
  );
}

/**
 * Speaker when idle, waves when sounding.
 *
 * Deliberately not a triangular "play" arrow: this starts a continuous drone
 * rather than a track with a beginning and an end, and the same button stops
 * it. Inline SVG rather than an icon dependency, as everywhere else here.
 */
function Icon({
  playing,
  loading,
  failed,
}: {
  playing: boolean;
  loading: boolean;
  failed: boolean;
}) {
  if (loading) {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin" aria-hidden="true">
        <circle
          cx="8" cy="8" r="6" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeDasharray="28" strokeDashoffset="20"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d="M3.5 6.2h2L8.3 4v8L5.5 9.8h-2z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {playing ? (
        <>
          <path d="M10.6 5.8a3.2 3.2 0 0 1 0 4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M12.5 4.2a5.6 5.6 0 0 1 0 7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      ) : failed ? (
        <path d="M10.4 6.2l3.4 3.6M13.8 6.2l-3.4 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M10.6 6.4a2.4 2.4 0 0 1 0 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      )}
    </svg>
  );
}
