"use client";

/**
 * Two recordings of one bhajan, and a switch between them.
 *
 * Sailavan, 2026-08-21: "if we upload the original track, you could create a
 * toggle button that 'adds' the vocals back in (its just switching between the
 * vocal track and the karaoke track) but it would useful when practising etc.
 * Has to be smooth and responsive as well."
 *
 * ## How it is smooth
 *
 * Both files play AT THE SAME TIME, from the same instant, and the toggle only
 * changes which one you can hear. So switching costs nothing: no seek, no
 * buffering, no gap. You can flip it in the middle of a word.
 *
 * That only works because the pair is the same recording with and without the
 * voice — confirmed before any of this was built — so one timeline serves both.
 * If two files ever disagree about their length this says so rather than
 * pretending, because then the same second is a different bar and the toggle
 * would drop you in the wrong place.
 *
 * ## Why the visible controls belong to one element
 *
 * The original carries the native `<audio controls>` — the browser's own
 * scrubber and OS media keys beat anything hand-built, especially on a phone.
 * The karaoke element is hidden and shadows it: play, pause, seek and rate are
 * mirrored across. Since the two share a timeline, the visible position is
 * correct whichever one you are hearing.
 *
 * ## The one platform risk, handled
 *
 * Some phones have historically refused to let two audio elements play at once,
 * pausing one when the other starts. If that happens the silent element falls
 * behind or stops, and a muted-swap alone would toggle to silence. So the toggle
 * checks: if the element about to be heard is paused or has drifted, it is
 * seeked to the audible one's position and started. That costs a few
 * milliseconds in the bad case and nothing in the good one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

export type PracticeTrack = { file: string; name: string | null };

/**
 * Two thresholds, because the two jobs want opposite things.
 *
 * ALIGN is how far the SILENT element may drift before it is nudged back. Tight,
 * because whatever gap is left at the moment of a toggle is heard as the music
 * jumping. Measured on dev, two 8-second files: left to themselves the pair sat
 * about 90ms apart, which is enough to stumble a rhythm. Correcting the silent
 * one costs nothing — nobody can hear a seek in a track they are not listening
 * to.
 *
 * REPAIR is how far out the element ABOUT TO BE HEARD has to be before the
 * toggle seeks it. Deliberately loose: a seek on an element that is about to
 * play can stall it for a moment, so it is a last resort for the case where a
 * phone stopped the second stream entirely, not routine tidying. ALIGN keeps
 * things far inside this.
 */
const ALIGN_LIMIT = 0.04;
const REPAIR_LIMIT = 0.25;

/** Durations further apart than this are not the same recording. */
const LENGTH_MISMATCH = 0.75;

