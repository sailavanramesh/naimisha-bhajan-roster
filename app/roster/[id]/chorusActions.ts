"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth";
import { isChorusColour, type MicColourValue } from "@/lib/micCushion";
import { revalidatePath } from "next/cache";

/**
 * The chorus mic on one bhajan: who is on it, and what colour its cushion is.
 *
 * Two writes with two different gates, which is the point of splitting them:
 *
 *   - WHO choruses is an allocation, like the singer in the row, so it needs
 *     `assignSingers`.
 *   - The CUSHION COLOUR is live desk state, like the existing mic cushions, so
 *     any signed-in person may set it during a session.
 *
 * Both are stored on the row rather than against the person. The chorus mic is
 * a different mic from the lead mics, and the same singer may lead bhajan 1 on
 * blue and chorus bhajan 3 on green — a per-person key cannot hold both.
 *
 * Neither write touches `confirmedPitch`, and neither goes through the roster
 * grid's optimistic-concurrency guard: a cushion tap must never make a
 * coordinator's save fail as a conflict that is not one. Same reasoning as
 * MicCushion, written up in the schema.
 */

const Slot = z.object({ slotId: z.string().min(1) });

export type ChorusResult =
  | { ok: true; chorusSingerId: string | null; chorusCushion: MicColourValue | null }
  | { ok: false; error: string };

async function sessionOf(slotId: string): Promise<string | null> {
  const slot = await prisma.sessionSlot.findUnique({
    where: { id: slotId },
    select: { sessionId: true },
  });
  return slot?.sessionId ?? null;
}

/** Who is on the chorus mic for this bhajan. An allocation. */
export async function setChorusSinger(input: {
  slotId: string;
  singerId: string | null;
}): Promise<ChorusResult> {
  await requireCapability("assignSingers");

  const parsed = Slot.extend({
    singerId: z.union([z.string().min(1), z.null()]),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not set that." };

  const sessionId = await sessionOf(parsed.data.slotId);
  if (!sessionId) return { ok: false, error: "That row is gone." };

  const row = await prisma.sessionSlot.update({
    where: { id: parsed.data.slotId },
    data: { chorusSingerId: parsed.data.singerId },
    select: { chorusSingerId: true, chorusCushion: true },
  });

  revalidatePath(`/roster/${sessionId}`);
  return { ok: true, chorusSingerId: row.chorusSingerId, chorusCushion: row.chorusCushion };
}

/** What colour the chorus mic's cushion is on this bhajan. Live desk state. */
export async function setChorusCushion(input: {
  slotId: string;
  colour: string | null;
}): Promise<ChorusResult> {
  await requireCapability("setMicCushion");

  const parsed = Slot.extend({
    colour: z
      .union([z.string(), z.null()])
      .refine((v) => v === null || isChorusColour(v), "not a cushion colour"),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a cushion colour." };

  const sessionId = await sessionOf(parsed.data.slotId);
  if (!sessionId) return { ok: false, error: "That row is gone." };

  const row = await prisma.sessionSlot.update({
    where: { id: parsed.data.slotId },
    data: { chorusCushion: (parsed.data.colour as MicColourValue | null) ?? null },
    select: { chorusSingerId: true, chorusCushion: true },
  });

  revalidatePath(`/roster/${sessionId}`);
  return { ok: true, chorusSingerId: row.chorusSingerId, chorusCushion: row.chorusCushion };
}
