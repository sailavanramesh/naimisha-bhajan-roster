"use server";

import { prisma } from "@/lib/db";
import { requireCapability, requireGrantedCapability } from "@/lib/auth";
import { nextSectionLabel } from "@/lib/songVerses";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * The song catalogue, and the words in it.
 *
 * Two different gates on purpose. Creating and describing a song is program
 * work (`editPrograms`); its lyrics and meanings are `editSongWords`, which a
 * named person can hold without any other editor power — see
 * lib/capabilities.ts `canWithGrants`.
 */

type Result = { ok: true } | { ok: false; error: string };
type WithId = { ok: true; id: string } | { ok: false; error: string };
const ok: Result = { ok: true };

const Id = z.string().min(1);
const Text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s));

async function refresh(songId?: string) {
  revalidatePath("/songs");
  if (songId) revalidatePath(`/songs/${songId}`);
  revalidatePath("/program");
}

/**
 * Add a song to the catalogue.
 *
 * The title is unique, and a clash returns the existing song rather than an
 * error: two people typing "Payoji Maine" on the same evening mean the same
 * song, and the useful outcome is that they both end up on it.
 */
export async function createSong(input: {
  title: string;
  language?: string;
  tradition?: string;
}): Promise<WithId> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({ title: z.string().trim().min(1).max(200), language: Text(60), tradition: Text(60) })
    .safeParse({ title: input.title, language: input.language ?? "", tradition: input.tradition ?? "" });
  if (!parsed.success) return { ok: false, error: "Give the song a title." };

  const existing = await prisma.song.findFirst({
    where: { title: { equals: parsed.data.title, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { ok: true, id: existing.id };

  const song = await prisma.song.create({
    data: {
      title: parsed.data.title,
      language: parsed.data.language,
      tradition: parsed.data.tradition,
    },
    select: { id: true },
  });

  await refresh(song.id);
  return { ok: true, id: song.id };
}

export async function updateSong(input: {
  id: string;
  title: string;
  language: string;
  tradition: string;
  composer: string;
  referenceUrl: string;
  notes: string;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({
      id: Id,
      title: z.string().trim().min(1).max(200),
      language: Text(60),
      tradition: Text(60),
      composer: Text(120),
      referenceUrl: Text(500),
      notes: Text(5_000),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that." };

  const clash = await prisma.song.findFirst({
    where: { title: { equals: parsed.data.title, mode: "insensitive" }, id: { not: parsed.data.id } },
    select: { title: true },
  });
  if (clash) return { ok: false, error: `"${clash.title}" is already in the catalogue.` };

  const { id, ...fields } = parsed.data;
  await prisma.song.update({ where: { id }, data: fields });

  await refresh(id);
  return ok;
}

/**
 * Point a program item at a song, or unpick it.
 *
 * The item keeps its own `title` either way — that is what a program printed
 * last year said, and a song later renamed or removed from the catalogue must
 * not rewrite history. The song is what the item links TO, not what it is.
 */
export async function setItemSong(input: {
  itemId: string;
  songId: string;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ itemId: Id, songId: Text(60) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not link that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { sessionId: true, title: true },
  });
  if (!item) return { ok: false, error: "That item is gone." };

  const song = parsed.data.songId
    ? await prisma.song.findUnique({
        where: { id: parsed.data.songId },
        select: { id: true, title: true },
      })
    : null;
  if (parsed.data.songId && !song) return { ok: false, error: "That song is gone." };

  await prisma.programItem.update({
    where: { id: parsed.data.itemId },
    data: {
      songId: song?.id ?? null,
      // An item with no title of its own takes the song's, so the running
      // order stops saying "Not chosen yet" the moment it is linked.
      title: item.title?.trim() ? item.title : (song?.title ?? null),
    },
  });

  revalidatePath(`/program/${item.sessionId}`);
  await refresh(song?.id);
  return ok;
}

/* ---------- the words ---------- */

/**
 * Add an empty verse, optionally labelled from a section pick.
 *
 * The label is worked out here rather than in the browser so that two people
 * adding a Charanam at once cannot both get "Charanam 3".
 */
export async function addVerse(input: { songId: string; section: string }): Promise<Result> {
  await requireGrantedCapability("editSongWords");

  const parsed = z.object({ songId: Id, section: Text(40) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not add a verse." };

  const verses = await prisma.songVerse.findMany({
    where: { songId: parsed.data.songId },
    orderBy: { order: "desc" },
    select: { order: true, label: true },
  });

  const label = parsed.data.section
    ? nextSectionLabel(verses.map((v) => v.label ?? ""), parsed.data.section)
    : null;

  await prisma.songVerse.create({
    data: {
      songId: parsed.data.songId,
      order: (verses[0]?.order ?? 0) + 1,
      label,
    },
  });

  await refresh(parsed.data.songId);
  return ok;
}

export async function updateVerse(input: {
  id: string;
  label: string;
  script: string;
  roman: string;
  meaning: string;
}): Promise<Result> {
  await requireGrantedCapability("editSongWords");

  const parsed = z
    .object({
      id: Id,
      label: Text(40),
      script: Text(20_000),
      roman: Text(20_000),
      meaning: Text(20_000),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that verse." };

  const verse = await prisma.songVerse.findUnique({
    where: { id: parsed.data.id },
    select: { songId: true },
  });
  if (!verse) return { ok: false, error: "That verse is gone." };

  const { id, ...fields } = parsed.data;
  await prisma.songVerse.update({ where: { id }, data: fields });

  await refresh(verse.songId);
  return ok;
}

export async function moveVerse(input: {
  id: string;
  direction: "up" | "down";
}): Promise<Result> {
  await requireGrantedCapability("editSongWords");

  const parsed = z.object({ id: Id, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not move that." };

  const verse = await prisma.songVerse.findUnique({
    where: { id: parsed.data.id },
    select: { songId: true, order: true },
  });
  if (!verse) return { ok: false, error: "That verse is gone." };

  const all = await prisma.songVerse.findMany({
    where: { songId: verse.songId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const index = all.findIndex((v) => v.id === parsed.data.id);
  const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= all.length) return ok;

  // Parked negative first: (songId, order) is unique, so writing straight to
  // the target collides with whatever is standing there.
  await prisma.$transaction([
    prisma.songVerse.update({ where: { id: all[index].id }, data: { order: -1 } }),
    prisma.songVerse.update({
      where: { id: all[swapWith].id },
      data: { order: all[index].order },
    }),
    prisma.songVerse.update({
      where: { id: all[index].id },
      data: { order: all[swapWith].order },
    }),
  ]);

  await refresh(verse.songId);
  return ok;
}

export async function removeVerse(input: { id: string }): Promise<Result> {
  await requireGrantedCapability("editSongWords");

  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const verse = await prisma.songVerse.findUnique({
    where: { id: parsed.data.id },
    select: { songId: true },
  });
  if (!verse) return ok;

  await prisma.songVerse.delete({ where: { id: parsed.data.id } });
  await refresh(verse.songId);
  return ok;
}


/**
 * Add verses that a person has already looked at.
 *
 * The other paste guesses and writes in one motion. This one is the second half
 * of a two-step: the browser parses, shows what it made of the document, and
 * only what comes back from that review is written. Sailavan: "the paste verses
 * may not always be exactly the same, so it should send it through to the person
 * after processing it so they can review and reassign as necessary."
 *
 * So this takes finished verses and does no guessing of its own. It appends,
 * like every other paste here — a document arriving in two halves must not wipe
 * the first half.
 */
export async function addPastedVerses(input: {
  songId: string;
  verses: { label: string | null; script: string; roman: string; meaning: string }[];
}): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  await requireGrantedCapability("editSongWords");

  const Layer = z.string().max(20_000);
  const parsed = z
    .object({
      songId: Id,
      verses: z
        .array(
          z.object({
            label: z.union([z.string().trim().max(40), z.null()]),
            script: Layer,
            roman: Layer,
            meaning: Layer,
          }),
        )
        .min(1)
        .max(100),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not read that." };

  // A verse with nothing in any layer is a row somebody emptied while reviewing;
  // it means "drop this", not "store a blank".
  const verses = parsed.data.verses.filter(
    (v) => (v.script + v.roman + v.meaning).trim().length > 0,
  );
  if (verses.length === 0) return { ok: false, error: "There was nothing to add." };

  const last = await prisma.songVerse.findFirst({
    where: { songId: parsed.data.songId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  let order = (last?.order ?? 0) + 1;

  await prisma.$transaction(
    verses.map((v) =>
      prisma.songVerse.create({
        data: {
          songId: parsed.data.songId,
          order: order++,
          label: v.label && v.label.length > 0 ? v.label : null,
          script: v.script.trim().length > 0 ? v.script : null,
          roman: v.roman.trim().length > 0 ? v.roman : null,
          meaning: v.meaning.trim().length > 0 ? v.meaning : null,
        },
      }),
    ),
  );

  await refresh(parsed.data.songId);
  return { ok: true, added: verses.length };
}
