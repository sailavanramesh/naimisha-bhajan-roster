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
 * Which of a song's two files this request is about.
 *
 * `?kind=karaoke` writes the vocals-stripped half of the practice pair; anything
 * else writes the sung recording. Validated against a fixed map rather than
 * trusted: it selects column names, so it must never be free-form.
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
 * Upload one half of a song's practice pair.
 *
 * Sailavan, 2026-08-21: "i need it not in the bhajans but in the songs section,
 * for the tracks we upload there."
 *
 * Gated on `editPrograms`, which is what already governs uploading audio for a
 * programme item — the only precedent for putting a file on this disk. NOT
 * `editSongWords`: that grant exists so named people can keep the lyrics up to
 * date without any other editor power, and spending the shared storage
 * allowance is a different thing from typing a verse.
 *
 * Everybody signed in may LISTEN; that gate is in lib/trackServing.ts.
 *
 * The streaming, the 30 MB limit and the shared budget check are all in
 * lib/trackUpload.ts, the same code the bhajan and programme routes use.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "editPrograms")) {
    return NextResponse.json({ error: "You cannot change this song." }, { status: 403 });
  }

  const slot = slotFor(req);
  const { id } = await ctx.params;
  const song = await prisma.song.findUnique({
    where: { id },
    select: { id: true, trackFile: true, karaokeTrackFile: true },
  });
  if (!song) return NextResponse.json({ error: "No such song." }, { status: 404 });

  const stored = await storeUploadedTrack(req);
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });

  // Replace, do not accumulate: nothing points at the previous file once the row
  // moves, and the allowance is shared with programmes and bhajans.
  const existing = song[slot.file] as string | null;
  const previous = existing ? trackPath(existing) : null;

  const signedIn = await getSignedInSinger();
  await prisma.song.update({
    where: { id: song.id },
    data: {
      [slot.file]: stored.file,
      [slot.name]: stored.name,
      [slot.bytes]: stored.bytes,
      [slot.at]: new Date(),
      [slot.by]: signedIn?.name ?? null,
    },
  });

  if (previous && previous !== trackPath(stored.file)) await rm(previous, { force: true });

  /*
   * The song page, and the programmes that fall back to this pair. A programme
   * item with no track of its own plays the song's, so a new upload changes
   * what those pages show — see lib/songTracks.ts.
   */
  revalidatePath(`/songs/${song.id}`);
  revalidatePath("/songs");
  revalidatePath("/program");
  return NextResponse.json({ ok: true, file: stored.file, name: stored.name, bytes: stored.bytes });
}

/** Remove one half of the pair, from the song and from the disk. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "editPrograms")) {
    return NextResponse.json({ error: "You cannot change this song." }, { status: 403 });
  }

  const slot = slotFor(_req);
  const { id } = await ctx.params;
  const song = await prisma.song.findUnique({
    where: { id },
    select: { id: true, trackFile: true, karaokeTrackFile: true },
  });
  if (!song) return NextResponse.json({ error: "No such song." }, { status: 404 });

  const existing = song[slot.file] as string | null;
  const path = existing ? trackPath(existing) : null;

  // The row is cleared first. A file left behind is tidy-up; a row pointing at a
  // file that is gone is a player that spins forever.
  await prisma.song.update({
    where: { id: song.id },
    data: {
      [slot.file]: null,
      [slot.name]: null,
      [slot.bytes]: null,
      [slot.at]: null,
      [slot.by]: null,
    },
  });
  if (path) await rm(path, { force: true });

  revalidatePath(`/songs/${song.id}`);
  revalidatePath("/songs");
  revalidatePath("/program");
  return NextResponse.json({ ok: true });
}
