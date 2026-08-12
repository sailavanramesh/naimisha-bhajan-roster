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

/**
 * Delete a session.
 *
 * There was no way to do this at all until 2026-08-12, which showed: 17
 * sessions existed with nothing on them, two of them on the same day. Tapping
 * a day creates a session, so mis-taps accumulate, and until now the only
 * cure was the database.
 *
 * REFUSES A SESSION THAT HOLDS A CONFIRMED PITCH. That is the one piece of
 * genuinely irreplaceable data in this app — what somebody actually sang, at
 * what shruti — and it exists nowhere else. The same rule already governs
 * removing a single row from the assign panel, so this is consistent rather
 * than new.
 *
 * Everything else cascades: slots without pitches, instruments, notices,
 * per-session notification rules. Those are all plans or bookkeeping.
 */
export async function deleteSession(
  sessionId: string,
): Promise<{ ok: true; date: string } | { ok: false; error: string }> {
  await requireCapability("buildSessions");
  if (!sessionId) return { ok: false, error: "Nothing to delete." };

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      date: true,
      slots: { select: { confirmedPitch: true, singer: { select: { name: true } } } },
    },
  });
  if (!session) return { ok: false, error: "That session is already gone." };

  const withPitch = session.slots.filter((s) => s.confirmedPitch);
  if (withPitch.length > 0) {
    const names = [...new Set(withPitch.map((s) => s.singer?.name).filter(Boolean))];
    return {
      ok: false,
      error:
        `This session has ${withPitch.length} confirmed pitch${withPitch.length === 1 ? "" : "es"} on it` +
        `${names.length ? ` (${names.join(", ")})` : ""} — that is a record of what was actually sung, ` +
        `and it exists nowhere else. Clear those rows first if you really mean to lose it.`,
    };
  }

  await prisma.session.delete({ where: { id: sessionId } });

  revalidatePath("/roster");
  return { ok: true, date: session.date.toISOString().slice(0, 10) };
}

const BulkInput = z.object({
  sessionIds: z.array(z.string().min(1)).min(1).max(500),
  /** Absent means leave alone. "" means clear it. */
  categoryId: z.string().nullish(),
  startsAt: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  topic: z.string().max(200).nullish(),
});

/**
 * Set the kind, time or topic on many sessions at once.
 *
 * Sailavan is backfilling what kind each of 214 sessions was from records kept
 * outside the app, and doing that one session at a time is four clicks each.
 * The sessions themselves are already right — this only touches the labels on
 * them.
 *
 * ABSENT MEANS LEAVE ALONE, and that distinction is the whole design. Setting
 * the kind on thirty Sundays must not blank thirty topics as a side effect, so
 * a field that was not filled in is not in the update at all. Clearing is a
 * separate, explicit choice.
 */
export async function bulkUpdateSessionMeta(input: {
  sessionIds: string[];
  categoryId?: string | null;
  startsAt?: string | null;
  topic?: string | null;
}): Promise<{ ok: true; updated: number; fields: string[] } | { ok: false; error: string }> {
  await requireCapability("editSessionNotes");

  const parsed = BulkInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not save that." };
  }
  const v = parsed.data;

  const data: Record<string, string | null> = {};
  const fields: string[] = [];

  if (v.categoryId !== undefined && v.categoryId !== null) {
    if (v.categoryId !== "") {
      const exists = await prisma.sessionCategory.count({ where: { id: v.categoryId } });
      if (exists === 0) return { ok: false, error: "That category no longer exists." };
    }
    data.categoryId = v.categoryId || null;
    fields.push("kind");
  }
  if (v.startsAt !== undefined && v.startsAt !== null) {
    data.startsAt = v.startsAt || null;
    fields.push("start time");
  }
  if (v.topic !== undefined && v.topic !== null) {
    data.topic = v.topic.trim() || null;
    fields.push("topic");
  }

  if (fields.length === 0) return { ok: false, error: "Nothing to change — fill in a field first." };

  const res = await prisma.session.updateMany({
    where: { id: { in: v.sessionIds } },
    data,
  });

  revalidatePath("/roster/details");
  revalidatePath("/roster");
  return { ok: true, updated: res.count, fields };
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
