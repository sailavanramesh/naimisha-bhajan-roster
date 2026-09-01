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
import { mmss } from "@/components/TrackControl";

export type PracticeTrack = { file: string; name: string | null };

/**
 * A gap this big is a startup race, and only a seek will close it.
 *
 * Measured on dev: the two elements can begin over a second apart, because
 * whichever starts decoding first runs ahead while the other opens its file.
 * Nothing but a seek fixes that, and it is worth one.
 */
const SEEK_IF_APART = 0.3;

/** No more than one seek this often. A seek costs a Range request; see below. */
const SEEK_COOLDOWN_MS = 8000;

/**
 * Under that, the gap is closed by SPEED rather than by seeking.
 *
 * Sailavan, with a genuine stem pair: "there is a slight behindness to the
 * karaoke track, maybe, but it affects the beat."
 *
 * He is right and it was mine: the old tolerance let the pair sit up to 350ms
 * apart before anything acted, so at any given toggle the offset was somewhere
 * in that range. On a beat, 350ms is not slight.
 *
 * Tightening the tolerance would have meant seeking far more often, which is
 * precisely what made playback stutter — every seek on a 10 MB file abandons a
 * Range request and asks for another. So small gaps are closed the way sync is
 * done properly: nudge the SILENT element's playback RATE by a few per cent
 * until it catches up, then put it back to 1. No seek, no request, and nothing
 * audible, because it is only ever done to the track nobody is hearing.
 *
 * 4% closes a 100ms gap in about two and a half seconds.
 */
const NUDGE_IF_APART = 0.012;
const NUDGE_SETTLED = 0.004;
const MAX_NUDGE = 0.04;

/**
 * Durations further apart than this are worth mentioning — carefully.
 *
 * Total length is a CRUDE proxy for "same recording". Sailavan's real stem pair
 * measures 536.1s against 523.26s — 12.8s apart — and yet the music lines up:
 * the difference is at the END, a longer fade or trailing silence on one render.
 * The first wording flatly said they were "probably not the same recording",
 * which was wrong about his files and would have sent him looking for a problem
 * that was mine.
 *
 * So it now says what it actually knows — they differ in length — and what that
 * does and does not imply. Nothing here can see whether the MUSIC aligns; only
 * a person listening can.
 */
const LENGTH_MISMATCH = 0.75;

/** How far the skip buttons move. See the note beside them. */
const SKIP_SECONDS = 10;

