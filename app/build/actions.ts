"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { SessionStatus, SessionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { draftSaveDecision } from "@/lib/draftGuard";

/**
 * Slots arrive as one JSON field rather than parallel comma-joined lists:
 * bhajan titles contain commas ("Govinda Harey Gopala Harey (Sindhu Bhairavi,
 * Bhairavi)"), so any delimiter-joined encoding would corrupt them.
 */
const SaveDraft = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date"),
  templateId: z.string().min(1).nullable(),
  seed: z.string().min(1),
  type: z.nativeEnum(SessionType),
  slots: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string(),
        /** Optional: a singer picked on the Build page before saving. */
        singerId: z.string().min(1).nullable().optional(),
      }),
    )
    .min(1, "Nothing to save"),
});

export type SaveResult = { ok: true; sessionId: string } | { ok: false; error: string };

/**
 * Save a generated set as a draft session.
 *
 * The bhajans are PERSISTED rather than stored as "seed + template". The
 * generator weights each candidate by how long ago it was last sung, so once
 * new history is recorded the same seed no longer reproduces the same set.
 *
 * Refuses to touch a session that already carries real history. Nothing here
 * ever deletes a slot with a confirmed pitch.
 */
export async function saveDraftSession(formData: FormData): Promise<void> {
  await requireCapability("buildSessions");
  let rawSlots: unknown = [];
  try {
    rawSlots = JSON.parse(String(formData.get("slots") ?? "[]"));
  } catch {
    throw new Error("Cannot save draft: the slot payload was not valid JSON.");
  }

  const parsed = SaveDraft.safeParse({
    date: String(formData.get("date") ?? ""),
    templateId: (formData.get("templateId") as string) || null,
    seed: String(formData.get("seed") ?? ""),
    type: String(formData.get("type") ?? "Weekday"),
    slots: rawSlots,
  });

  if (!parsed.success) {
    throw new Error(`Cannot save draft: ${parsed.error.issues[0]?.message ?? "invalid input"}`);
  }
  const { date, templateId, seed, type, slots } = parsed.data;

  const sessionDate = new Date(`${date}T00:00:00.000Z`);

  const existing = await prisma.session.findUnique({
    where: { date: sessionDate },
    include: { slots: { select: { id: true, confirmedPitch: true, singerId: true } } },
  });

  const decision = draftSaveDecision(
    existing
      ? {
          status: existing.status === SessionStatus.Draft ? "Draft" : "Published",
          slots: existing.slots.map((s) => ({
            confirmedPitch: s.confirmedPitch,
            singerId: s.singerId,
          })),
        }
      : null,
    date,
  );
  if (decision.action === "refuse") throw new Error(decision.reason);

  const sessionId = await prisma.$transaction(async (tx) => {
    const session = existing
      ? await tx.session.update({
          where: { id: existing.id },
          data: { seed, templateId, type, status: SessionStatus.Draft },
        })
      : await tx.session.create({
          data: {
            date: sessionDate,
            seed,
            templateId,
            type,
            status: SessionStatus.Draft,
          },
        });

    if (existing) {
      // Safe: we established above that none of these carry a singer or a
      // confirmed pitch. They are placeholder rows from an earlier draft.
      await tx.sessionSlot.deleteMany({ where: { sessionId: session.id } });
    }

    await tx.sessionSlot.createMany({
      data: slots.map((s, i) => ({
        sessionId: session.id,
        bhajanId: s.id,
        bhajanTitle: s.title || null,
        singerId: s.singerId ?? null,
        position: i + 1,
      })),
    });

    return session.id;
  });

  revalidatePath("/roster");
  revalidatePath(`/roster/${sessionId}`);
  redirect(`/roster/${sessionId}`);
}
