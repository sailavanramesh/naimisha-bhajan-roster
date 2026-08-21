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
 * Which of the two files this request is about.
 *
 * `?kind=karaoke` writes the vocals-stripped half of the practice pair;
 * anything else writes the original. Validated rather than trusted: it picks
 * which columns get written, so it must never be free-form.
 */
const SLOTS = {
  original: {
    file: "trackFile",
    name: "trackName",
    bytes: "trackBytes",
    at: "trackUploadedAt",
    by: "trackUploadedBy",
  },
  karaoke: {
    file: "karaokeTrackFile",
    name: "karaokeTrackName",
    bytes: "karaokeTrackBytes",
    at: "karaokeTrackUploadedAt",
    by: "karaokeTrackUploadedBy",
  },
} as const;

type Slot = (typeof SLOTS)[keyof typeof SLOTS];

function slotFor(req: Request): Slot {
  const kind = new URL(req.url).searchParams.get("kind");
  return kind === "karaoke" ? SLOTS.karaoke : SLOTS.original;
}

/**
 * Upload one of a bhajan's two recordings, so a member can listen and learn it.
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

  const slot = slotFor(req);
  const { id } = await ctx.params;
  const bhajan = await prisma.bhajan.findUnique({
    where: { id },
    select: { id: true, trackFile: true, karaokeTrackFile: true },
  });
  if (!bhajan) return NextResponse.json({ error: "No such bhajan." }, { status: 404 });

  const stored = await storeUploadedTrack(req);
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });

  // Replace, do not accumulate: the previous file has nothing pointing at it
  // once the row moves, and the plan's storage is shared with programmes.
  const existing = bhajan[slot.file] as string | null;
  const previous = existing ? trackPath(existing) : null;

  const signedIn = await getSignedInSinger();
  await prisma.bhajan.update({
    where: { id: bhajan.id },
    data: {
      [slot.file]: stored.file,
      [slot.name]: stored.name,
      [slot.bytes]: stored.bytes,
      [slot.at]: new Date(),
      [slot.by]: signedIn?.name ?? null,
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

  const slot = slotFor(_req);
  const { id } = await ctx.params;
  const bhajan = await prisma.bhajan.findUnique({
    where: { id },
    select: { id: true, trackFile: true, karaokeTrackFile: true },
  });
  if (!bhajan) return NextResponse.json({ error: "No such bhajan." }, { status: 404 });

  const existing = bhajan[slot.file] as string | null;
  const path = existing ? trackPath(existing) : null;

  // The row is cleared first. A file left behind is tidy-up; a row pointing at
  // a file that is gone is a player that spins forever.
  await prisma.bhajan.update({
    where: { id: bhajan.id },
    data: {
      [slot.file]: null,
      [slot.name]: null,
      [slot.bytes]: null,
      [slot.at]: null,
      [slot.by]: null,
    },
  });
  if (path) await rm(path, { force: true });

  revalidatePath(`/bhajans/${bhajan.id}`);
  return NextResponse.json({ ok: true });
}
