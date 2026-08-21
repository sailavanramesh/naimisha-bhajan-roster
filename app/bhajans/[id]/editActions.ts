"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability, getSignedInSinger } from "@/lib/auth";
import { cleanFieldValue, hasChanged, isEditableField, fieldLabel } from "@/lib/bhajanFields";
import { BHAJANS_TAG } from "@/lib/candidateQueries";

/**
 * Correct a bhajan, and remember that it was corrected.
 *
 * The masterlist is a copy of somebody else's spreadsheet and the group has
 * always had corrections to make to it — a wrong raga, a missing pitch. Until
 * now the only way to fix one was to edit the source and re-seed, which is
 * exactly what the "never re-seed" rule forbids.
 *
 * Every changed field writes a BhajanFieldEdit the first time it changes,
 * holding what the MASTERLIST said — not what it said a moment ago. Correcting
 * a correction therefore does not lose the original, which is the whole point:
 * the group needs to be able to see that a value is theirs and what it
 * replaced.
 *
 * The field names come from the browser, so they are checked against a
 * whitelist (lib/bhajanFields.ts) before going anywhere near an update.
 */
export async function updateBhajanFields(input: {
  bhajanId: string;
  /** Field name → new value as typed. */
  patch: Record<string, string>;
}): Promise<{ ok: true; changed: string[] } | { ok: false; error: string }> {
  await requireCapability("addBhajan");

  const { bhajanId, patch } = input;
  if (!bhajanId) return { ok: false, error: "No bhajan." };

  const names = Object.keys(patch).filter(isEditableField);
  if (names.length === 0) return { ok: true, changed: [] };

  const before = (await prisma.bhajan.findUnique({
    where: { id: bhajanId },
    select: Object.fromEntries(names.map((n) => [n, true])) as Record<string, true>,
  })) as Record<string, string | null> | null;
  if (!before) return { ok: false, error: "No such bhajan." };

  const data: Record<string, string | null> = {};
  const changed: string[] = [];
  for (const name of names) {
    const after = cleanFieldValue(patch[name]);
    if (!hasChanged(before[name] ?? null, after)) continue;
    if (name === "title" && after === null) {
      return { ok: false, error: "A bhajan needs a title." };
    }
    data[name] = after;
    changed.push(name);
  }
  if (changed.length === 0) return { ok: true, changed: [] };

  const me = await getSignedInSinger();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bhajan.update({ where: { id: bhajanId }, data });

      for (const field of changed) {
        // createMany + skipDuplicates so the FIRST edit records the source and
        // later ones leave it alone. An update would overwrite the masterlist's
        // value with the group's own previous correction.
        await tx.bhajanFieldEdit.createMany({
          data: [{ bhajanId, field, sourceValue: before[field] ?? null, editedBy: me?.name ?? null }],
          skipDuplicates: true,
        });
        await tx.bhajanFieldEdit.updateMany({
          where: { bhajanId, field },
          data: { editedBy: me?.name ?? null },
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Another bhajan already has that title." };
    }
    console.error("updateBhajanFields failed", e);
    return { ok: false, error: "Could not save that." };
  }

  revalidatePath(`/bhajans/${bhajanId}`);
  revalidatePath("/bhajans");
  // A corrected raga or language changes the pool and the filter chips on
  // /build and /explore, which read the masterlist from a cache.
  revalidateTag(BHAJANS_TAG);
  return { ok: true, changed: changed.map(fieldLabel) };
}

/**
 * Put a field back to what the masterlist said.
 *
 * The counterpart of the above, and the reason the source value is kept at
 * all: a correction that turns out to be wrong should not need somebody to
 * remember what was there before.
 */
export async function revertBhajanField(input: {
  bhajanId: string;
  field: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("addBhajan");
  if (!isEditableField(input.field)) return { ok: false, error: "Not an editable field." };

  const edit = await prisma.bhajanFieldEdit.findUnique({
    where: { bhajanId_field: { bhajanId: input.bhajanId, field: input.field } },
    select: { sourceValue: true },
  });
  if (!edit) return { ok: false, error: "That field has not been changed." };

  if (input.field === "title" && edit.sourceValue === null) {
    return { ok: false, error: "The masterlist has no title to go back to." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.bhajan.update({
      where: { id: input.bhajanId },
      data: { [input.field]: edit.sourceValue },
    });
    await tx.bhajanFieldEdit.delete({
      where: { bhajanId_field: { bhajanId: input.bhajanId, field: input.field } },
    });
  });

  revalidatePath(`/bhajans/${input.bhajanId}`);
  revalidateTag(BHAJANS_TAG);
  return { ok: true };
}
