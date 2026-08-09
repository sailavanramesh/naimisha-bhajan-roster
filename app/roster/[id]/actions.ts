"use server";

import { prisma } from "@/lib/db";
import { requireEdit } from "@/lib/requireEdit";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";


/**
 * Note what is absent: `recommendedPitch` and `raga`.
 *
 * Both are derived from the bhajan (CLAUDE.md rule 5) and are no longer stored
 * on the slot. The grid still displays a recommendation; it just computes it
 * rather than round-tripping it. `historicalRecommendedPitch` is historical
 * record and is never written from the UI.
 */
export type SingerRowInput = {
  id?: string | null;
  singerId: string;
  bhajanId: string | null;
  bhajanTitle: string | null;
  festivalBhajanTitle: string | null;
  confirmedPitch: string | null;
  alternativeTablaPitch: string | null;
};

export async function updateSessionNotes(sessionId: string, notes: string) {
  await requireEdit();
  await prisma.session.update({
    where: { id: sessionId },
    data: { notes },
  });
  revalidatePath(`/roster/${sessionId}`);
}

export async function addInstrumentRow(sessionId: string, instrument: string, person: string) {
  await requireEdit();
  const inst = instrument.trim();
  const p = person.trim();

  if (!inst) return;

  await prisma.sessionInstrument.create({
    data: {
      sessionId,
      instrument: inst,
      person: p ? p : null,
    },
  });

  revalidatePath(`/roster/${sessionId}`);
}

export async function deleteInstrumentRow(id: string) {
  await requireEdit();
  const row = await prisma.sessionInstrument.findUnique({ where: { id } });
  if (!row) return;

  await prisma.sessionInstrument.delete({ where: { id } });
  revalidatePath(`/roster/${row.sessionId}`);
}

export async function deleteSingerRow(id: string) {
  await requireEdit();
  const row = await prisma.sessionSlot.findUnique({ where: { id } });
  if (!row) return;

  await prisma.sessionSlot.delete({ where: { id } });
  revalidatePath(`/roster/${row.sessionId}`);
}

export async function upsertSessionSingerRows(sessionId: string, rows: SingerRowInput[]) {
  await requireEdit();
  await prisma.$transaction(async (tx) => {
    const existingIds = rows
      .filter((r) => r.id && !String(r.id).startsWith("new_"))
      .map((r) => r.id as string);

    // `position` is unique per session, and Postgres checks that per statement
    // rather than at commit. Reordering rows in place would therefore collide
    // the moment two rows briefly share a position. Park the surviving rows on
    // negative positions first, then assign the real ones.
    if (existingIds.length > 0) {
      await tx.$executeRaw`
        UPDATE "SessionSlot"
        SET "position" = -"position"
        WHERE "sessionId" = ${sessionId}
          AND "position" > 0
      `;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const isNew = !r.id || String(r.id).startsWith("new_");

      const data = {
        sessionId,
        singerId: r.singerId,
        bhajanId: r.bhajanId,
        bhajanTitle: r.bhajanTitle,
        festivalBhajanTitle: r.festivalBhajanTitle,
        confirmedPitch: r.confirmedPitch,
        alternativeTablaPitch: r.alternativeTablaPitch,
        position: i + 1,
      };

      if (isNew) {
        await tx.sessionSlot.create({ data });
      } else {
        try {
          await tx.sessionSlot.update({
            where: { id: r.id as string },
            data,
          });
        } catch (e) {
          // If the row was deleted in another tab / earlier click, don't crash
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
            continue;
          }
          throw e;
        }
      }
    }

    // Anything still parked was dropped from the grid without going through
    // deleteSingerRow. Give it a real position rather than leaving it negative.
    const stranded = await tx.sessionSlot.findMany({
      where: { sessionId, position: { lt: 0 } },
      orderBy: { position: "desc" },
      select: { id: true },
    });
    let next = rows.length;
    for (const s of stranded) {
      next += 1;
      await tx.sessionSlot.update({ where: { id: s.id }, data: { position: next } });
    }
  });

  revalidatePath(`/roster/${sessionId}`);
}
