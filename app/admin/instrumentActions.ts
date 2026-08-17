"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * The managed list of instruments the centre plays.
 *
 * Free text was the obvious first answer and the wrong one: a program's
 * instruments have to line up with each other year on year to be worth
 * anything, and "Kanjira", "kanjira" and "Ghanjira" typed on three different
 * evenings are three instruments as far as any query is concerned.
 *
 * The awkward part, and the reason these actions are careful: eligibility in
 * `InstrumentPerson` is keyed by instrument NAME, and lib/instrumentScoring.ts
 * scores off those names. So a rename here has to carry those rows with it in
 * the same transaction, and removal is a flag rather than a delete.
 */

const Name = z.string().trim().min(1).max(40);
const Scope = z.enum(["bhajans", "program", "both"]);

type Result = { ok: true } | { ok: false; error: string };

export async function addInstrument(input: {
  name: string;
  scope: "bhajans" | "program" | "both";
}): Promise<Result> {
  await requireCapability("manageAllocations");

  const parsed = z.object({ name: Name, scope: Scope }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give it a name." };

  const existing = await prisma.instrument.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (existing) {
    // Retired rather than absent is the common case here — somebody adding
    // back an instrument that was put away last year.
    if (!existing.active) {
      await prisma.instrument.update({ where: { id: existing.id }, data: { active: true } });
      revalidatePath("/admin");
      return { ok: true };
    }
    return { ok: false, error: `"${existing.name}" is already there.` };
  }

  const last = await prisma.instrument.findFirst({ orderBy: { order: "desc" } });
  await prisma.instrument.create({
    data: { name: parsed.data.name, scope: parsed.data.scope, order: (last?.order ?? -1) + 1 },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Rename an instrument, carrying the eligibility rows with it.
 *
 * Both writes in one transaction. Half of this applied would leave the
 * eligibility lookup pointing at a name no instrument has, and
 * lib/instrumentScoring.ts would quietly score everybody as ineligible for it —
 * a silent failure, which is the worst kind for something nobody looks at
 * directly.
 */
export async function renameInstrument(input: { id: string; name: string }): Promise<Result> {
  await requireCapability("manageAllocations");

  const parsed = z.object({ id: z.string().min(1), name: Name }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give it a name." };

  const instrument = await prisma.instrument.findUnique({ where: { id: parsed.data.id } });
  if (!instrument) return { ok: false, error: "That instrument is gone." };
  if (instrument.name === parsed.data.name) return { ok: true };

  const clash = await prisma.instrument.findFirst({
    where: {
      name: { equals: parsed.data.name, mode: "insensitive" },
      id: { not: parsed.data.id },
    },
  });
  if (clash) return { ok: false, error: `"${clash.name}" is already there.` };

  await prisma.$transaction([
    prisma.instrument.update({ where: { id: parsed.data.id }, data: { name: parsed.data.name } }),
    prisma.instrumentPerson.updateMany({
      where: { instrument: instrument.name },
      data: { instrument: parsed.data.name },
    }),
  ]);

  revalidatePath("/admin");
  return { ok: true };
}

export async function setInstrumentScope(input: {
  id: string;
  scope: "bhajans" | "program" | "both";
}): Promise<Result> {
  await requireCapability("manageAllocations");

  const parsed = z.object({ id: z.string().min(1), scope: Scope }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not change that." };

  await prisma.instrument.update({
    where: { id: parsed.data.id },
    data: { scope: parsed.data.scope },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * How many desk channels this instrument needs.
 *
 * One for nearly everything. A two-headed drum — a dholak, a mridangam, a khol
 * — is miked on each head and takes two, and a stereo keyboard takes two.
 * Building a programme's channel list used to give every instrument one strip,
 * so the mridangam arrived with half a mic and somebody found out on the night.
 *
 * Capped at 8: past that it is not an instrument, it is a drum kit, and whoever
 * is patching that is not going to be helped by a number box.
 */
export async function setInstrumentChannels(input: {
  id: string;
  channels: number;
}): Promise<Result> {
  await requireCapability("manageAllocations");

  const parsed = z
    .object({ id: z.string().min(1), channels: z.number().int().min(1).max(8) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a number of channels." };

  await prisma.instrument.update({
    where: { id: parsed.data.id },
    data: { channels: parsed.data.channels },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Retire an instrument, or bring it back.
 *
 * Never a delete. Past programs record what was actually played on them, and
 * `ProgramItemInstrument` points at this row — deleting it would either fail on
 * the foreign key or, worse, take the history with it. Retiring takes it out of
 * the pickers and leaves every past program saying exactly what it said before.
 */
export async function setInstrumentActive(input: {
  id: string;
  active: boolean;
}): Promise<{ ok: true; usedBy: number } | { ok: false; error: string }> {
  await requireCapability("manageAllocations");

  const parsed = z.object({ id: z.string().min(1), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not change that." };

  const usedBy = await prisma.programItemInstrument.count({
    where: { instrumentId: parsed.data.id },
  });
  await prisma.instrument.update({
    where: { id: parsed.data.id },
    data: { active: parsed.data.active },
  });

  revalidatePath("/admin");
  return { ok: true, usedBy };
}

/** Move one instrument up or down the picker. */
export async function moveInstrument(input: {
  id: string;
  direction: "up" | "down";
}): Promise<Result> {
  await requireCapability("manageAllocations");

  const parsed = z
    .object({ id: z.string().min(1), direction: z.enum(["up", "down"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not move that." };

  const all = await prisma.instrument.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  const index = all.findIndex((i) => i.id === parsed.data.id);
  if (index === -1) return { ok: false, error: "That instrument is gone." };

  const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;
  // Pressing "up" on the first one is an ordinary thing to do, and doing
  // nothing is the right answer to it.
  if (swapWith < 0 || swapWith >= all.length) return { ok: true };

  // Written from the array index rather than the stored order, which may have
  // gaps or ties from earlier edits and cannot be swapped reliably.
  await prisma.$transaction([
    prisma.instrument.update({ where: { id: all[index].id }, data: { order: swapWith } }),
    prisma.instrument.update({ where: { id: all[swapWith].id }, data: { order: index } }),
  ]);

  revalidatePath("/admin");
  return { ok: true };
}
