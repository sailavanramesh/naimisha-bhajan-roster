"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { RepertoireKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * The personal learning list.
 *
 * INTERIM: the singer is chosen from a picker, because roles currently come
 * from a shared access link and the app cannot yet tell two members apart.
 * Once Google sign-in lands (SPEC §9.5) the singer comes from the session and
 * these actions stop taking a singerId at all — that is the only change
 * needed, which is why the list is keyed on Singer rather than on a device.
 */

const LEARNABLE = [
  RepertoireKind.wantToLearn,
  RepertoireKind.learning,
  RepertoireKind.known,
] as const;

const Upsert = z.object({
  singerId: z.string().min(1, "Choose who this is for"),
  title: z.string().trim().min(1, "A bhajan is required"),
  kind: z.enum([RepertoireKind.wantToLearn, RepertoireKind.learning, RepertoireKind.known]),
  note: z.string().trim().max(2000).optional(),
  preferredPitch: z.string().trim().max(64).optional(),
});

export async function upsertLearning(formData: FormData): Promise<void> {
  await requireCapability("manageOwnLearning");

  const parsed = Upsert.safeParse({
    singerId: String(formData.get("singerId") ?? ""),
    title: String(formData.get("title") ?? ""),
    kind: String(formData.get("kind") ?? RepertoireKind.wantToLearn),
    note: String(formData.get("note") ?? ""),
    preferredPitch: String(formData.get("preferredPitch") ?? ""),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Could not save.");
  const { singerId, title, kind, note, preferredPitch } = parsed.data;

  const bhajan = await prisma.bhajan.findFirst({
    where: { title: { equals: title, mode: "insensitive" } },
    select: { id: true, title: true },
  });

  /*
   * The unique key is (singerId, kind, title), so moving a bhajan along the
   * list is a DELETE of the old kind plus a create — not an update. Doing it
   * in a transaction keeps a singer from briefly holding the same bhajan twice.
   */
  await prisma.$transaction(async (tx) => {
    const existing = await tx.singerRepertoire.findFirst({
      where: { singerId, title: bhajan?.title ?? title, kind: { in: [...LEARNABLE] } },
    });
    if (existing && existing.kind !== kind) {
      await tx.singerRepertoire.delete({ where: { id: existing.id } });
    }
    await tx.singerRepertoire.upsert({
      where: { singerId_kind_title: { singerId, kind, title: bhajan?.title ?? title } },
      create: {
        singerId,
        kind,
        title: bhajan?.title ?? title,
        bhajanId: bhajan?.id ?? null,
        note: note || null,
        preferredPitch: preferredPitch || null,
      },
      update: {
        bhajanId: bhajan?.id ?? null,
        note: note || existing?.note || null,
        preferredPitch: preferredPitch || existing?.preferredPitch || null,
      },
    });
  });

  revalidatePath("/my-list");
}

export async function removeLearning(formData: FormData): Promise<void> {
  await requireCapability("manageOwnLearning");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Nothing to remove.");
  await prisma.singerRepertoire.delete({ where: { id } });
  revalidatePath("/my-list");
}
