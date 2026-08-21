"use client";

/**
 * The audio for one item in a running order: upload it, play it, scrub it.
 *
 * A plain <audio controls> rather than a hand-built player. The browser's own
 * scrubber, keyboard handling and OS media keys are all better than anything
 * worth writing here, and they work the moment the server answers Range
 * requests — which is what app/api/program/track/[file] exists to do.
 *
 * `preload="metadata"` so the duration and a seekable scrubber are there before
 * anybody presses play, without pulling the whole file down on page load. A
 * programme page can carry a dozen of these.
 *
 * Uploads go through XMLHttpRequest, not fetch, purely for the progress event:
 * a 20 MB track over a hall's wifi is long enough that a bar is the difference
 * between waiting and refreshing.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

export type TrackInfo = {
  file: string | null;
  name: string | null;
  bytes: number | null;
  uploadedBy: string | null;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mmss(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The track on one line, for a running order that has not been opened.
 *
 * Sailavan: "can the uploaded recording show up here inline with the thing, so
 * don't have to open it to open the recording?"
 *
 * A hand-built control rather than <audio controls> here, which is the opposite
 * of the choice made below and for the opposite reason: the browser's own player
 * is about 32 pixels tall and 300 wide with its own padding, and a row of a
 * running order has neither. This is a button, a slim bar and a time — and the
 * bar is a real range input, so dragging it still seeks, which is the point.
 *
 * The full player is still there when the item is opened. This is the shortcut,
 * not a replacement.
 */
export function InlineTrack({ file, name }: { file: string; name: string | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => setAt(el.currentTime);
    const onMeta = () => setLength(Number.isFinite(el.duration) ? el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setAt(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", () => setPlaying(false));
    el.addEventListener("play", () => setPlaying(true));
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  return (
    /* Full width when it has been dropped onto its own line — which is what a
       phone in portrait does with it, see app/program/[id]/ProgramEditor.tsx —
       and back to its compact self beside the title from `sm` up. */
    <span className="flex w-full items-center gap-1.5 align-middle sm:inline-flex sm:w-auto sm:shrink-0">
      {/* preload=metadata so the bar knows how long the track is before anybody
          presses play, without pulling the audio down on page load — a running
          order can carry a dozen of these. */}
      <audio ref={audio} src={`/api/program/track/${file}`} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${name ?? "the track"}` : `Play ${name ?? "the track"}`}
        title={name ?? "track"}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-rule-surface text-on-surface-muted transition hover:bg-panel-hover"
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

      <input
        type="range"
        min={0}
        max={length || 0}
        step={0.1}
        value={Math.min(at, length || 0)}
        disabled={!length}
        aria-label="Position in the track"
        onChange={(e) => {
          const el = audio.current;
          if (!el) return;
          const t = Number(e.target.value);
          el.currentTime = t;
          setAt(t);
        }}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-brass disabled:cursor-not-allowed sm:w-28 sm:flex-none"
      />

      <span className="font-mono text-[10px] tabular-nums text-on-surface-muted">
        {mmss(at)}
        {length ? `/${mmss(length)}` : ""}
      </span>
    </span>
  );
}

export function TrackControl({
  itemId,
  initial,
  canEdit,
  className,
}: {
  itemId: string;
  initial: TrackInfo;
  canEdit: boolean;
  className?: string;
}) {
  const [track, setTrack] = useState<TrackInfo>(initial);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setError(null);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/program/item/${itemId}/track`);
    // The body IS the file — no multipart — so the type header doubles as the
    // thing the server validates against, and the name rides separately.
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-Track-Name", encodeHeader(file.name));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      try {
        const body = JSON.parse(xhr.responseText) as
          | { ok: true; file: string; name: string; bytes: number }
          | { error: string };
        if (xhr.status >= 200 && xhr.status < 300 && "ok" in body) {
          setTrack({ file: body.file, name: body.name, bytes: body.bytes, uploadedBy: null });
        } else {
          setError("error" in body ? body.error : "The upload failed.");
        }
      } catch {
        setError("The upload failed.");
      }
      if (input.current) input.current.value = "";
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("The upload failed — check the connection and try again.");
    };
    xhr.send(file);
  }

  async function remove() {
    setError(null);
    const res = await fetch(`/api/program/item/${itemId}/track`, { method: "DELETE" });
    if (res.ok) setTrack({ file: null, name: null, bytes: null, uploadedBy: null });
    else setError("Could not remove that track.");
  }

  return (
    <div className={cn("grid gap-1.5", className)}>
      {track.file ? (
        <>
          <audio
            controls
            preload="metadata"
            className="h-9 w-full"
            src={`/api/program/track/${track.file}`}
          >
            Your browser cannot play audio.
          </audio>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-on-surface-muted">
            <span className="min-w-0 truncate">{track.name ?? "track"}</span>
            {track.bytes ? <span>{humanSize(track.bytes)}</span> : null}
            {track.uploadedBy ? <span>added by {track.uploadedBy}</span> : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="underline hover:text-on-surface"
                >
                  replace
                </button>
                <button type="button" onClick={remove} className="underline hover:text-on-surface">
                  remove
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={progress !== null}
          className="inline-flex h-8 items-center justify-center rounded-[10px] border border-rule-surface bg-field px-2 text-xs hover:border-brass/50 disabled:opacity-60"
        >
          {progress === null ? "Add a track" : `Uploading… ${progress}%`}
        </button>
      ) : null}

      {progress !== null && track.file ? (
        <p className="text-[11px] text-on-surface-muted">Uploading… {progress}%</p>
      ) : null}

      {canEdit ? (
        <input
          ref={input}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      ) : null}

      {error ? <p className="text-[11px] text-kumkum">{error}</p> : null}
    </div>
  );
}

/**
 * A header may only carry Latin-1, and a filename may be anything at all —
 * "Śrī Rāma.mp3" would throw on setRequestHeader. Percent-encoding keeps the
 * name intact for the server to decode rather than dropping the characters.
 */
function encodeHeader(value: string): string {
  return encodeURIComponent(value);
}
