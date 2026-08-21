/**
 * lib/trackUpload.ts — getting an uploaded audio file onto the disk safely.
 *
 * The half of an upload that is the same whatever the file is attached to.
 * Lifted out of app/api/program/item/[itemId]/track/route.ts on 2026-08-21, when
 * bhajans got recordings: what differs between the two is who may upload and
 * which row to write, and those stay in their own routes where they can be read.
 *
 * The body is the FILE ITSELF, not a multipart form. That is deliberate: the
 * bytes go straight from the request to the disk without ever being held whole
 * in memory, which matters on a B1 instance with 1.75 GB of RAM shared with
 * everything else the app is doing. The original filename rides in a header.
 *
 * Written to `<id>.<ext>.part` and renamed on success, so an upload that fails
 * or is cancelled half way leaves a `.part` behind rather than a truncated track
 * that looks playable and is not.
 */

import { createWriteStream } from "node:fs";
import { rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import {
  MAX_BYTES,
  checkUpload,
  displayName,
  ensureTracksDir,
  humanSize,
  storedName,
  usedBytes,
} from "@/lib/trackStore";

export type StoredUpload = {
  ok: true;
  /** The generated name inside the tracks directory. Never a path. */
  file: string;
  /** The original filename, tidied. For showing, never for a path. */
  name: string;
  bytes: number;
};

export type UploadFailure = { ok: false; error: string; status: number };

/**
 * Take the request body and put it in the tracks directory.
 *
 * Does no permission checking and touches no database row — the caller owns
 * both, because both are the part that differs.
 */
export async function storeUploadedTrack(req: Request): Promise<StoredUpload | UploadFailure> {
  const declared = req.headers.get("content-length");
  const verdict = checkUpload({
    contentType: req.headers.get("content-type"),
    declaredBytes: declared ? Number(declared) : null,
    usedBytes: await usedBytes(),
  });
  if (!verdict.ok) return { ok: false, error: verdict.reason, status: 400 };

  if (!req.body) return { ok: false, error: "No file sent.", status: 400 };

  const dir = await ensureTracksDir();
  const id = randomUUID().replace(/-/g, "");
  const name = storedName(id, verdict.extension);
  const finalPath = join(dir, name);
  const partPath = `${finalPath}.part`;

  // Content-Length is a claim, not a fact — a chunked upload has none at all.
  // So the limit is enforced on the bytes actually arriving.
  let written = 0;
  let tooBig = false;
  const counter = new TransformStreamCounter((n) => {
    written += n;
    if (written > MAX_BYTES) tooBig = true;
    return !tooBig;
  });

  const overSize: UploadFailure = {
    ok: false,
    error: `That file is over the ${humanSize(MAX_BYTES)} limit.`,
    status: 413,
  };

  try {
    await pipeline(
      Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
      counter.stream,
      createWriteStream(partPath),
    );
  } catch (err) {
    await rm(partPath, { force: true });
    if (tooBig) return overSize;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "The upload failed.",
      status: 500,
    };
  }

  if (tooBig) {
    await rm(partPath, { force: true });
    return overSize;
  }
  if (written === 0) {
    await rm(partPath, { force: true });
    return { ok: false, error: "That file was empty.", status: 400 };
  }

  await rename(partPath, finalPath);

  return {
    ok: true,
    file: name,
    name: displayName(req.headers.get("x-track-name")),
    bytes: written,
  };
}

/**
 * Count bytes as they pass, and stop the stream once it has seen too many.
 *
 * A small class rather than a Transform subclass so the counting rule reads in
 * one place; `onChunk` returning false destroys the stream, which is what makes
 * an oversized upload cost only as much disk as it had already written.
 */
class TransformStreamCounter {
  readonly stream: Transform;
  constructor(onChunk: (bytes: number) => boolean) {
    this.stream = new Transform({
      transform(chunk, _enc, cb) {
        if (!onChunk(chunk.length)) {
          cb(new Error("over the size limit"));
          return;
        }
        cb(null, chunk);
      },
    });
  }
}
