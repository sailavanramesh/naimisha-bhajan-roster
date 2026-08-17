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
  location: z.string().max(120),
  /** "HH:MM", or "" for none. */
  startsAt: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 19:00."),
  /**
   * "YYYY-MM-DD". A session put on the wrong day has to be movable — Sailavan,
   * 2026-08-17 — and the alternative was delete and rebuild, which throws away
   * the roster with the mistake.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-08-18."),
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
  location: string;
  startsAt: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("editSessionNotes");

  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not save." };
  }
  const { sessionId, categoryId, topic, location, startsAt, date } = parsed.data;

  if (categoryId) {
    const exists = await prisma.sessionCategory.count({ where: { id: categoryId } });
    if (exists === 0) return { ok: false, error: "That category no longer exists." };
  }

  /*
   * Midnight UTC, like every other date written here. The column is @db.Date
   * and the group is in Melbourne: building the Date any other way lets the
   * local zone shift the session onto the day before, which is the bug the
   * date column exists to avoid (CLAUDE.md, "Dates are session dates").
   */
  const when = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "That is not a date." };

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      categoryId: categoryId || null,
      topic: topic.trim() || null,
      location: location.trim() || null,
      startsAt: startsAt || null,
      date: when,
    },
  });

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/program/${sessionId}`);
  // The calendar and the month strip both read by date, so a session that has
  // moved has moved on them too.
  revalidatePath("/roster");
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
  location: z.string().max(120).nullish(),
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
  location?: string | null;
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
  if (v.location !== undefined && v.location !== null) {
    data.location = v.location.trim() || null;
    fields.push("location");
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

/**
 * Delete several sessions at once.
 *
 * The single delete already refuses anything holding a confirmed pitch, and so
 * does this — per session, not for the batch. Selecting forty empty sessions
 * and one that turns out to hold history should remove the forty and say why
 * the last one stayed, rather than refusing the lot or, far worse, taking the
 * history with it.
 */
export async function bulkDeleteSessions(
  sessionIds: string[],
): Promise<{ ok: true; deleted: number; kept: { date: string; reason: string }[] } | { ok: false; error: string }> {
  await requireCapability("buildSessions");
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }
  if (sessionIds.length > 500) return { ok: false, error: "Too many at once." };

  const sessions = await prisma.session.findMany({
    where: { id: { in: sessionIds } },
    select: {
      id: true,
      date: true,
      slots: { select: { confirmedPitch: true } },
    },
  });

  const kept: { date: string; reason: string }[] = [];
  const removable: string[] = [];

  for (const s of sessions) {
    const withPitch = s.slots.filter((x) => x.confirmedPitch).length;
    if (withPitch > 0) {
      kept.push({
        date: s.date.toISOString().slice(0, 10),
        reason: `${withPitch} confirmed pitch${withPitch === 1 ? "" : "es"}`,
      });
      continue;
    }
    removable.push(s.id);
  }

  const res =
    removable.length > 0
      ? await prisma.session.deleteMany({ where: { id: { in: removable } } })
      : { count: 0 };

  revalidatePath("/roster/details");
  revalidatePath("/roster");
  return { ok: true, deleted: res.count, kept };
}

const CategoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  scope: z.enum(["bhajans", "program"]).default("bhajans"),
});

/**
 * Add a category.
 *
 * Editors, not owners: naming the kinds of session the centre runs is part of
 * running the roster, unlike deciding when the app buzzes people.
 *
 * `scope` says which vocabulary it joins — the kinds of bhajan session, or the
 * kinds of music program. The name is checked across BOTH, because two kinds
 * sharing a name would be indistinguishable everywhere either is shown.
 */
export async function addSessionCategory(
  name: string,
  scope: "bhajans" | "program" = "bhajans",
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("manageAllocations");

  const parsed = CategoryInput.safeParse({ name, scope });
  if (!parsed.success) return { ok: false, error: "Give it a name." };

  const existing = await prisma.sessionCategory.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (existing) return { ok: false, error: `"${existing.name}" is already there.` };

  // Ordering is per scope, so adding a program kind does not push its number
  // past the end of the bhajan list and leave gaps in both.
  const last = await prisma.sessionCategory.findFirst({
    where: { scope: parsed.data.scope },
    orderBy: { order: "desc" },
  });
  await prisma.sessionCategory.create({
    data: { name: parsed.data.name, scope: parsed.data.scope, order: (last?.order ?? -1) + 1 },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Give a category an image, or take it away.
 *
 * The browser shrinks the picture to 256px before it arrives, so what lands
 * here is a few tens of kilobytes. The size check is a backstop against a
 * caller that did not — a data URL is a string, and nothing stops somebody
 * posting a four-megabyte one.
 */
export async function setCategoryImage(input: {
  id: string;
  /** A data URL, or null to clear it. */
  image: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("manageAllocations");
  if (!input.id) return { ok: false, error: "No category." };

  if (input.image !== null) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(input.image)) {
      return { ok: false, error: "That does not look like an image." };
    }
    // ~400KB of base64. A 256px picture is far under this.
    if (input.image.length > 400_000) {
      return { ok: false, error: "That image is too large even after shrinking." };
    }
  }

  await prisma.sessionCategory.update({
    where: { id: input.id },
    data: { image: input.image },
  });

  revalidatePath("/admin");
  revalidatePath("/roster");
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
