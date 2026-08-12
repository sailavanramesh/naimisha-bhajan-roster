"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const CopyRows = z.object({
  sessionId: z.string().min(1),
  slotIds: z.array(z.string().min(1)).min(1, "pick at least one row"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date"),
  withPitch: z.boolean(),
});

/**
 * Copy chosen rows onto another day.
 *
 * One mechanism for every case Sailavan asked about — a whole session, one row,
 * or a few — because "copy the session" is just "select all and copy". A
 * separate duplicate-session feature would be the same code with a second set
 * of edge cases.
 *
 * APPENDS. Nothing on the target day is touched, ever. If a session is already
 * there the copies land after it, so a mistaken copy is something you delete
 * rather than something you have to reconstruct.
 *
 * What travels: the singer and the bhajan, and optionally the confirmed pitch.
 *
 * What does not, and why:
 *   historicalRecommendedPitch  the source sheet's record for one specific
 *                               historical row. On a new row it would be a
 *                               claim about a session that never happened, and
 *                               it is what the Phase 0 gate measures against.
 *   alternativeTablaPitch       derived from the pitch; recomputed on read.
 *   mic cushions                live state for one particular evening.
 *
 * The pitch is optional because copying forward asserts a pitch nobody has sung
 * yet. That is now safe to carry — profiles only count sessions up to today
 * (lib/dates.ts historyCutoff) — but it is still a prediction until the evening
 * happens, so it is the caller's choice rather than an assumption.
 */
export async function copyRowsToDate(input: {
  sessionId: string;
  slotIds: string[];
  date: string;
  withPitch: boolean;
}): Promise<{ ok: true; copied: number; targetId: string } | { ok: false; error: string }> {
  await requireCapability("editSlotBhajan");

  const parsed = CopyRows.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not copy those." };
  }
  const { sessionId, slotIds, date, withPitch } = parsed.data;

  const day = new Date(`${date}T00:00:00.000Z`);

  const rows = await prisma.sessionSlot.findMany({
    where: { id: { in: slotIds }, sessionId },
    orderBy: { position: "asc" },
    select: {
      singerId: true,
      bhajanId: true,
      bhajanTitle: true,
      festivalBhajanTitle: true,
      inputOnlyCustomBhajan: true,
      confirmedPitch: true,
      alternativeTablaPitch: true,
      session: { select: { date: true } },
    },
  });
  if (rows.length === 0) return { ok: false, error: "Those rows are no longer on this session." };

  if (rows[0].session.date.getTime() === day.getTime()) {
    return { ok: false, error: "That is the same day. Pick a different date." };
  }

  const targetId = await prisma.$transaction(async (tx) => {
    // The earliest session that day. A day may hold more than one now, and
    // "copy these rows to Sunday" means the first one unless somebody says
    // otherwise.
    const existing = await tx.session.findFirst({
      where: { date: day },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const target = existing ?? (await tx.session.create({ data: { date: day }, select: { id: true } }));

    const last = await tx.sessionSlot.findFirst({
      where: { sessionId: target.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    let position = (last?.position ?? 0) + 1;

    for (const r of rows) {
      await tx.sessionSlot.create({
        data: {
          sessionId: target.id,
          singerId: r.singerId,
          bhajanId: r.bhajanId,
          bhajanTitle: r.bhajanTitle,
          festivalBhajanTitle: r.festivalBhajanTitle,
          inputOnlyCustomBhajan: r.inputOnlyCustomBhajan,
          confirmedPitch: withPitch ? r.confirmedPitch : null,
          alternativeTablaPitch: withPitch ? r.alternativeTablaPitch : null,
          position,
        },
      });
      position++;
    }

    return target.id;
  });

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${targetId}`);
  revalidatePath("/roster");

  return { ok: true, copied: rows.length, targetId };
}
