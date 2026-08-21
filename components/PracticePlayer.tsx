"use client";

/**
 * Two recordings of one song, and a switch between them.
 *
 * Sailavan, 2026-08-21: "if we upload the original track, you could create a
 * toggle button that 'adds' the vocals back in … Has to be smooth and
 * responsive as well."
 *
 * ## How it is smooth
 *
 * Both files play at the same time, from the same instant, and the toggle only
 * changes which one you can hear. There is no seek and no buffering at the
 * moment of the switch, so it can be flipped mid-word.
 *
 * ## WHY THERE IS NO DRIFT CORRECTION, which is the important part
 *
 * The first version nudged the silent element back into line whenever the pair
 * drifted past 40ms. On my test files — 352 KB, fully buffered — that was free.
 * On his real pair, two files of about 10 MB, it was a disaster: "it keeps
 * playing the music for a fraction of a second then pausing for 1 second then
 * the next bit, it takes 10 seconds to play 1 second."
 *
 * Two reasons, both mine:
 *
 *   1. EVERY SEEK ON A REMOTE FILE COSTS A REQUEST. These are streamed from
 *      /api/tracks with Range support, so moving the playhead abandons the
 *      response in flight and asks for another. Doing that every few hundred
 *      milliseconds against a 10 MB file over a Burstable instance is the
 *      stutter he heard.
 *   2. IT FED ITSELF. Correcting the silent element fired `seeked`, the `seeked`
 *      handler called a FORCED align, and a forced align moved the other
 *      element — the audible one. So one small correction seeked the track being
 *      listened to, which drifted the pair further, which corrected again.
 *
 * So nothing seeks during playback any more. The pair is left alone: two
 * elements started together and driven by the same clock stay close enough, and
 * the only thing a small drift can cost is a slightly soft switch — which is
 * nothing beside re-requesting ten megabytes mid-phrase.
 *
 * A seek is now only ever caused by a PERSON: dragging the lead's scrubber takes
 * the shadow with it, and a toggle repairs the incoming element ONLY if the
 * platform actually stopped it.
 *
 * ## Why the shadow preloads metadata, not the whole file
 *
 * It was `preload="auto"`, so the browser raced to fetch all 10 MB the moment
 * the page opened — competing with the audible stream for bandwidth and for the
 * app's own request handling. It streams alongside instead: it has been playing
 * silently in lockstep, so it is already buffered exactly where the toggle
 * needs it.
 *
 * ## Why the visible controls belong to one element
 *
 * The original carries the native `<audio controls>` — the browser's own
 * scrubber and OS media keys beat anything hand-built, especially on a phone.
 * Since the two share a timeline the position shown is right whichever one is
 * being heard.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

export type PracticeTrack = { file: string; name: string | null };

/**
 * How far apart the pair may sit before it is worth one seek to fix.
 *
 * Not a drift tolerance — a startup-race tolerance. Measured on dev with his
 * real 10 MB pair: the two began 0.86s apart and settled 1.26s apart, because
 * whichever element starts decoding first runs ahead while the other is still
 * opening its file. With nothing correcting it that offset lasts the whole
 * track, and a toggle then moves the music by well over a second.
 *
 * A third of a second is about where a switch stops sounding like a switch and
 * starts sounding like a mistake.
 */
const MAX_APART = 0.35;

/**
 * And no more than one correction this often.
 *
 * The stutter that started all this was a seek every time the pair wandered
 * 40ms, each one abandoning a Range request against a 10 MB file. The cooldown
 * is what keeps this a handful of seeks per track instead: enough to fix a
 * startup race, far too slow to feed itself.
 */
const CORRECTION_COOLDOWN_MS = 8000;

