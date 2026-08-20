import { NextResponse } from "next/server";
import { createWriteStream } from "node:fs";
import { rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import {
  MAX_BYTES,
  checkUpload,
  displayName,
  ensureTracksDir,
  humanSize,
  storedName,
  trackPath,
  usedBytes,
} from "@/lib/trackStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload the audio for one programme item.
 *
 * The body is the FILE ITSELF, not a multipart form. That is deliberate: it
 * means the bytes can go straight from the request to the disk without ever
 * being held whole in memory, which matters on a B1 instance with 1.75 GB of
 * RAM shared with everything else the app is doing. The original filename
 * rides along in a header instead.
 *
 * Written to `<id>.<ext>.part` and renamed on success, so an upload that fails
 * or is cancelled half way leaves a `.part` behind rather than a truncated
 * track that looks playable and is not.
 */
export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const role = await getRole();
  if (!can(role, "editPrograms")) {
    return NextResponse.json({ error: "You cannot change this programme." }, { status: 403 });
  }

  const { itemId } = await ctx.params;
  const item = await prisma.programItem.findUnique({
    where: { id: itemId },
    select: { id: true, trackFile: true },
  });
  if (!item) return NextResponse.json({ error: "No such item." }, { status: 404 });

  const declared = req.headers.get("content-length");
  const verdict = checkUpload({
    contentType: req.headers.get("content-type"),
    declaredBytes: declared ? Number(declared) : null,
    usedBytes: await usedBytes(),
  });
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 });

  if (!req.body) return NextResponse.json({ error: "No file sent." }, { status: 400 });

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

  try {
    await pipeline(Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]), counter.stream, createWriteStream(partPath));
  } catch (err) {
    await rm(partPath, { force: true });
    if (tooBig) {
      return NextResponse.json(
        { error: `That file is over the ${humanSize(MAX_BYTES)} limit.` },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The upload failed." },
      { status: 500 },
    );
  }

  if (tooBig) {
    await rm(partPath, { force: true });
    return NextResponse.json(
      { error: `That file is over the ${humanSize(MAX_BYTES)} limit.` },
      { status: 413 },
    );
  }
  if (written === 0) {
    await rm(partPath, { force: true });
    return NextResponse.json({ error: "That file was empty." }, { status: 400 });
  }

  await rename(partPath, finalPath);

  // Replace, do not accumulate: the previous file has nothing pointing at it
  // once the row moves, and the plan's storage is shared.
  const previous = item.trackFile ? trackPath(item.trackFile) : null;

  const signedIn = await getSignedInSinger();
  await prisma.programItem.update({
    where: { id: item.id },
    data: {
      trackFile: name,
      trackName: displayName(req.headers.get("x-track-name")),
      trackBytes: written,
      trackUploadedAt: new Date(),
      trackUploadedBy: signedIn?.name ?? null,
    },
  });

  if (previous && previous !== finalPath) await rm(previous, { force: true });

  return NextResponse.json({
    ok: true,
    file: name,
    name: displayName(req.headers.get("x-track-name")),
    bytes: written,
  });
}

/** Remove the track from an item, and from the disk. */
export async function DELETE(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const role = await getRole();
  if (!can(role, "editPrograms")) {
    return NextResponse.json({ error: "You cannot change this programme." }, { status: 403 });
  }

  const { itemId } = await ctx.params;
  const item = await prisma.programItem.findUnique({
    where: { id: itemId },
    select: { id: true, trackFile: true },
  });
  if (!item) return NextResponse.json({ error: "No such item." }, { status: 404 });

  const path = item.trackFile ? trackPath(item.trackFile) : null;

  // The row is cleared first. A file left behind is tidy-up; a row pointing at
  // a file that is gone is a player that spins forever.
  await prisma.programItem.update({
    where: { id: item.id },
    data: {
      trackFile: null,
      trackName: null,
      trackBytes: null,
      trackUploadedAt: null,
      trackUploadedBy: null,
    },
  });
  if (path) await rm(path, { force: true });

  return NextResponse.json({ ok: true });
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