export function PracticePlayer({
  original,
  karaoke,
  className,
}: {
  original: PracticeTrack;
  karaoke: PracticeTrack;
  className?: string;
}) {
  const lead = useRef<HTMLAudioElement | null>(null);
  const shadow = useRef<HTMLAudioElement | null>(null);
  const [vocals, setVocals] = useState(true);
  const [mismatch, setMismatch] = useState<number | null>(null);

  /**
   * Which one is audible, readable from an event listener without re-binding.
   *
   * The listeners are attached once; a `useState` value read inside them would
   * be whatever it was when they were bound.
   */
  const vocalsRef = useRef(true);
  /** Set while we are moving a playhead ourselves, so `seeked` does not recurse. */
  const syncing = useRef(false);

  /**
   * Keep the pair together.
   *
   * TRANSPORT always follows the lead, because the lead owns the visible
   * controls: it is the one a person presses play on, whichever they are
   * hearing.
   *
   * THE PLAYHEAD is corrected on whichever element is SILENT — never on the one
   * being listened to. Seeking audio somebody is hearing is exactly the stutter
   * this feature is supposed to avoid, and it was the flaw in the first draft:
   * it always corrected the shadow, which is the audible one whenever the
   * karaoke is selected.
   */
  const align = useCallback((force: boolean) => {
    const a = lead.current;
    const b = shadow.current;
    if (!a || !b || syncing.current) return;

    b.playbackRate = a.playbackRate;
    if (a.paused) {
      if (!b.paused) b.pause();
    } else if (b.paused) {
      void b.play().catch(() => {
        /* A phone refusing the second stream is handled on toggle. */
      });
    }

    const apart = Math.abs(a.currentTime - b.currentTime);
    if (!force && apart <= ALIGN_LIMIT) return;

    // A forced align follows a seek on the lead, so the lead is right by
    // definition. Otherwise move the one nobody can hear.
    const silent = force ? b : vocalsRef.current ? b : a;
    const source = silent === b ? a : b;
    syncing.current = true;
    silent.currentTime = source.currentTime;
    // Cleared on a task of its own: the `seeked` this causes arrives later.
    setTimeout(() => {
      syncing.current = false;
    }, 0);
  }, []);

  // Mirror the lead's controls onto the shadow.
  useEffect(() => {
    const a = lead.current;
    if (!a) return;
    const onPlay = () => align(false);
    const onPause = () => align(false);
    const onSeek = () => align(true);
    const onRate = () => align(false);
    // Drift is corrected here, on whichever element is silent — see align.
    const onTime = () => align(false);

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("seeked", onSeek);
    a.addEventListener("ratechange", onRate);
    a.addEventListener("timeupdate", onTime);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("seeked", onSeek);
      a.removeEventListener("ratechange", onRate);
      a.removeEventListener("timeupdate", onTime);
    };
  }, [align]);

  // Say so when the two are not the same length, because then they are not the
  // same recording and the toggle cannot mean what it says.
  useEffect(() => {
    const a = lead.current;
    const b = shadow.current;
    if (!a || !b) return;
    const check = () => {
      if (!Number.isFinite(a.duration) || !Number.isFinite(b.duration)) return;
      const gap = Math.abs(a.duration - b.duration);
      setMismatch(gap > LENGTH_MISMATCH ? gap : null);
    };
    a.addEventListener("loadedmetadata", check);
    b.addEventListener("loadedmetadata", check);
    check();
    return () => {
      a.removeEventListener("loadedmetadata", check);
      b.removeEventListener("loadedmetadata", check);
    };
  }, []);

  const toggle = () => {
    const a = lead.current;
    const b = shadow.current;
    const next = !vocals;
    setVocals(next);
    vocalsRef.current = next;
    if (!a || !b) return;

    // The one about to be heard. If the platform stopped it, or it has drifted,
    // put it right BEFORE it becomes audible rather than after.
    const audible = next ? a : b;
    const other = next ? b : a;
    if (!a.paused && (audible.paused || Math.abs(audible.currentTime - other.currentTime) > REPAIR_LIMIT)) {
      audible.currentTime = other.currentTime;
      void audible.play().catch(() => {});
    }
    a.muted = !next;
    b.muted = next;
  };

  return (
    <div className={cn("grid gap-1.5", className)}>
      {/* The lead. Always playing; muted when you asked for the karaoke. */}
      <audio
        ref={lead}
        controls
        preload="metadata"
        className="h-9 w-full"
        src={`/api/tracks/${original.file}`}
      >
        Your browser cannot play audio.
      </audio>

      {/*
        The shadow. `preload="auto"` on purpose where the lead is only
        "metadata": this one has to be ready to be heard the instant somebody
        asks, and it is the whole point of the feature.
      */}
      <audio
        ref={shadow}
        preload="auto"
        muted
        className="hidden"
        src={`/api/tracks/${karaoke.file}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={vocals}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs transition-colors",
            vocals
              ? "border-brass/50 bg-brass/20 font-semibold text-on-surface"
              : "border-rule-surface text-on-surface-muted hover:bg-panel-hover",
          )}
        >
          <span aria-hidden>{vocals ? "🎤" : "🎹"}</span>
          {vocals ? "Vocals on" : "Karaoke"}
        </button>
        <span className="text-[11px] text-on-surface-muted">
          {vocals
            ? "Hearing the sung recording. Tap to drop the voice and sing it yourself."
            : "Hearing the karaoke. Tap to bring the voice back."}
        </span>
      </div>

      {mismatch !== null ? (
        <p className="text-[11px] text-warn">
          These two are {mismatch < 60 ? `${mismatch.toFixed(1)} seconds` : "well over a minute"} apart
          in length, so they are probably not the same recording. Switching will keep the same
          position, which will not be the same place in the music.
        </p>
      ) : null}
    </div>
  );
}
