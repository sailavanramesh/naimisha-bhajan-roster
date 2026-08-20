"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability, getSignedInSinger } from "@/lib/auth";
import { validateCycle, type CycleInput } from "@/lib/availability";

/**
 * Everything a singer can change about their own availability.
 *
 * Every action here resolves the singer from the SESSION and ignores any id a
 * caller might send. There is deliberately no "on behalf of" path: a
 * coordinator can see that somebody is unavailable, and cannot say so for them
 * or look at why. That is the whole privacy design, and it is enforced here
 * rather than in the pages that call it.
 */

async function me(): Promise<{ id: string } | null> {
  await requireCapability("manageOwnAvailability");
  const signedIn = await getSignedInSinger();
  return signedIn ? { id: signedIn.id } : null;
}

/** A Melbourne date string as the `@db.Date` value to store. */
function asDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function blockDate(input: { date: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const singer = await me();
  if (!singer) return { ok: false, error: "Sign in as yourself first." };

  const date = asDate(input.date);
  if (!date) return { ok: false, error: "That is not a date." };

  const note = (input.note ?? "").trim().slice(0, 200) || null;

  await prisma.singerUnavailability.upsert({
    where: { singerId_date: { singerId: singer.id, date } },
    create: { singerId: singer.id, date, note },
    update: { note },
  });

  revalidatePath("/availability");
  return { ok: true };
}

export async function unblockDate(input: { date: string }): Promise<{ ok: boolean; error?: string }> {
  const singer = await me();
  if (!singer) return { ok: false, error: "Sign in as yourself first." };

  const date = asDate(input.date);
  if (!date) return { ok: false, error: "That is not a date." };

  await prisma.singerUnavailability
    .delete({ where: { singerId_date: { singerId: singer.id, date } } })
    .catch(() => null); // Already gone is the outcome asked for.

  revalidatePath("/availability");
  return { ok: true };
}

/**
 * Turn cycle prediction on, or update it.
 *
 * Storing three numbers, not a history: the last start and two lengths. It is
 * the smallest thing that predicts and the least to hold about somebody.
 */
export async function saveCycle(input: CycleInput): Promise<{ ok: boolean; error?: string }> {
  const singer = await me();
  if (!singer) return { ok: false, error: "Sign in as yourself first." };

  const problems = validateCycle(input);
  if (problems.length > 0) return { ok: false, error: problems[0].message };

  const lastStart = asDate(input.lastStart);
  if (!lastStart) return { ok: false, error: "That is not a date." };

  await prisma.singerCycle.upsert({
    where: { singerId: singer.id },
    create: {
      singerId: singer.id,
      lastStart,
      cycleLengthDays: input.cycleLengthDays,
      durationDays: input.durationDays,
    },
    update: {
      lastStart,
      cycleLengthDays: input.cycleLengthDays,
      durationDays: input.durationDays,
    },
  });

  revalidatePath("/availability");
  return { ok: true };
}

/**
 * Turn it off, and delete what was stored.
 *
 * A real delete, not a flag. Somebody switching this off is asking for the data
 * to be gone, and leaving a disabled row holding their dates would not be that.
 */
export async function forgetCycle(): Promise<{ ok: boolean; error?: string }> {
  const singer = await me();
  if (!singer) return { ok: false, error: "Sign in as yourself first." };

  await prisma.singerCycle.delete({ where: { singerId: singer.id } }).catch(() => null);

  revalidatePath("/availability");
  return { ok: true };
}
