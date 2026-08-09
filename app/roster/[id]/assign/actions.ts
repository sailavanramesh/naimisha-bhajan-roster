"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const Apply = z.object({
  sessionId: z.string().min(1),
  /** position -> singerId */
  assignments: z.array(z.object({ position: z.number().int(), singerId: z.string().min(1) })).min(1),
});

/**
 * Write proposed singers onto the session's slots.
 *
 * Only ever sets `singerId`. It does not touch `confirmedPitch`,
 * `historicalRecommendedPitch`, or the bhajan — a roster suggestion must never
 * be able to destroy what somebody actually sang.
 */
export async function applyAssignments(formData: FormData): Promise<void> {
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("assignments") ?? "[]"));
  } catch {
    throw new Error("Could not apply: the assignment payload was not valid JSON.");
  }

  const parsed = Apply.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    assignments: raw,
  });
  if (!parsed.success) {
    throw new Error(`Could not apply: ${parsed.error.issues[0]?.message ?? "invalid input"}`);
  }
  const { sessionId, assignments } = parsed.data;

  await prisma.$transaction(async (tx) => {
    for (const a of assignments) {
      await tx.sessionSlot.updateMany({
        where: { sessionId, position: a.position },
        data: { singerId: a.singerId },
      });
    }
  });

  revalidatePath(`/roster/${sessionId}`);
  redirect(`/roster/${sessionId}`);
}

const SetAvailability = z.object({
  singerId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  available: z.boolean(),
  sessionId: z.string().min(1),
});

export async function setAvailability(formData: FormData): Promise<void> {
  const parsed = SetAvailability.safeParse({
    singerId: String(formData.get("singerId") ?? ""),
    date: String(formData.get("date") ?? ""),
    available: String(formData.get("available") ?? "") === "1",
    sessionId: String(formData.get("sessionId") ?? ""),
  });
  if (!parsed.success) throw new Error("Could not set availability.");
  const { singerId, date, available, sessionId } = parsed.data;

  const day = new Date(`${date}T00:00:00.000Z`);
  await prisma.singerAvailability.upsert({
    where: { singerId_date: { singerId, date: day } },
    create: { singerId, date: day, available },
    update: { available },
  });

  revalidatePath(`/roster/${sessionId}/assign`);
}
