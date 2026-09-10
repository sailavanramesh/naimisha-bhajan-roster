"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCapability, getSignedInSinger } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { NOTE_NAMES } from "@/lib/pitch";
import { overrideKey, ASHRAM_TABLAS, isDegreeKey, DEGREE_PREFERENCE } from "@/lib/tabla";

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

const SetRagaRule = z.object({
  sessionId: z.string().min(1),
  raga: z.string().min(1),
  /** A DegreeKey, or "" to drop the rule and go back to the standard order. */
  degree: z.string(),
});

/**
 * Record that a RAGA prefers a particular degree, at every pitch.
 *
 * The thing an override cannot be. Sailavan, 2026-09-10: a correction should be
 * "not just remembering it for that pitch and that raag, but almost for that
 * raag" — and that is only expressible as a degree, because the drum changes
 * with Sa while the degree does not. The fifth of G is D; the fifth of F is C;
 * one rule, two answers.
 *
 * It REORDERS, never adds: `orderedDegrees` in lib/tabla.ts pulls the degree to
 * the front of the standard order and the raga's own notes are still checked,
 * so a rule asking for a Pa in Malkauns quietly does nothing. A preference is
 * not allowed to overrule the music.
 *
 * Same capability as the per-pitch override — whoever may set a confirmed pitch
 * may say what the tabla does with it.
 */
export async function setTablaRagaRule(input: {
  sessionId: string;
  raga: string;
  degree: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("editConfirmedPitch");

  const parsed = SetRagaRule.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that." };
  const { sessionId, degree } = parsed.data;

  const key = overrideKey(parsed.data.raga);
  if (!key) return { ok: false, error: "That bhajan has no raga recorded, so there is nothing to key a rule to." };

  if (degree !== "" && !isDegreeKey(degree)) {
    const known = DEGREE_PREFERENCE.map((d) => d.key).join(", ");
    return { ok: false, error: `Not a degree the rule knows (${known}).` };
  }

  const who = await getSignedInSinger();

  if (degree === "") {
    await prisma.tablaRagaRule.deleteMany({ where: { raga: key } });
  } else {
    await prisma.tablaRagaRule.upsert({
      where: { raga: key },
      create: { raga: key, degree, setByName: who?.name ?? null },
      update: { degree, setByName: who?.name ?? null },
    });
  }

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${sessionId}/live`);
  return { ok: true };
}
