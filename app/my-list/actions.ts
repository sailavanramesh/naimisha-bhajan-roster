"use server";

import { prisma } from "@/lib/db";
import { requireCapability, getSignedInSinger, can, getRole } from "@/lib/auth";
import { RepertoireKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { contradiction, LEARNABLE } from "@/lib/repertoireGuard";
import { z } from "zod";
import { parsePitchLabel } from "@/lib/pitch";

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


const Upsert = z.object({
  // May be empty when signed in: the server fills in who you are.
  singerId: z.string().default(""),
  title: z.string().trim().min(1, "A bhajan is required"),
  kind: z.enum([RepertoireKind.wantToLearn, RepertoireKind.learning, RepertoireKind.known]),
  note: z.string().trim().max(2000).optional(),
  preferredPitch: z.string().trim().max(64).optional(),
});

export type UpsertResult =
  | { ok: true }
  | { ok: false; already: { kind: string; label: string; title: string; preferredPitch: string | null } }
  | { ok: false; sung: { title: string; times: number; lastOn: string | null; pitch: string | null } }
  | { ok: false; error: string };

/**
 * Save an entry on somebody's list.
 *
 * Used for two different intentions, and it now tells them apart:
 *
 *   MOVING an entry between stages, or editing its note and shruti — which is
 *   what the buttons on each entry do, and which always has an existing row.
 *   Allowed, as it always was.
 *
 *   ADDING something new. Guarded, because the caller may not have checked:
 *   the bhajan page and Explore both call this directly, and neither did.
 *
 * `move=1` in the form says the caller means the first, which is how an entry
 * already on the list gets moved rather than refused.
 */
export async function upsertLearning(formData: FormData): Promise<UpsertResult> {
  await requireCapability("manageOwnLearning");

  const parsed = Upsert.safeParse({
    singerId: String(formData.get("singerId") ?? ""),
    title: String(formData.get("title") ?? ""),
    kind: String(formData.get("kind") ?? RepertoireKind.wantToLearn),
    note: String(formData.get("note") ?? ""),
    preferredPitch: String(formData.get("preferredPitch") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not save." };
  }
  const { title, kind, note, preferredPitch } = parsed.data;
  const singerId = await resolveSingerId(parsed.data.singerId);

  /*
   * A move says so. Anything else is an add, and an add is checked — this is
   * the single place all three surfaces pass through.
   */
  const isMove = String(formData.get("move") ?? "") === "1";
  const force = String(formData.get("force") ?? "") === "1";
  if (!isMove && !force) {
    const objection = await contradiction(singerId, title, kind);
    if (objection) return { ok: false, ...objection };
  }

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
  return { ok: true };
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
 *
 * It also refuses to file something they have SUNG under a lesser stage
 * without saying so. Sailavan added a bhajan he had sung twice — at the same
 * shruti both times — and was told only "Added to list", because the list
 * itself happened not to mention it. The roster knew and the list did not, and
 * the app answered from the half that knew less. `force` is how the caller
 * says it meant it.
 */
export async function addToList(input: {
  singerId: string;
  title: string;
  kind: RepertoireKind;
  preferredPitch?: string;
  /** Add it anyway, having been told what the roster says. */
  force?: boolean;
}): Promise<
  | { ok: true; title: string }
  | { ok: false; already: { kind: string; label: string; title: string; preferredPitch: string | null } }
  | { ok: false; sung: { title: string; times: number; lastOn: string | null; pitch: string | null } }
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

  const objection = input.force ? null : await contradiction(singerId, title, kind);
  if (objection) return { ok: false, ...objection };

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

/**
 * Record the pitch a singer has settled on for a bhajan.
 *
 * This is what the pitch finder saves. It is a narrower thing than
 * `upsertLearning`: it changes one field and never moves an entry between
 * kinds, so it does not go through `contradiction` — settling on a pitch says
 * nothing about whether you know the bhajan or are learning it.
 *
 * `preferredPitch` lives only on SingerRepertoire, so saving a pitch does mean
 * having a row. Where none exists one is created as `learning`, which is the
 * honest reading of somebody working out their pitch for it, and the finder
 * says so before saving. Where a row already exists its kind is left alone.
 *
 * The pitch reaches the rosterer on its own: `lib/suggestedPitch.ts` already
 * prefers a list pitch and the roster grid shows it as "saved".
 */
export async function setPreferredPitch(input: {
  singerId: string;
  title: string;
  /** A shruti label, or "" to clear it. */
  pitch: string;
}): Promise<{ ok: true; pitch: string | null; created: boolean } | { ok: false; error: string }> {
  await requireCapability("manageOwnLearning");

  const title = input.title.trim();
  if (!title) return { ok: false, error: "No bhajan given." };

  const pitch = input.pitch.trim();
  // Anything the group actually uses parses; anything else is refused rather
  // than stored, so a typo cannot become somebody's reference pitch.
  if (pitch && !parsePitchLabel(pitch)) {
    return { ok: false, error: `"${pitch}" is not a shruti this app knows.` };
  }

  const singerId = await resolveSingerId(input.singerId);

  const existing = await prisma.singerRepertoire.findFirst({
    where: { singerId, title: { equals: title, mode: "insensitive" } },
    // If they hold it under more than one kind, the one they know wins: that is
    // the entry a rosterer is most likely to be looking at.
    orderBy: { kind: "asc" },
    select: { id: true },
  });

  if (existing) {
    await prisma.singerRepertoire.update({
      where: { id: existing.id },
      data: { preferredPitch: pitch || null },
    });
  } else {
    const bhajan = await prisma.bhajan.findFirst({
      where: { title: { equals: title, mode: "insensitive" } },
      select: { id: true, title: true },
    });
    await prisma.singerRepertoire.create({
      data: {
        singerId,
        kind: RepertoireKind.learning,
        title: bhajan?.title ?? title,
        bhajanId: bhajan?.id ?? null,
        preferredPitch: pitch || null,
      },
    });
  }

  revalidatePath("/my-list");
  revalidatePath("/find-my-pitch");
  revalidatePath(`/singers/${singerId}`);
  return { ok: true, pitch: pitch || null, created: !existing };
}
