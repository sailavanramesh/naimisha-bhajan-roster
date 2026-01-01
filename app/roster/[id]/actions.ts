"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";


export type SingerRowInput = {
  id?: string | null;
  singerId: string;
  bhajanId: string | null;
  bhajanTitle: string | null;
  festivalBhajanTitle: string | null;
  confirmedPitch: string | null;
  alternativeTablaPitch: string | null;
  recommendedPitch: string | null;
  raga: string | null;
};

export async function updateSessionNotes(sessionId: string, notes: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { notes },
  });
  revalidatePath(`/roster/${sessionId}`);
}

export async function addInstrumentRow(sessionId: string, instrument: string, person: string) {
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
  const row = await prisma.sessionInstrument.findUnique({ where: { id } });
  if (!row) return;

  await prisma.sessionInstrument.delete({ where: { id } });
  revalidatePath(`/roster/${row.sessionId}`);
}

export async function deleteSingerRow(id: string) {
  const row = await prisma.sessionSinger.findUnique({ where: { id } });
  if (!row) return;

  await prisma.sessionSinger.delete({ where: { id } });
  revalidatePath(`/roster/${row.sessionId}`);
}

export async function upsertSessionSingerRows(sessionId: string, rows: SingerRowInput[]) {
  await prisma.$transaction(async (tx) => {
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
        recommendedPitch: r.recommendedPitch,
        raga: r.raga,
        slot: i + 1,
      };

      if (isNew) {
        await tx.sessionSinger.create({ data });
      } else {
        try {
          await tx.sessionSinger.update({
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
  });

  revalidatePath(`/roster/${sessionId}`);
}