export function PracticePlayer({
  original,
  karaoke,
  className,
  compact = false,
}: {
  original: PracticeTrack;
  karaoke: PracticeTrack;
  className?: string;
  /**
   * The one-line form, for the running order.
   *
   * Sailavan, 2026-09-01: "make it more obvious in the preview that the song can
   * be played there with vocals on or something, shouldn't have to open the
   * whole song out to play that option thing." The preview row already had a
   * play button; what it lacked was any sign that the recording had a second
   * half at all, so the only way to find the switch was to open the item.
   *
   * Same component, and deliberately so: every hard part here is the two
   * elements staying in lockstep, and a second implementation of that for a
   * smaller set of buttons would be a second set of the same bugs. Only the
   * controls change — native `controls` on the lead becomes a play button, a
   * scrubber and the switch.
   */
  compact?: boolean;
}) {
  const lead = useRef<HTMLAudioElement | null>(null);
  const shadow = useRef<HTMLAudioElement | null>(null);
  const [vocals, setVocals] = useState(true);
  const [mismatch, setMismatch] = useState<number | null>(null);

  /*
   * The lead's transport, mirrored into React so the compact form can draw its
   * own buttons. Tracked whether or not `compact` is set — it is three cheap
   * listeners, and making it conditional would put a hook behind an `if`.
   */
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);

  /** Set while we move a playhead ourselves, so `seeked` is not treated as a person's. */
  const ourSeek = useRef(false);
  /** When we last SEEKED, so seeks stay rare. */
  const lastSeek = useRef(0);
  /** True while a playback rate is being held off 1 to close a gap. */
  const nudging = useRef(false);

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
    // NOT while nudging: the rates are deliberately different then, and copying
    // one onto the other would undo the correction — or worse, apply it to the
    // element being listened to.
    if (!nudging.current && b.playbackRate !== a.playbackRate) {
      b.playbackRate = a.playbackRate;
    }
    if (a.paused) {
      if (!b.paused) b.pause();
      if (nudging.current) {
        a.playbackRate = 1;
        b.playbackRate = 1;
        nudging.current = false;
      }
    } else if (b.paused) {
      void b.play().catch(() => {
        /* A platform refusing the second stream is repaired on toggle. */
      });
    }
  }, []);

  /**
   * Keep the pair together: by speed for small gaps, by one seek for large ones.
   *
   * Whichever element is SILENT is the one adjusted — `muted` is the truth about
   * which that is. Nothing here ever touches the track being listened to, which
   * is the rule the first two versions of this broke in opposite ways.
   */
  const keepTogether = useCallback((now: number) => {
    const a = lead.current;
    const b = shadow.current;
    if (!a || !b || a.paused) return;

    const silent = b.muted ? b : a;
    const audible = silent === b ? a : b;
    const gap = audible.currentTime - silent.currentTime;
    const apart = Math.abs(gap);

    if (apart > SEEK_IF_APART) {
      if (now - lastSeek.current < SEEK_COOLDOWN_MS) return;
      lastSeek.current = now;
      if (nudging.current) {
        a.playbackRate = 1;
        b.playbackRate = 1;
        nudging.current = false;
      }
      // Moving the lead means telling its own `seeked` handler this one was ours.
      if (silent === a) ourSeek.current = true;
      silent.currentTime = audible.currentTime;
      return;
    }

    if (apart > NUDGE_IF_APART) {
      // Behind: speed it up. Ahead: slow it down. Proportional, so a small gap
      // gets a small nudge and closes without overshooting.
      const adjust = Math.min(MAX_NUDGE, apart) * Math.sign(gap);
      silent.playbackRate = 1 + adjust;
      nudging.current = true;
      return;
    }

    if (nudging.current && apart < NUDGE_SETTLED) {
      a.playbackRate = 1;
      b.playbackRate = 1;
      nudging.current = false;
    }
  }, []);

  useEffect(() => {
    const a = lead.current;
    if (!a) return;

    const onTransport = () => mirror();
    /** Cheap: two numbers compared, four times a second. */
    const onTime = () => keepTogether(Date.now());
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
  }, [mirror, keepTogether]);

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

  /* The lead's own transport, for the compact controls to draw and drive. */
  useEffect(() => {
    const el = lead.current;
    if (!el) return;
    const onTime = () => setAt(el.currentTime);
    const onMeta = () => setLength(Number.isFinite(el.duration) ? el.duration : 0);

    /*
     * READ IT NOW, not only when the event next fires.
     *
     * `preload="metadata"` starts loading as the element renders, so with a warm
     * cache `loadedmetadata` has already fired by the time this effect attaches
     * and the listener never hears it. `length` then stays 0, the scrubber is
     * `disabled`, and dragging it does nothing at all — which is exactly what
     * Sailavan hit: "scrubbing forward or backward doesn't move the song forward
     * or back, it just continues to play from where it was."
     *
     * A missed event is not the same as no data. The element knows its duration;
     * ask it.
     */
    onMeta();
    onTime();
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    /*
     * At the end, put the RECORDING back to the start, not just the number under
     * the scrubber.
     *
     * Showing 0:00 while the element still sits at its duration is a display
     * that disagrees with the thing it describes: the scrubber is already at 0,
     * so dragging it to 0 fires no change and appears to do nothing. Seeking for
     * real also brings the karaoke half back with it, through the same mirror.
     */
    const onEnd = () => {
      setPlaying(false);
      seekTo(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    // Some browsers settle on a real duration only after `durationchange`.
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  /**
   * Move the pair to a point in the recording.
   *
   * The LEAD is moved and nothing else. Its `seeked` handler is the one place a
   * person's seek is mirrored onto the shadow, and `ourSeek` is deliberately NOT
   * set here: this IS a person's seek. Setting it — which the first version of
   * the compact scrubber did — suppressed the mirror and left the two halves in
   * different places, so the vocals switch landed somewhere else in the music.
   */
  const seekTo = (seconds: number) => {
    const el = lead.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : seconds;
    const t = Math.min(Math.max(seconds, 0), max);
    el.currentTime = t;
    setAt(t);
  };

  /** Back or forward by a few seconds — the thing you do to hear a line again. */
  const nudgeBy = (seconds: number) => seekTo((lead.current?.currentTime ?? 0) + seconds);

  /* Play or pause the LEAD only. The shadow follows it through `mirror`, which
     is the same path the native controls take — nothing here is a second way
     of starting the pair. */
  const playPause = () => {
    const el = lead.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const toggle = () => {
    const a = lead.current;
    const b = shadow.current;
    const next = !vocals;
    setVocals(next);
    if (!a || !b) return;

    /*
     * Both back to normal speed before the swap. One of them may be running a
     * few per cent off to close a gap, and the one about to be heard must not
     * be — that would be an audible tempo change at the very moment of the
     * switch.
     */
    if (nudging.current) {
      a.playbackRate = 1;
      b.playbackRate = 1;
      nudging.current = false;
    }

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

  /* The shadow, shared by both forms. Declared once so the two branches below
     cannot drift into two different elements. */
  const shadowEl = (
    /*
      `metadata`, NOT `auto`: it used to race to download the whole file the
      moment the page opened, which on a 10 MB pair competed with the audible
      stream. It has been playing silently in lockstep, so it is already buffered
      where a toggle needs it.
    */
    <audio
      ref={shadow}
      preload="metadata"
      muted
      className="hidden"
      src={`/api/tracks/${karaoke.file}`}
    />
  );

  if (compact) {
    return (
      /* Full width on its own line, compact beside the title from `sm` up — the
         same shape InlineTrack takes in the running order, because it stands in
         the same place. */
      /*
        `flex-wrap` and `min-w-0`, or the row sets the width of the page.
        Five controls plus a time on one unbreakable line came to about 215px of
        min-content, which pushed the running order 60px past a 375px phone. The
        switch drops to a second line there instead; from `sm` up it all fits on
        one.
      */
      <span
        className={cn(
          "flex w-full min-w-0 flex-wrap items-center gap-1.5 align-middle sm:inline-flex sm:w-auto sm:shrink-0",
          className,
        )}
      >
        <audio ref={lead} preload="metadata" className="hidden" src={`/api/tracks/${original.file}`} />
        {shadowEl}

        {/*
          BACK AND FORWARD TEN SECONDS.

          Asked for directly: "should add a forward 5-10 s and backwards feature
          there". Ten rather than five because the thing being done is hearing a
          LINE again, not a word, and a line of a bhajan is rarely under ten
          seconds. They move the lead, so the karaoke half follows through the
          same `seeked` mirror the scrubber uses — you can drop the voice, miss
          it, and go back without the two halves parting company.
        */}
        <button
          type="button"
          onClick={() => nudgeBy(-SKIP_SECONDS)}
          aria-label={`Back ${SKIP_SECONDS} seconds`}
          title={`Back ${SKIP_SECONDS} seconds`}
          className="inline-flex h-6 shrink-0 items-center rounded-full border border-rule-surface px-1.5 font-mono text-[10px] tabular-nums text-on-surface-muted transition hover:bg-panel-hover"
        >
          −{SKIP_SECONDS}
        </button>

        <button
          type="button"
          onClick={playPause}
          aria-label={playing ? `Pause ${original.name ?? "the track"}` : `Play ${original.name ?? "the track"}`}
          title={original.name ?? "track"}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule-surface text-on-surface-muted transition hover:bg-panel-hover"
        >
          {playing ? (
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true" fill="currentColor">
              <rect x="4" y="3.5" width="2.6" height="9" rx="0.6" />
              <rect x="9.4" y="3.5" width="2.6" height="9" rx="0.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true" fill="currentColor">
              <path d="M5 3.6l7 4.4-7 4.4z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => nudgeBy(SKIP_SECONDS)}
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
          title={`Forward ${SKIP_SECONDS} seconds`}
          className="inline-flex h-6 shrink-0 items-center rounded-full border border-rule-surface px-1.5 font-mono text-[10px] tabular-nums text-on-surface-muted transition hover:bg-panel-hover"
        >
          +{SKIP_SECONDS}
        </button>

        <input
          type="range"
          min={0}
          max={length || 0}
          step={0.1}
          value={Math.min(at, length || 0)}
          disabled={!length}
          aria-label="Position in the track"
          onChange={(e) => {
            const el = lead.current;
            if (!el) return;
            seekTo(Number(e.target.value));
          }}
          className="h-1 min-w-[7rem] flex-1 cursor-pointer accent-brass disabled:cursor-not-allowed sm:w-20 sm:min-w-0 sm:flex-none"
        />

        <span className="font-mono text-[10px] tabular-nums text-on-surface-muted">
          {mmss(at)}
          {length ? `/${mmss(length)}` : ""}
        </span>

        {/*
          THE WHOLE POINT OF THE COMPACT FORM: the switch, in the running order.

          Labelled in words rather than left as a bare emoji — an unexplained mic
          beside a play button is not something anybody taps to find out. It is
          also `aria-pressed`, so it reads as a switch rather than a second play
          button.
        */}
        <button
          type="button"
          onClick={toggle}
          aria-pressed={vocals}
          title={
            vocals
              ? "Hearing the sung recording. Tap to drop the voice."
              : "Hearing the karaoke. Tap to bring the voice back."
          }
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] transition-colors",
            vocals
              ? "border-brass/50 bg-brass/20 font-semibold text-on-surface"
              : "border-rule-surface text-on-surface-muted hover:bg-panel-hover",
          )}
        >
          <span aria-hidden>{vocals ? "🎤" : "🎹"}</span>
          {vocals ? "Vocals" : "Karaoke"}
        </button>
      </span>
    );
  }

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

      {shadowEl}

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
        <p className="text-[11px] text-on-surface-muted">
          These two differ in length by{" "}
          {mismatch < 60 ? `${mismatch.toFixed(0)} seconds` : "well over a minute"}. That is fine if
          one just has a longer ending — the switch keeps the same position, so what matters is
          that they START together and hold the same tempo. If the switch lands somewhere else in
          the music, they are two different takes rather than one mix with and without the voice.
        </p>
      ) : null}
    </div>
  );
}
