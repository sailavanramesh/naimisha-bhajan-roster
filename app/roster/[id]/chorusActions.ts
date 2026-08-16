"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth";
import { isChorusColour, type ChorusMic, type MicColourValue } from "@/lib/micCushion";
import { revalidatePath } from "next/cache";

/**
 * The chorus mics on one bhajan: who is on them, and what colour each cushion
 * is.
 *
 * A bhajan may have several. It began as one — two columns on the slot — and
 * real use put two and three people on chorus mics at once, so it is now a list
 * (see SessionSlotChorus). Order is `position`, assigned on the way in, so every
 * device shows the mics in the same order.
 *
 * Three writes with two different gates, which is the point of splitting them:
 *
 *   - WHO choruses is an allocation, like the singer in the row, so adding and
 *     removing need `assignSingers`.
 *   - The CUSHION COLOUR is live desk state, like the existing mic cushions, so
 *     any signed-in person may set it during a session.
 *
 * None of them touches `confirmedPitch`, and none goes through the roster
 * grid's optimistic-concurrency guard: a cushion tap must never make a
 * coordinator's save fail as a conflict that is not one. Same reasoning as
 * MicCushion, written up in the schema.
 *
 * Each returns the WHOLE list for the bhajan rather than the one row it
 * touched. Two people are often at this at once — one at the desk, one on the
 * roster — and a full list is the server settling what the cell should show,
 * instead of the cell patching its own guess and drifting.
 */

const Slot = z.object({ slotId: z.string().min(1) });
const SlotSinger = Slot.extend({ singerId: z.string().min(1) });

export type ChorusResult = { ok: true; mics: ChorusMic[] } | { ok: false; error: string };

async function sessionOf(slotId: string): Promise<string | null> {
  const slot = await prisma.sessionSlot.findUnique({
    where: { id: slotId },
    select: { sessionId: true },
  });
  return slot?.sessionId ?? null;
}

/** Everything on the chorus mics for one bhajan, in reading order. */
async function micsOf(slotId: string): Promise<ChorusMic[]> {
  const rows = await prisma.sessionSlotChorus.findMany({
    where: { slotId },
    select: {
      singerId: true,
      cushion: true,
      position: true,
      singer: { select: { name: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return rows.map((r) => ({
    singerId: r.singerId,
    name: r.singer.name,
    cushion: r.cushion,
    position: r.position,
  }));
}

/** Put somebody on a chorus mic for this bhajan. An allocation. */
export async function addChorusSinger(input: {
  slotId: string;
  singerId: string;
}): Promise<ChorusResult> {
  await requireCapability("assignSingers");

  const parsed = SlotSinger.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not set that." };
  const { slotId, singerId } = parsed.data;

  const sessionId = await sessionOf(slotId);
  if (!sessionId) return { ok: false, error: "That row is gone." };

  /*
   * Last in the list, and idempotent. Two taps on the same name — the second
   * one because the first looked like it had not taken — must not be an error
   * the user has to understand; the unique key on (slot, singer) makes the
   * second a no-op that still returns the list.
   */
  const last = await prisma.sessionSlotChorus.findFirst({
    where: { slotId },
    select: { position: true },
    orderBy: { position: "desc" },
  });

  await prisma.sessionSlotChorus.upsert({
    where: { slotId_singerId: { slotId, singerId } },
    create: { slotId, singerId, position: (last?.position ?? 0) + 1 },
    update: {},
  });

  revalidatePath(`/roster/${sessionId}`);
  return { ok: true, mics: await micsOf(slotId) };
}

/** Take somebody off a chorus mic for this bhajan. An allocation. */
export async function removeChorusSinger(input: {
  slotId: string;
  singerId: string;
}): Promise<ChorusResult> {
  await requireCapability("assignSingers");

  const parsed = SlotSinger.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not set that." };
  const { slotId, singerId } = parsed.data;

  const sessionId = await sessionOf(slotId);
  if (!sessionId) return { ok: false, error: "That row is gone." };

  // deleteMany, not delete: removing a mic that somebody else has already
  // removed is the outcome the user wanted, not a crash.
  await prisma.sessionSlotChorus.deleteMany({ where: { slotId, singerId } });

  /*
   * The gap left behind is closed, so positions stay 1..n. Nothing depends on
   * them being contiguous, but they are shown to nobody and compared by
   * everybody, and a list that quietly becomes 1, 3, 7 is a thing to explain
   * later for no gain now.
   */
  const rest = await prisma.sessionSlotChorus.findMany({
    where: { slotId },
    select: { id: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  await prisma.$transaction(
    rest.map((row, i) =>
      prisma.sessionSlotChorus.update({ where: { id: row.id }, data: { position: i + 1 } }),
    ),
  );

  revalidatePath(`/roster/${sessionId}`);
  return { ok: true, mics: await micsOf(slotId) };
}

/** What colour one chorus mic's cushion is. Live desk state. */
export async function setChorusCushion(input: {
  slotId: string;
  singerId: string;
  colour: string | null;
}): Promise<ChorusResult> {
  await requireCapability("setMicCushion");

  const parsed = SlotSinger.extend({
    colour: z
      .union([z.string(), z.null()])
      .refine((v) => v === null || isChorusColour(v), "not a cushion colour"),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a cushion colour." };
  const { slotId, singerId, colour } = parsed.data;

  const sessionId = await sessionOf(slotId);
  if (!sessionId) return { ok: false, error: "That row is gone." };

  // updateMany rather than update, for the same reason as the delete above: the
  // person may have been taken off the mic between the render and the tap, and
  // that is a colour landing on nothing, not an error.
  const hit = await prisma.sessionSlotChorus.updateMany({
    where: { slotId, singerId },
    data: { cushion: (colour as MicColourValue | null) ?? null },
  });
  if (hit.count === 0) return { ok: false, error: "That mic is gone." };

  revalidatePath(`/roster/${sessionId}`);
  return { ok: true, mics: await micsOf(slotId) };
}
