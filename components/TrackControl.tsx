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

import { useRef, useState } from "react";
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
