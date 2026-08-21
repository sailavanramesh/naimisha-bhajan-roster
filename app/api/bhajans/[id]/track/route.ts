import { NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { trackPath } from "@/lib/trackStore";
import { storeUploadedTrack } from "@/lib/trackUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload the recording of one bhajan, so a member can listen and learn it.
 *
 * Sailavan, 2026-08-21: "add an option to add a track to a bhajan… so people can
 * listen to it and learn the bhajan."
 *
 * One per bhajan: a second upload replaces the first, exactly as it does for a
 * programme item. The streaming, the size limit and the shared storage budget
 * are in lib/trackUpload.ts.
 *
 * Gated on `addBhajan` — the capability for changing what the masterlist says
 * about a bhajan, which is what this is. Everybody signed in may LISTEN; that
 * gate is in lib/trackServing.ts.
 *
 * No `revalidateTag(BHAJANS_TAG)` here on purpose. The cached masterlist read in
 * lib/candidateQueries.ts does not select these columns, so a recording cannot
 * change the candidate pool or a filter chip. Only this bhajan's own page needs
 * to be told.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "addBhajan")) {
    return NextResponse.json({ error: "You cannot change this bhajan." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const bhajan = await prisma.bhajan.findUnique({
    where: { id },
    select: { id: true, trackFile: true },
  });
  if (!bhajan) return NextResponse.json({ error: "No such bhajan." }, { status: 404 });

  const stored = await storeUploadedTrack(req);
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });

  // Replace, do not accumulate: the previous file has nothing pointing at it
  // once the row moves, and the plan's storage is shared with programmes.
  const previous = bhajan.trackFile ? trackPath(bhajan.trackFile) : null;

  const signedIn = await getSignedInSinger();
  await prisma.bhajan.update({
    where: { id: bhajan.id },
    data: {
      trackFile: stored.file,
      trackName: stored.name,
      trackBytes: stored.bytes,
      trackUploadedAt: new Date(),
      trackUploadedBy: signedIn?.name ?? null,
    },
  });

  if (previous && previous !== trackPath(stored.file)) await rm(previous, { force: true });

  revalidatePath(`/bhajans/${bhajan.id}`);
  return NextResponse.json({ ok: true, file: stored.file, name: stored.name, bytes: stored.bytes });
}

/** Remove the recording from a bhajan, and from the disk. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "addBhajan")) {
    return NextResponse.json({ error: "You cannot change this bhajan." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const bhajan = await prisma.bhajan.findUnique({
    where: { id },
    select: { id: true, trackFile: true },
  });
  if (!bhajan) return NextResponse.json({ error: "No such bhajan." }, { status: 404 });

  const path = bhajan.trackFile ? trackPath(bhajan.trackFile) : null;

  // The row is cleared first. A file left behind is tidy-up; a row pointing at
  // a file that is gone is a player that spins forever.
  await prisma.bhajan.update({
    where: { id: bhajan.id },
    data: {
      trackFile: null,
      trackName: null,
      trackBytes: null,
      trackUploadedAt: null,
      trackUploadedBy: null,
    },
  });
  if (path) await rm(path, { force: true });

  revalidatePath(`/bhajans/${bhajan.id}`);
  return NextResponse.json({ ok: true });
}
