"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { PITCH_CLASS } from "@/lib/pitch";
import { moveItem } from "@/lib/program";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Editing a music program's running order.
 *
 * Everything here is gated on `editPrograms` — hiding a control is not
 * authorisation, and these are ordinary Server Actions anybody can POST to.
 *
 * Nothing in this file can reach SessionSlot, so no edit made on a program can
 * touch a confirmed pitch or a bhajan session's history. That is not an
 * accident of the queries; it is why a program's content lives in its own
 * tables at all.
 */

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };

/** The 12 notes, as programs write pitch — a bare letter, no shruti label. */
const NOTES = Object.keys(PITCH_CLASS) as [string, ...string[]];

const Id = z.string().min(1);
/** Trimmed, and an empty string becomes null — a cleared input means "unset". */
const Text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s));

async function refresh(sessionId: string) {
  revalidatePath(`/program/${sessionId}`);
  revalidatePath("/program");
  revalidatePath("/roster");
}

/** The session an item belongs to, or null when the item is gone. */
async function sessionOf(itemId: string): Promise<string | null> {
  const item = await prisma.programItem.findUnique({
    where: { id: itemId },
    select: { sessionId: true },
  });
  return item?.sessionId ?? null;
}

/**
 * Add a song or a reading to the end of the running order.
 *
 * Appended rather than inserted, always. Somebody building a program works
 * down the page, and an item that arrives in the middle of the list is a
 * surprise; moving it up afterwards is one press and is asked for explicitly.
 */
export async function addProgramItem(input: {
  sessionId: string;
  kind: "song" | "narration";
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({ sessionId: Id, kind: z.enum(["song", "narration"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not add that." };

  const session = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
    select: { format: true },
  });
  if (!session) return { ok: false, error: "That program is gone." };
  if (session.format !== "program") {
    return { ok: false, error: "That is a bhajan session, not a music program." };
  }

  const last = await prisma.programItem.findFirst({
    where: { sessionId: parsed.data.sessionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.programItem.create({
    data: {
      sessionId: parsed.data.sessionId,
      kind: parsed.data.kind,
      position: (last?.position ?? 0) + 1,
    },
  });

  await refresh(parsed.data.sessionId);
  return ok;
}

const ItemFields = z.object({
  id: Id,
  title: Text(200),
  narration: Text(20_000),
  /**
   * A bare note. Programs record pitch as the note alone — see ProgramItem
   * .pitchNote. Anything else is rejected rather than stored, because a pitch
   * that does not parse is worse than no pitch: it looks like an answer.
   */
  pitchNote: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => (s.length === 0 ? null : s))
    .refine((s) => s === null || NOTES.includes(s), { message: "not a note" }),
  bpm: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === "number" ? v : Number(v.trim());
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    })
    .nullable(),
  referenceUrl: Text(500),
  arrangement: Text(5_000),
  notes: Text(5_000),
});

/** Save one item's own fields. Performers and instruments have their own actions. */
export async function updateProgramItem(input: {
  id: string;
  title: string;
  narration: string;
  pitchNote: string;
  bpm: string;
  referenceUrl: string;
  arrangement: string;
  notes: string;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error:
        issue?.message === "not a note"
          ? "Pitch should be a note like A# or D."
          : "Could not save that.",
    };
  }

  const sessionId = await sessionOf(parsed.data.id);
  if (!sessionId) return { ok: false, error: "That item is gone." };

  const { id, ...fields } = parsed.data;
  await prisma.programItem.update({ where: { id }, data: fields });

  await refresh(sessionId);
  return ok;
}

/**
 * Set the pitch this song is sung at in this programme, and nothing else.
 *
 * `updateProgramItem` above writes every field on the item at once, which is
 * right for the editor that holds all of them and wrong for everywhere else: a
 * shruti finder beside the words knows the pitch and nothing about the
 * arrangement notes, and saving through the wide action would have to send back
 * whatever it happened to be told about the rest.
 *
 * Sailavan, 2026-08-26: a shruti finder on the words "defaults to the shruti or
 * pitch allocated for the song, but can be changed for practice purposes (and
 * reascribed to the song as an option)". This is that option — the same
 * `editPrograms` rule as the pitch dropdown in the running order, because it
 * writes the same field.
 *
 * Also revalidates the SONG page: the finder there is reached from a running
 * order, and it must not still be showing the old allocation after saving.
 */
export async function setItemPitch(input: { itemId: string; pitch: string }): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({
      itemId: Id,
      pitch: z
        .string()
        .trim()
        .toUpperCase()
        .transform((s) => (s.length === 0 ? null : s))
        .refine((s) => s === null || NOTES.includes(s), { message: "not a note" }),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pitch should be a note like A# or D." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { sessionId: true, songId: true },
  });
  if (!item) return { ok: false, error: "That item is gone." };

  await prisma.programItem.update({
    where: { id: parsed.data.itemId },
    data: { pitchNote: parsed.data.pitch },
  });

  if (item.songId) revalidatePath(`/songs/${item.songId}`);
  await refresh(item.sessionId);
  return ok;
}

/**
 * Move an item one place up or down.
 *
 * The whole order is rewritten from `moveItem`, which is pure and tested — the
 * alternative, swapping two positions in place, breaks the moment the stored
 * positions have a gap in them, and a delete leaves exactly that.
 *
 * Positions are written in two passes because of the unique index on
 * (sessionId, position): moving straight to the target collides with whatever
 * is standing there. The first pass parks everything in negative territory,
 * which nothing else uses.
 */
export async function moveProgramItem(input: {
  id: string;
  direction: "up" | "down";
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ id: Id, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not move that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.id },
    select: { sessionId: true, position: true },
  });
  if (!item) return { ok: false, error: "That item is gone." };

  const items = await prisma.programItem.findMany({
    where: { sessionId: item.sessionId },
    orderBy: { position: "asc" },
    select: { id: true, position: true, kind: true },
  });

  const target = item.position + (parsed.data.direction === "up" ? -1 : 1);
  const moved = moveItem(items, item.position, target);
  const changes = moved
    .map((m, index) => ({ id: m.id, to: index + 1, from: items.find((i) => i.id === m.id)! .position }))
    .filter((c) => c.from !== c.to);
  if (changes.length === 0) return ok;

  await prisma.$transaction([
    ...changes.map((c) =>
      prisma.programItem.update({ where: { id: c.id }, data: { position: -c.to } }),
    ),
    ...changes.map((c) =>
      prisma.programItem.update({ where: { id: c.id }, data: { position: c.to } }),
    ),
  ]);

  await refresh(item.sessionId);
  return ok;
}

