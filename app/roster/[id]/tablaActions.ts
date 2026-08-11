"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCapability, getSignedInSinger } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { NOTE_NAMES } from "@/lib/pitch";
import { overrideKey, ASHRAM_TABLAS } from "@/lib/tablaPlan";

const SetOverride = z.object({
  sessionId: z.string().min(1),
  raga: z.string(),
  sa: z.number().int().min(0).max(11),
  /** "" clears the override; "none" records "nothing fits" as a decision. */
  note: z.string(),
  scope: z.enum(["raga", "any"]),
});

/**
 * Record a coordinator's decision about which tabla to tune.
 *
 * Keyed on (raga, Sa) so it sticks and applies to every future bhajan in that
 * raga at that pitch — the rule's inputs are exactly those two things, so
 * correcting the answer once corrects it everywhere it would recur.
 *
 * `scope: "any"` writes it against every raga at this Sa, for the cases where
 * the pitch alone decides it.
 *
 * Deliberately NOT keyed on the bhajan. Two bhajans in the same raga at the
 * same pitch need the same drum; keying per song would make a coordinator
 * answer the same question repeatedly and let the answers drift apart.
 */
export async function setTablaOverride(input: {
  sessionId: string;
  raga: string | null;
  sa: number;
  note: string;
  scope: "raga" | "any";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("editConfirmedPitch");

  const parsed = SetOverride.safeParse({
    sessionId: input.sessionId,
    raga: input.raga ?? "",
    sa: input.sa,
    note: input.note,
    scope: input.scope,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not save that." };
  }
  const { sessionId, sa, note, scope } = parsed.data;
  const key = scope === "any" ? "" : overrideKey(parsed.data.raga);

  if (note !== "" && note !== "none" && !ASHRAM_TABLAS.includes(note as never)) {
    return { ok: false, error: `The ashram has no ${note} tabla.` };
  }

  const who = await getSignedInSinger();

  if (note === "") {
    // Clearing: back to whatever the rule works out.
    await prisma.tablaOverride.deleteMany({ where: { raga: key, sa } });
  } else {
    const value = note === "none" ? null : note;
    await prisma.tablaOverride.upsert({
      where: { raga_sa: { raga: key, sa } },
      create: { raga: key, sa, note: value, setByName: who?.name ?? null },
      update: { note: value, setByName: who?.name ?? null },
    });
  }

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${sessionId}/live`);
  return { ok: true };
}

/** For the UI: the note name of a pitch class. */
export async function noteNameFor(sa: number): Promise<string> {
  return NOTE_NAMES[((sa % 12) + 12) % 12];
}