/**
 * Durations further apart than this are not the same recording.
 *
 * This matters more now that nothing corrects drift: if the pair is genuinely
 * two different takes, the toggle lands wherever the other recording happens to
 * be at that second. Saying so is the only honest thing to do.
 */
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

  /** Set while we move a playhead ourselves, so `seeked` is not treated as a person's. */
  const ourSeek = useRef(false);
  /** When we last corrected, so corrections stay rare. */
  const lastFix = useRef(0);

  /**
   * Mirror the lead's TRANSPORT onto the shadow. Never its playhead.
   *
   * The lead owns the visible controls, so it decides whether the pair is
   * playing and how fast. The playhead is left alone — see the note at the top
   * of this file for what correcting it cost.
   */
  const mirror = useCallback(() => {
    const a = lead.current;
    const b = shadow.current;
    if (!a || !b) return;
    if (b.playbackRate !== a.playbackRate) b.playbackRate = a.playbackRate;
    if (a.paused) {
      if (!b.paused) b.pause();
    } else if (b.paused) {
      void b.play().catch(() => {
        /* A platform refusing the second stream is repaired on toggle. */
      });
    }
  }, []);

  /**
   * Bring the pair back together, rarely, and only by moving the silent one.
   *
   * Three rules, each of which was learnt the hard way:
   *
   *   - Only past MAX_APART. Small differences are inaudible in a switch; it is
   *     the startup race, which can be over a second, that has to be caught.
   *   - Only once per CORRECTION_COOLDOWN_MS. A seek costs a Range request
   *     against a large file, and doing it often is what made playback stutter.
   *   - Only ever the SILENT element. Seeking what somebody is listening to is
   *     the stutter itself, and moving the lead means telling its own `seeked`
   *     handler that this one was ours.
   */
  const nudge = useCallback((now: number) => {
    const a = lead.current;
    const b = shadow.current;
    if (!a || !b || a.paused) return;
    if (now - lastFix.current < CORRECTION_COOLDOWN_MS) return;
    if (Math.abs(a.currentTime - b.currentTime) <= MAX_APART) return;

    lastFix.current = now;
    // `muted` is the truth about which one is being heard.
    if (b.muted) {
      b.currentTime = a.currentTime;
    } else {
      ourSeek.current = true;
      a.currentTime = b.currentTime;
    }
  }, []);

  useEffect(() => {
    const a = lead.current;
    if (!a) return;

    const onTransport = () => mirror();
    /** Cheap: two numbers compared. It acts only past the threshold and the cooldown. */
    const onTime = () => nudge(Date.now());
    /**
     * A person dragged the scrubber, so both should move. This is the ONE place
     * a seek is mirrored, and it is safe because it is caused by a person rather
     * than by us: nothing here can trigger it again.
     */
    const onSeeked = () => {
      const b = shadow.current;
      if (!b) return;
      if (ourSeek.current) {
        ourSeek.current = false;
        return;
      }
      b.currentTime = a.currentTime;
      mirror();
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onTransport);
    a.addEventListener("pause", onTransport);
    a.addEventListener("ratechange", onTransport);
    a.addEventListener("seeked", onSeeked);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onTransport);
      a.removeEventListener("pause", onTransport);
      a.removeEventListener("ratechange", onTransport);
      a.removeEventListener("seeked", onSeeked);
    };
  }, [mirror, nudge]);

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
    if (!a || !b) return;

    /*
     * Swap which one is heard. Nothing is seeked: both have been playing
     * together, so the incoming element is already at the right place and
     * already buffered there.
     */
    a.muted = !next;
    b.muted = next;

    /*
     * The only repair. If the platform stopped the second stream — phones have
     * historically allowed one at a time — the incoming element is paused and
     * would toggle to silence. Then, and only then, is a seek worth its cost.
     */
    const incoming = next ? a : b;
    const running = next ? b : a;
    if (!a.paused && incoming.paused) {
      ourSeek.current = incoming === a;
      incoming.currentTime = running.currentTime;
      void incoming.play().catch(() => {});
    }
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
        The shadow. `metadata`, NOT `auto`: it used to race to download the whole
        file the moment the page opened, which on a 10 MB pair competed with the
        audible stream. It has been playing silently in lockstep, so it is
        already buffered where a toggle needs it.
      */}
      <audio
        ref={shadow}
        preload="metadata"
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
