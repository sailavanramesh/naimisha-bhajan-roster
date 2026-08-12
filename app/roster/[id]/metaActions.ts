"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";

const Input = z.object({
  sessionId: z.string().min(1),
  /** "" clears it. */
  categoryId: z.string(),
  topic: z.string().max(200),
  /** "HH:MM", or "" for none. */
  startsAt: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 19:00."),
});

/**
 * What kind of session this was, what it was about, and when it started.
 *
 * Sailavan, 2026-08-12: "important for completeness and training" rather than
 * for the day-to-day — the roster works without any of it. That is why it sits
 * behind a disclosure on the session page instead of in the header: filling it
 * in is a deliberate act, usually while backfilling old sessions from records
 * kept somewhere else, and it should cost nothing to everybody who never opens
 * it.
 */
export async function updateSessionMeta(input: {
  sessionId: string;
  categoryId: string;
  topic: string;
  startsAt: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("editSessionNotes");

  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not save." };
  }
  const { sessionId, categoryId, topic, startsAt } = parsed.data;

  if (categoryId) {
    const exists = await prisma.sessionCategory.count({ where: { id: categoryId } });
    if (exists === 0) return { ok: false, error: "That category no longer exists." };
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      categoryId: categoryId || null,
      topic: topic.trim() || null,
      startsAt: startsAt || null,
    },
  });

  revalidatePath(`/roster/${sessionId}`);
  return { ok: true };
}

const CategoryInput = z.object({ name: z.string().trim().min(1).max(60) });

/**
 * Add a category.
 *
 * Editors, not owners: naming the kinds of session the centre runs is part of
 * running the roster, unlike deciding when the app buzzes people.
 */
export async function addSessionCategory(
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("manageAllocations");

  const parsed = CategoryInput.safeParse({ name });
  if (!parsed.success) return { ok: false, error: "Give it a name." };

  const existing = await prisma.sessionCategory.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (existing) return { ok: false, error: `"${existing.name}" is already there.` };

  const last = await prisma.sessionCategory.findFirst({ orderBy: { order: "desc" } });
  await prisma.sessionCategory.create({
    data: { name: parsed.data.name, order: (last?.order ?? -1) + 1 },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Remove a category.
 *
 * The sessions that used it keep existing and become uncategorised — the
 * relation is SetNull, so deleting a name can never delete a roster.
 */
export async function removeSessionCategory(
  id: string,
): Promise<{ ok: true; freed: number } | { ok: false; error: string }> {
  await requireCapability("manageAllocations");
  if (!id) return { ok: false, error: "Nothing to remove." };

  const freed = await prisma.session.count({ where: { categoryId: id } });
  await prisma.sessionCategory.delete({ where: { id } });

  revalidatePath("/admin");
  return { ok: true, freed };
}
