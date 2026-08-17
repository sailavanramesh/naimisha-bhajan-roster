"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * The archive — putting a session back, or finally letting it go.
 *
 * OWNER ONLY, both of them. An editor archives; an owner decides. Sailavan
 * asked for the archive as "a fallback in case some accidental mistakes have
 * been made", and a fallback the person who made the mistake can clear out in
 * the same breath is not one.
 */

type Result = { ok: true } | { ok: false; error: string };

const Id = z.string().min(1);

function refresh(sessionId: string) {
  revalidatePath("/admin/archive");
  revalidatePath("/roster");
  revalidatePath("/program");
  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/program/${sessionId}`);
}

/** Put it back. Everything on it comes back with it — nothing was ever removed. */
export async function restoreSession(input: { id: string }): Promise<Result> {
  try {
    await requireCapability("manageArchive");
    const id = Id.parse(input.id);

    const session = await prisma.session.findUnique({
      where: { id },
      select: { archivedAt: true },
    });
    if (!session) return { ok: false, error: "That session is gone." };
    if (!session.archivedAt) return { ok: false, error: "That session is not archived." };

    await prisma.session.update({
      where: { id },
      data: { archivedAt: null, archivedBy: null },
    });

    refresh(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Gone for good.
 *
 * THIS IS WHERE THE CONFIRMED-PITCH REFUSAL LIVES NOW. It used to guard the
 * delete button, which no longer loses anything; here it is the last door, and
 * what is behind it is the one genuinely irreplaceable thing in this app —
 * SessionSlot.confirmedPitch, what a singer actually sang, at what shruti,
 * which exists nowhere else (CLAUDE.md).
 *
 * An owner who really means it clears those rows first, deliberately, on a
 * restored session. That is several steps, and it should be.
 *
 * Everything else cascades: slots without pitches, instruments, notices,
 * per-session notification rules. Those are all plans or bookkeeping.
 */
export async function purgeSession(input: { id: string }): Promise<Result> {
  try {
    await requireCapability("manageArchive");
    const id = Id.parse(input.id);

    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        archivedAt: true,
        slots: { select: { confirmedPitch: true, singer: { select: { name: true } } } },
      },
    });
    if (!session) return { ok: false, error: "That session is already gone." };
    // Only from the archive. Nothing should be able to delete a live session
    // outright, however it got here.
    if (!session.archivedAt) {
      return { ok: false, error: "Archive it first — a live session cannot be deleted outright." };
    }

    const withPitch = session.slots.filter((s) => s.confirmedPitch);
    if (withPitch.length > 0) {
      const names = [...new Set(withPitch.map((s) => s.singer?.name).filter(Boolean))];
      return {
        ok: false,
        error:
          `This session has ${withPitch.length} confirmed pitch${withPitch.length === 1 ? "" : "es"} on it` +
          `${names.length ? ` (${names.join(", ")})` : ""} — that is a record of what was actually sung, ` +
          `and it exists nowhere else. Restore it and clear those rows first if you really mean to lose it.`,
      };
    }

    await prisma.session.delete({ where: { id } });

    refresh(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function message(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "That is not valid.";
  return e instanceof Error ? e.message : "That did not work.";
}
