"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth";
import { isMicColour, type ChorusMic, type MicColourValue } from "@/lib/micCushion";
import { cushionsForSession } from "@/lib/sessionDesk";
import { describeChorusCopy, planChorusCopy } from "@/lib/chorusCopy";
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
 * EVERY write here is open to any signed-in person — `setMicCushion`.
 *
 * Adding and removing used to need `assignSingers`, on the reasoning that WHO
 * choruses is an allocation like the singer in the row. Sailavan, 2026-08-18:
 * "chorus mic selection and entry should be open to all users (with the copy
 * down features too)." He is right, and the split was the mistake: a chorus mic
 * is not a rostered part. Nobody is being put on the programme, no history is
 * being written, and the person who knows who has picked up the third mic is
 * whoever is standing at the desk — who is usually not a coordinator.
 *
 * It is the same call already recorded for MicCushion in the schema: live
 * sound-desk state, not the historical record, so it sits outside the
 * editor-only allocation rules.
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

/** Put somebody on a chorus mic for this bhajan. Live desk state — see above. */
export async function addChorusSinger(input: {
  slotId: string;
  singerId: string;
}): Promise<ChorusResult> {
  await requireCapability("setMicCushion");

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
  await requireCapability("setMicCushion");

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
      .refine((v) => v === null || isMicColour(v), "not a cushion colour"),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a cushion colour." };
  const { slotId, singerId, colour } = parsed.data;

  const sessionId = await sessionOf(slotId);
  if (!sessionId) return { ok: false, error: "That row is gone." };

  /*
   * Same rule as the lead cushions, and the same reason it is enforced here
   * rather than only in the picker: a cushion that is not on this session's
   * desk cannot be set. Clearing stays open, so a colour the desk has dropped
   * can always be taken off.
   */
  if (colour !== null) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { deskId: true },
    });
    const offered = await cushionsForSession(session?.deskId ?? null);
    if (!offered.some((c) => c.value === colour)) {
      return { ok: false, error: "That cushion is not on this session's desk." };
    }
  }

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

/**
 * Put this bhajan's chorus mics onto every bhajan below that has none.
 *
 * The chorus is usually the same two or three people all evening, each on the
 * cushion they picked up at the start, so setting it per bhajan is the same
 * handful of taps repeated down the column. Sailavan asked for a copy down.
 *
 * ONLY FILLS EMPTY ONES — see lib/chorusCopy.ts, where that decision lives as a
 * pure function. A bhajan somebody has already answered is left exactly as it
 * is and counted as skipped, which is what lets this be a single press with no
 * confirm and no undo: there is nothing to undo.
 *
 * Open to anybody signed in, like every other write in this file. It is the
 * same act as setting the mics by hand, done once instead of six times.
 *
 * Returns the full list for every slot it touched, so the grid can show the
 * result without a reload — the same "server settles it" contract as the three
 * writes above, widened to several slots.
 */
export async function copyChorusDown(input: { slotId: string }): Promise<
  | { ok: true; message: string; mics: Record<string, ChorusMic[]> }
  | { ok: false; error: string }
> {
  await requireCapability("setMicCushion");

  const parsed = Slot.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not copy that." };
  const { slotId } = parsed.data;

  const from = await prisma.sessionSlot.findUnique({
    where: { id: slotId },
    select: {
      sessionId: true,
      position: true,
      chorus: {
        select: { singerId: true, cushion: true, position: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!from) return { ok: false, error: "That row is gone." };
  if (from.chorus.length === 0) {
    return { ok: false, error: "Put somebody on a chorus mic here first." };
  }

  const siblings = await prisma.sessionSlot.findMany({
    where: { sessionId: from.sessionId },
    select: { id: true, position: true, _count: { select: { chorus: true } } },
  });

  const plan = planChorusCopy({
    fromPosition: from.position,
    targets: siblings.map((s) => ({
      slotId: s.id,
      position: s.position,
      micCount: s._count.chorus,
    })),
  });

  if (plan.fill.length > 0) {
    /*
     * One statement, and `skipDuplicates` rather than a check-then-write. Two
     * people can be at this column at once — one at the desk, one on the
     * roster — and a mic added between the plan and the write is a row that is
     * already there, not a failure.
     */
    await prisma.sessionSlotChorus.createMany({
      data: plan.fill.flatMap((targetId) =>
        from.chorus.map((mic) => ({
          slotId: targetId,
          singerId: mic.singerId,
          cushion: mic.cushion,
          position: mic.position,
        })),
      ),
      skipDuplicates: true,
    });
  }

  revalidatePath(`/roster/${from.sessionId}`);

  const mics: Record<string, ChorusMic[]> = {};
  for (const targetId of plan.fill) mics[targetId] = await micsOf(targetId);

  return { ok: true, message: describeChorusCopy(plan), mics };
}
