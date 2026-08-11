"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
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
  await requireCapability("assignSingers");
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
  await requireCapability("assignSingers");
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

const AddSlot = z.object({
  sessionId: z.string().min(1),
  singerId: z.string().min(1),
  bhajanId: z.string().nullable(),
  /** Only ever a pitch the singer has actually committed to. See below. */
  confirmedPitch: z.string().nullable(),
});

/**
 * Add a singer to a session, optionally with a bhajan.
 *
 * The singer-first counterpart to `applyAssignments`: that one fills existing
 * slots, this one creates a slot for a person. `bhajanId` may be null — "just
 * put them on, they will pick a song" is a real and common way to roster.
 *
 * ON THE PITCH. `confirmedPitch` is written only when it came from something
 * the singer actually committed to: a pitch on their own list, or one they
 * have sung this bhajan at before. A PREDICTION is never written here, even
 * though the page shows one, because the offset profiles are computed FROM
 * this column — writing a prediction into it would let the model train on its
 * own output, inflating its confidence and dragging every singer towards their
 * current median. The page offers the predicted number for a human to accept
 * instead.
 *
 * The position is computed inside the transaction so two coordinators adding a
 * singer at the same moment cannot land on the same one; the unique index on
 * (sessionId, position) is the backstop if they do.
 */
export async function addSingerSlot(formData: FormData): Promise<void> {
  await requireCapability("assignSingers");

  const parsed = AddSlot.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    singerId: String(formData.get("singerId") ?? ""),
    bhajanId: (formData.get("bhajanId") as string) || null,
    confirmedPitch: (formData.get("confirmedPitch") as string) || null,
  });
  if (!parsed.success) {
    throw new Error(`Could not add the singer: ${parsed.error.issues[0]?.message ?? "invalid input"}`);
  }
  const { sessionId, singerId, bhajanId, confirmedPitch } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const last = await tx.sessionSlot.findFirst({
      where: { sessionId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const bhajan = bhajanId
      ? await tx.bhajan.findUnique({ where: { id: bhajanId }, select: { title: true } })
      : null;

    await tx.sessionSlot.create({
      data: {
        sessionId,
        singerId,
        bhajanId: bhajanId ?? null,
        // Kept in step with how the rest of the app reads a slot's title.
        bhajanTitle: bhajan?.title ?? null,
        position: (last?.position ?? 0) + 1,
        confirmedPitch: confirmedPitch ?? null,
      },
    });
  });

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${sessionId}/assign`);
  /*
   * Back to the assign page, not to the roster. Rostering is a run of
   * decisions — you add three or four people in a sitting — and bouncing to
   * the roster after each one made it a one-shot flow that had to be navigated
   * back into every time. `added` is echoed so the page can confirm who landed
   * without the coordinator having to scan the list for them.
   */
  redirect(`/roster/${sessionId}/assign?added=${encodeURIComponent(singerId)}`);
}
