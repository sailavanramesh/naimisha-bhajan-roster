"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { RepertoireKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Admin edits to allocation data.
 *
 * These deliberately DO write and delete — that is the point of an admin
 * screen. But the blast radius is confined to allocation tables
 * (`InstrumentPerson`, `SingerRepertoire`). Nothing here can reach
 * `SessionSlot`, so no edit made on this screen can destroy a confirmed pitch
 * or a session's history.
 */

const EligibilityUpdate = z.object({
  instrument: z.string().min(1),
  pairs: z.array(z.string()),
});

/**
 * Replace the eligibility list for ONE instrument.
 *
 * Scoped to a single instrument on purpose: a whole-matrix save would let an
 * unrelated rendering bug silently wipe every list at once.
 */
export async function setEligibilityForInstrument(formData: FormData): Promise<void> {
  await requireCapability("manageAllocations");
  const parsed = EligibilityUpdate.safeParse({
    instrument: String(formData.get("instrument") ?? ""),
    pairs: formData.getAll("person").map(String),
  });
  if (!parsed.success) throw new Error("Could not update eligibility.");
  const { instrument, pairs } = parsed.data;

  const wanted = new Set(pairs.map((p) => p.trim()).filter(Boolean));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.instrumentPerson.findMany({ where: { instrument } });
    const have = new Set(existing.map((e) => e.person));

    const toAdd = [...wanted].filter((p) => !have.has(p));
    const toRemove = existing.filter((e) => !wanted.has(e.person));

    if (toAdd.length) {
      await tx.instrumentPerson.createMany({
        data: toAdd.map((person) => ({ instrument, person })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await tx.instrumentPerson.deleteMany({
        where: { id: { in: toRemove.map((r) => r.id) } },
      });
    }
  });

  revalidatePath("/admin");
}

const RepertoireAdd = z.object({
  singerId: z.string().min(1),
  title: z.string().min(1),
  kind: z.nativeEnum(RepertoireKind),
});

export async function addRepertoireEntry(formData: FormData): Promise<void> {
  await requireCapability("manageAllocations");
  const parsed = RepertoireAdd.safeParse({
    singerId: String(formData.get("singerId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    kind: String(formData.get("kind") ?? "known"),
  });
  if (!parsed.success) throw new Error("Could not add: a singer and a bhajan title are required.");
  const { singerId, title, kind } = parsed.data;

  // Resolve to a masterlist bhajan where possible, but keep the entry either
  // way — 10 roster titles do not resolve, and losing them would be worse.
  const bhajan = await prisma.bhajan.findFirst({
    where: { title: { equals: title, mode: "insensitive" } },
    select: { id: true, title: true },
  });

  await prisma.singerRepertoire.upsert({
    where: { singerId_kind_title: { singerId, kind, title: bhajan?.title ?? title } },
    create: { singerId, kind, title: bhajan?.title ?? title, bhajanId: bhajan?.id ?? null },
    update: { bhajanId: bhajan?.id ?? null },
  });

  revalidatePath("/admin");
}

export async function removeRepertoireEntry(formData: FormData): Promise<void> {
  await requireCapability("manageAllocations");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Could not remove: no entry given.");
  await prisma.singerRepertoire.delete({ where: { id } });
  revalidatePath("/admin");
}
