"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { rosterBlockReason } from "@/lib/rosterEligibility";
import { notifyAboutSession } from "@/lib/notifySession";
import { rosteredSingerIds, notifyRemovals } from "@/lib/notifyRemoval";
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

  // Same rule for the fairness pass: it proposes from a filtered list, but a
  // stale form could still post somebody who has since lost their voice field.
  const proposed = await prisma.singer.findMany({
    where: { id: { in: assignments.map((a) => a.singerId) } },
    select: { name: true, gender: true },
  });
  for (const p of proposed) {
    const reason = rosterBlockReason(p);
    if (reason) throw new Error(reason);
  }

  await prisma.$transaction(async (tx) => {
    for (const a of assignments) {
      await tx.sessionSlot.updateMany({
        where: { sessionId, position: a.position },
        data: { singerId: a.singerId },
      });
    }
  });

  await notifyAboutSession(sessionId);

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
export async function addSingerSlot(input: {
  sessionId: string;
  singerId: string;
  bhajanId?: string | null;
  confirmedPitch?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("assignSingers");

  const parsed = AddSlot.safeParse({
    sessionId: input.sessionId,
    singerId: input.singerId,
    bhajanId: input.bhajanId ?? null,
    confirmedPitch: input.confirmedPitch ?? null,
  });
  if (!parsed.success) {
    return { ok: false, error: `Could not add the singer: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
  }
  const { sessionId, singerId, bhajanId, confirmedPitch } = parsed.data;

  /*
   * Somebody with no voice recorded is not a singer and cannot hold a slot:
   * the recommended pitch IS the bhajan's reference for their voice, so
   * without one there is no recommendation and no offset profile. Enforced
   * here, not only by hiding them in the picker — a hidden control is not a
   * rule.
   */
  const singer = await prisma.singer.findUnique({
    where: { id: singerId },
    select: { name: true, gender: true },
  });
  /*
   * Returned, not thrown. Next strips a Server Action's error message in
   * production — the client gets an opaque digest — so a thrown refusal
   * reached the coordinator as a blank failure. The whole point of this
   * message is that it says which person and what to do about it.
   */
  const blocked = rosterBlockReason(singer);
  if (blocked) return { ok: false, error: blocked };

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

  /*
   * Revalidate, do not redirect.
   *
   * This used to redirect back to the assign page, which meant every single
   * add was a full navigation: the page visibly reloaded, scroll position
   * moved, and nothing acknowledged the click until the round trip finished.
   * Rostering is a run of four or five of these, so it felt choppy.
   *
   * Called from a client component inside a transition instead, the
   * revalidation updates the list in place and the caller can show a pending
   * state on the exact control that was pressed.
   */
  await notifyAboutSession(sessionId);

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${sessionId}/assign`);

  return { ok: true };
}

const RemoveSlot = z.object({
  sessionId: z.string().min(1),
  slotId: z.string().min(1),
});

/**
 * Take a singer back off a session from the assign page.
 *
 * The counterpart to `addSingerSlot`, for the obvious mistake of adding the
 * wrong person. Deliberately narrower than the roster grid's delete:
 *
 * A slot carrying a `confirmedPitch` is REFUSED. That column is what somebody
 * actually sang (CLAUDE.md rule 6) and exists nowhere else, so it must not be
 * destroyed by a stray click on a quick-add panel. Removing real history stays
 * a deliberate act on the roster page, where the row and its pitch are visible.
 *
 * Slots added from a "sung before" suggestion do carry a pitch, so this will
 * refuse those — the message says where to go instead rather than failing
 * silently.
 */
export async function removeSingerSlot(input: {
  sessionId: string;
  slotId: string;
}): Promise<{ ok: true; name: string } | { ok: false; reason: "has-pitch"; name: string }> {
  await requireCapability("assignSingers");

  const parsed = RemoveSlot.safeParse({ sessionId: input.sessionId, slotId: input.slotId });
  if (!parsed.success) throw new Error("Could not remove that singer.");
  const { sessionId, slotId } = parsed.data;

  const slot = await prisma.sessionSlot.findUnique({
    where: { id: slotId },
    select: { id: true, sessionId: true, confirmedPitch: true, singer: { select: { name: true } } },
  });
  if (!slot || slot.sessionId !== sessionId) {
    return { ok: false, reason: "has-pitch", name: "" };
  }

  if (slot.confirmedPitch) {
    return { ok: false, reason: "has-pitch", name: slot.singer?.name ?? "that singer" };
  }

  const before = await rosteredSingerIds(sessionId);
  await prisma.sessionSlot.delete({ where: { id: slotId } });
  await notifyRemovals(sessionId, before);

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${sessionId}/assign`);

  return { ok: true, name: slot.singer?.name ?? "" };
}

const GoToDate = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date"),
});

/**
 * Point the panel at a different day, creating that session if it does not
 * exist yet.
 *
 * Rostering starts from "who is around on Thursday", not from a session id, so
 * the date belongs in the panel rather than being fixed by whichever URL you
 * happened to arrive through. Creating on demand matches the calendar, where
 * tapping an empty day in edit mode also creates one.
 *
 * Sessions are Melbourne calendar dates, so the date is parsed as a plain UTC
 * midnight rather than through a local timezone that could shift it a day.
 */
export async function goToSessionForDate(formData: FormData): Promise<void> {
  await requireCapability("buildSessions");

  const parsed = GoToDate.safeParse({ date: String(formData.get("date") ?? "") });
  if (!parsed.success) {
    throw new Error(`Could not switch date: ${parsed.error.issues[0]?.message ?? "invalid date"}`);
  }
  const day = new Date(`${parsed.data.date}T00:00:00.000Z`);

  const existing = await prisma.session.findUnique({ where: { date: day }, select: { id: true } });
  const session =
    existing ?? (await prisma.session.create({ data: { date: day }, select: { id: true } }));

  revalidatePath(`/roster/${session.id}/assign`);
  redirect(`/roster/${session.id}/assign`);
}

const AutoAdd = z.object({
  sessionId: z.string().min(1),
  count: z.number().int().min(1).max(12),
});

/**
 * Put the fairest N singers on the session, bhajans left blank.
 *
 * An extra way in, NOT a replacement for the hand-picking above it. That stays
 * the mainstay; this is for "just give me three who are owed a turn".
 *
 * Bhajans are deliberately left empty. Choosing who sings and choosing what
 * they sing are separate decisions, and the fairness score has nothing to say
 * about the second — pretending otherwise would put a bhajan on the roster that
 * nobody chose.
 *
 * Anybody already on the session is skipped rather than doubled up, so pressing
 * it twice tops up rather than duplicating.
 */
export async function autoAddFairestSingers(input: {
  sessionId: string;
  count: number;
}): Promise<{ ok: true; added: string[] } | { ok: false; error: string }> {
  await requireCapability("assignSingers");

  const parsed = AutoAdd.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not do that." };
  }
  const { sessionId, count } = parsed.data;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });
  if (!session) return { ok: false, error: "That session no longer exists." };

  const { getSingerContexts } = await import("@/lib/rosterQueries");
  const { fairestSingers } = await import("@/lib/rosterScoring");

  const existing = await prisma.sessionSlot.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    select: { singerId: true, position: true, singer: { select: { gender: true } } },
  });

  const singers = await getSingerContexts(session.date);
  const picks = fairestSingers(singers, {
    count,
    exclude: new Set(existing.map((e) => e.singerId).filter(Boolean) as string[]),
    // Continue the voice pattern already on the session rather than starting
    // afresh, so topping up does not create a run of three.
    startingGenders: existing.map((e) => e.singer?.gender ?? null),
  });

  if (picks.length === 0) {
    return {
      ok: false,
      error: "Nobody left to add — everybody available is already on this session.",
    };
  }

  await prisma.$transaction(async (tx) => {
    const last = await tx.sessionSlot.findFirst({
      where: { sessionId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    let position = (last?.position ?? 0) + 1;
    for (const pick of picks) {
      await tx.sessionSlot.create({
        data: { sessionId, singerId: pick.singer.id, position },
      });
      position++;
    }
  });

  await notifyAboutSession(sessionId);

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${sessionId}/assign`);

  return { ok: true, added: picks.map((p) => p.singer.name) };
}