/**
 * Remove an item, and close the gap it leaves.
 *
 * Renumbering matters more than it looks: leaving a hole would be invisible
 * until somebody moved something, at which point the two-pass write above
 * would be reordering a list that does not match what is on screen.
 */
export async function removeProgramItem(input: { id: string }): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.id },
    select: { sessionId: true, position: true },
  });
  if (!item) return ok; // already gone; nothing to say

  await prisma.$transaction(async (tx) => {
    await tx.programItem.delete({ where: { id: parsed.data.id } });
    const after = await tx.programItem.findMany({
      where: { sessionId: item.sessionId, position: { gt: item.position } },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    for (const row of after) {
      await tx.programItem.update({ where: { id: row.id }, data: { position: row.position - 1 } });
    }
  });

  await refresh(item.sessionId);
  return ok;
}

/**
 * Add somebody to an item.
 *
 * `singerId` OR `name`. Half the performers in the source documents are not
 * roster singers — Psais, All girls, Radhika aunty — so a free name is a
 * first-class answer here, not a fallback.
 */
export async function addPerformer(input: {
  itemId: string;
  singerId: string;
  name: string;
  part: string;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({ itemId: Id, singerId: Text(60), name: Text(80), part: Text(40) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not add that." };
  if (!parsed.data.singerId && !parsed.data.name) {
    return { ok: false, error: "Pick somebody, or type a name." };
  }

  const sessionId = await sessionOf(parsed.data.itemId);
  if (!sessionId) return { ok: false, error: "That item is gone." };

  const last = await prisma.programPerformer.findFirst({
    where: { itemId: parsed.data.itemId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.programPerformer.create({
    data: {
      itemId: parsed.data.itemId,
      singerId: parsed.data.singerId,
      // A singer carries their own name; storing it twice would let the two
      // disagree the first time somebody is renamed.
      name: parsed.data.singerId ? null : parsed.data.name,
      part: parsed.data.part,
      order: (last?.order ?? -1) + 1,
    },
  });

  await refresh(sessionId);
  return ok;
}

export async function removePerformer(input: { id: string }): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const performer = await prisma.programPerformer.findUnique({
    where: { id: parsed.data.id },
    select: { itemId: true },
  });
  if (!performer) return ok;

  const sessionId = await sessionOf(performer.itemId);
  await prisma.programPerformer.delete({ where: { id: parsed.data.id } });

  if (sessionId) await refresh(sessionId);
  return ok;
}

/** Put an instrument on an item, with whoever is playing it. */
export async function addItemInstrument(input: {
  itemId: string;
  instrumentId: string;
  singerId: string;
  person: string;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({ itemId: Id, instrumentId: Id, singerId: Text(60), person: Text(80) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick an instrument." };

  const sessionId = await sessionOf(parsed.data.itemId);
  if (!sessionId) return { ok: false, error: "That item is gone." };

  const already = await prisma.programItemInstrument.findUnique({
    where: {
      itemId_instrumentId: {
        itemId: parsed.data.itemId,
        instrumentId: parsed.data.instrumentId,
      },
    },
    select: { id: true },
  });
  if (already) return { ok: false, error: "That instrument is already on this item." };

  const last = await prisma.programItemInstrument.findFirst({
    where: { itemId: parsed.data.itemId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.programItemInstrument.create({
    data: {
      itemId: parsed.data.itemId,
      instrumentId: parsed.data.instrumentId,
      singerId: parsed.data.singerId,
      person: parsed.data.singerId ? null : parsed.data.person,
      order: (last?.order ?? -1) + 1,
    },
  });

  await refresh(sessionId);
  return ok;
}

export async function removeItemInstrument(input: { id: string }): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const row = await prisma.programItemInstrument.findUnique({
    where: { id: parsed.data.id },
    select: { itemId: true },
  });
  if (!row) return ok;

  const sessionId = await sessionOf(row.itemId);
  await prisma.programItemInstrument.delete({ where: { id: parsed.data.id } });

  if (sessionId) await refresh(sessionId);
  return ok;
}
