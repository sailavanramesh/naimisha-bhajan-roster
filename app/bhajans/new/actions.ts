"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { BhajanOrigin } from "@prisma/client";
import { BHAJANS_TAG } from "@/lib/candidateQueries";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const optional = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v))
  .nullable();

const NewBhajan = z.object({
  title: z.string().trim().min(2, "A title is required"),
  deity: optional,
  language: optional,
  raga: optional,
  beat: optional,
  level: optional,
  tempo: optional,
  referenceGentsPitch: optional,
  referenceLadiesPitch: optional,
  url: optional,
  video: optional,
  audio: optional,
  lyrics: optional,
  meaning: optional,
  originNote: optional,
});

/**
 * Add a bhajan the masterlist does not have.
 *
 * Anything created here is marked `origin: local`, so the group can always
 * tell its own additions from the imported Sai Rhythms masterlist. The
 * imported 3,607 are untouched and keep the default `masterlist`.
 *
 * Deities are normalised into the join table on the way in, the same as the
 * seed does, so a new bhajan is filterable immediately rather than being
 * invisible to the session builder.
 */
export async function createBhajan(formData: FormData): Promise<void> {
  await requireCapability("addBhajan");

  const raw = Object.fromEntries(
    [
      "title", "deity", "language", "raga", "beat", "level", "tempo",
      "referenceGentsPitch", "referenceLadiesPitch", "url", "video", "audio",
      "lyrics", "meaning", "originNote",
    ].map((k) => [k, String(formData.get(k) ?? "")]),
  );

  const parsed = NewBhajan.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Could not add this bhajan.");
  }
  const data = parsed.data;

  const clash = await prisma.bhajan.findFirst({
    where: { title: { equals: data.title, mode: "insensitive" } },
    select: { id: true, title: true },
  });
  if (clash) {
    throw new Error(
      `"${clash.title}" is already in the masterlist. Open it rather than adding a second copy.`,
    );
  }

  const deityNames = (data.deity ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const created = await prisma.$transaction(async (tx) => {
    const bhajan = await tx.bhajan.create({
      data: { ...data, origin: BhajanOrigin.local },
      select: { id: true },
    });

    for (const name of new Set(deityNames)) {
      const deity = await tx.deity.upsert({
        where: { name },
        create: { name },
        update: {},
        select: { id: true },
      });
      await tx.bhajanDeity.create({ data: { bhajanId: bhajan.id, deityId: deity.id } });
    }
    return bhajan;
  });

  revalidatePath("/bhajans");
  // A new bhajan has to appear in the pool, and its deity and language in the
  // filter chips. Both read the masterlist from a cache.
  revalidateTag(BHAJANS_TAG);
  redirect(`/bhajans/${created.id}`);
}
