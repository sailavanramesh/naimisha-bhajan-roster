"use server";

import { prisma } from "@/lib/db";
import { requireCapability, getSignedInSinger, can, getRole } from "@/lib/auth";
import { RepertoireKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * The personal learning list.
 *
 * Whose list a write lands on is decided HERE, not by the form:
 *
 *   - Signed in as a member  -> always your own, whatever the form said.
 *   - Signed in as an editor -> may act on anyone's, since a coordinator
 *                               maintaining the group's lists is the point.
 *   - Not signed in          -> the interim shared-link case: the singer comes
 *                               from the picker, and the page says plainly
 *                               that lists are not private in that mode.
 *
 * Deciding it server-side is what makes "my list" true rather than a label —
 * a member cannot write to somebody else's list by editing the payload.
 */
async function resolveSingerId(requested: string): Promise<string> {
  const signedIn = await getSignedInSinger();
  if (signedIn) {
    if (can(signedIn.role, "assignSingers")) return requested || signedIn.id;
    return signedIn.id;
  }
  const role = await getRole();
  if (can(role, "assignSingers")) return requested;
  // Shared-link member: no identity to enforce, so the picker stands.
  return requested;
}

const LEARNABLE = [
  RepertoireKind.wantToLearn,
  RepertoireKind.learning,
  RepertoireKind.known,
] as const;

const Upsert = z.object({
  // May be empty when signed in: the server fills in who you are.
  singerId: z.string().default(""),
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
  const { title, kind, note, preferredPitch } = parsed.data;
  const singerId = await resolveSingerId(parsed.data.singerId);

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
        // Carried across the delete-and-create. Being a festival bhajan
        // describes the song, so moving it from learning to known must not
        // quietly stop it being one.
        isFestival: existing?.isFestival ?? false,
      },
      update: {
        bhajanId: bhajan?.id ?? null,
        note: note || existing?.note || null,
        preferredPitch: preferredPitch || existing?.preferredPitch || null,
      },
    });
  });

  revalidatePath("/my-list");
  revalidatePath(`/singers/${singerId}`);
}

export async function removeLearning(formData: FormData): Promise<void> {
  await requireCapability("manageOwnLearning");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Nothing to remove.");

  // A signed-in member may only remove from their own list.
  const signedIn = await getSignedInSinger();
  if (signedIn && !can(signedIn.role, "assignSingers")) {
    const row = await prisma.singerRepertoire.findUnique({
      where: { id },
      select: { singerId: true },
    });
    if (!row || row.singerId !== signedIn.id) {
      throw new Error("That entry is not on your list.");
    }
  }

  const gone = await prisma.singerRepertoire.delete({
    where: { id },
    select: { singerId: true },
  });
  revalidatePath("/my-list");
  revalidatePath(`/singers/${gone.singerId}`);
}

const STAGE_LABEL: Record<string, string> = {
  known: "Know it",
  learning: "Learning",
  wantToLearn: "Want to learn",
  festival: "Know it",
};

/**
 * Add a bhajan to a list, refusing one that is already on it.
 *
 * `upsertLearning` deliberately MOVES a bhajan between stages — that is what
 * the three buttons on each entry are for. Adding is a different intention,
 * and treating the two as one thing is how Sailavan came to add a bhajan
 * Ashwin already knows and be told only "Added to list": nothing appeared to
 * happen because, correctly, almost nothing did.
 *
 * The form warns as soon as you pick a bhajan it recognises, but that warning
 * can be walked straight past by typing the whole title and pressing Add —
 * which is exactly what happened. A check in the browser is a courtesy; this
 * is the one that cannot be bypassed.
 *
 * Refusing is not a dead end: the caller is told what stage it is already at,
 * so it can offer to move it as a deliberate second act.
 */
export async function addToList(input: {
  singerId: string;
  title: string;
  kind: RepertoireKind;
  preferredPitch?: string;
}): Promise<
  | { ok: true; title: string }
  | { ok: false; already: { kind: string; label: string; title: string; preferredPitch: string | null } }
  | { ok: false; error: string }
> {
  await requireCapability("manageOwnLearning");

  const parsed = Upsert.safeParse({
    singerId: input.singerId,
    title: input.title,
    kind: input.kind,
    note: "",
    preferredPitch: input.preferredPitch ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not add that." };
  }
  const { title, kind, preferredPitch } = parsed.data;
  const singerId = await resolveSingerId(parsed.data.singerId);

  const bhajan = await prisma.bhajan.findFirst({
    where: { title: { equals: title, mode: "insensitive" } },
    select: { id: true, title: true },
  });
  const resolvedTitle = bhajan?.title ?? title;

  // Matched on the bhajan when it resolves, and on the title when it does not
  // — the same pair the rest of the app treats as "this bhajan for this
  // person".
  const existing = await prisma.singerRepertoire.findFirst({
    where: {
      singerId,
      kind: { in: [...LEARNABLE] },
      ...(bhajan ? { bhajanId: bhajan.id } : { title: { equals: title, mode: "insensitive" } }),
    },
    select: { kind: true, title: true, preferredPitch: true },
  });

  if (existing) {
    return {
      ok: false,
      already: {
        kind: existing.kind,
        label: STAGE_LABEL[existing.kind] ?? existing.kind,
        title: existing.title,
        preferredPitch: existing.preferredPitch,
      },
    };
  }

  await prisma.singerRepertoire.create({
    data: {
      singerId,
      kind,
      title: resolvedTitle,
      bhajanId: bhajan?.id ?? null,
      preferredPitch: preferredPitch || null,
    },
  });

  revalidatePath("/my-list");
  revalidatePath(`/singers/${singerId}`);
  return { ok: true, title: resolvedTitle };
}
