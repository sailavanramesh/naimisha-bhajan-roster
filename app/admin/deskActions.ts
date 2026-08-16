"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { blankStrips } from "@/lib/deskChannels";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * The desks the centre mixes on, and the strips printed on them.
 *
 * A template. A programme copies these when it picks a desk and edits its own
 * copy from then on, so nothing here can rewrite what a past programme says.
 */

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };

export async function addDesk(input: {
  name: string;
  kind: "analog" | "digital";
  channels: number;
}): Promise<Result> {
  await requireCapability("manageAllocations");

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(60),
      kind: z.enum(["analog", "digital"]),
      channels: z.number().int().min(0).max(64),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the desk a name." };

  const clash = await prisma.desk.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { name: true },
  });
  if (clash) return { ok: false, error: `"${clash.name}" is already there.` };

  const count = await prisma.desk.count();
  const desk = await prisma.desk.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      // The first desk added is the one programmes offer first.
      isDefault: count === 0,
    },
    select: { id: true },
  });

  // Numbered, unlabelled strips. A wrong label gets believed; an empty one
  // gets corrected, so the blanks say "Channel 4" and nothing more.
  const strips = blankStrips(parsed.data.channels);
  if (strips.length > 0) {
    await prisma.deskChannel.createMany({
      data: strips.map((sp) => ({
        deskId: desk.id,
        number: Number(sp.number),
        label: sp.label,
        kind: sp.kind,
      })),
    });
  }

  revalidatePath("/admin");
  return ok;
}

export async function updateDeskChannel(input: {
  id: string;
  label: string;
  kind: "vocal" | "instrument" | "track" | "spare";
}): Promise<Result> {
  await requireCapability("manageAllocations");

  const parsed = z
    .object({
      id: z.string().min(1),
      label: z.string().trim().min(1).max(60),
      kind: z.enum(["vocal", "instrument", "track", "spare"]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that." };

  await prisma.deskChannel.update({
    where: { id: parsed.data.id },
    data: { label: parsed.data.label, kind: parsed.data.kind },
  });

  revalidatePath("/admin");
  return ok;
}

/**
 * Remove a desk.
 *
 * Its programmes keep their channels — those are copies, and the relation is
 * SetNull — so this loses the template and nothing else.
 */
export async function removeDesk(input: {
  id: string;
}): Promise<{ ok: true; usedBy: number } | { ok: false; error: string }> {
  await requireCapability("manageAllocations");

  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const usedBy = await prisma.session.count({ where: { deskId: parsed.data.id } });
  await prisma.desk.delete({ where: { id: parsed.data.id } });

  revalidatePath("/admin");
  return { ok: true, usedBy };
}
