import { NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { trackPath } from "@/lib/trackStore";
import { storeUploadedTrack } from "@/lib/trackUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload the audio for one programme item.
 *
 * The streaming, the size limit and the storage budget all live in
 * lib/trackUpload.ts, shared with the bhajan recordings. What stays here is the
 * part that is about programmes: who may change one, and which row to write.
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

  const stored = await storeUploadedTrack(req);
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });

  // Replace, do not accumulate: the previous file has nothing pointing at it
  // once the row moves, and the plan's storage is shared.
  const previous = item.trackFile ? trackPath(item.trackFile) : null;

  const signedIn = await getSignedInSinger();
  await prisma.programItem.update({
    where: { id: item.id },
    data: {
      trackFile: stored.file,
      trackName: stored.name,
      trackBytes: stored.bytes,
      trackUploadedAt: new Date(),
      trackUploadedBy: signedIn?.name ?? null,
    },
  });

  if (previous && previous !== trackPath(stored.file)) await rm(previous, { force: true });

  return NextResponse.json({ ok: true, file: stored.file, name: stored.name, bytes: stored.bytes });
}

/** Remove the track from an item, and from the disk. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ itemId: string }> }) {
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
