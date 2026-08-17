"use server";

import { prisma } from "@/lib/db";
import { requireGrantedCapability } from "@/lib/auth";
import { defaultStrips } from "@/lib/deskChannels";
import { isChorusColour } from "@/lib/micCushion";
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
  await requireGrantedCapability("manageDesks");

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

  /*
   * The centre's own allocation, then numbered blanks for the rest.
   *
   * The cushions do not move — channel 1 is the blue cushion every week — so a
   * new desk arrives already saying so rather than waiting to be told. Beyond
   * the fixed strips a wrong label gets believed and an empty one gets
   * corrected, so the blanks still say "Channel 12" and nothing more.
   */
  const strips = defaultStrips(parsed.data.channels);
  if (strips.length > 0) {
    await prisma.deskChannel.createMany({
      data: strips.map((sp) => ({
        deskId: desk.id,
        number: Number(sp.number),
        label: sp.label,
        kind: sp.kind,
        colour: sp.colour ?? null,
      })),
    });
  }

  revalidatePath("/admin/desks");
  return ok;
}

/**
 * One strip: what it is called, what it carries, its cushion, and its mic.
 *
 * The CUSHION is why this is granted rather than editor-only. It is the fact
 * the sound person most needs right and most often finds wrong, and making them
 * an editor to fix it was far more power than was meant — see Singer.canRunSound.
 */
export async function updateDeskChannel(input: {
  id: string;
  label: string;
  kind: "vocal" | "instrument" | "track" | "spare";
  colour?: string | null;
  mic?: string | null;
}): Promise<Result> {
  await requireGrantedCapability("manageDesks");

  const parsed = z
    .object({
      id: z.string().min(1),
      label: z.string().trim().min(1).max(60),
      kind: z.enum(["vocal", "instrument", "track", "spare"]),
      // The chorus palette, because it is the one that has all five colours —
      // green included, which is the cushion on channel 3.
      colour: z
        .union([z.string(), z.null()])
        .optional()
        .refine((v) => v === undefined || v === null || isChorusColour(v), "not a cushion"),
      // "Wired", "Pegasus", "WL1", "Rode" — the sound person's own shorthand.
      mic: z.union([z.string().trim().max(40), z.null()]).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that." };

  await prisma.deskChannel.update({
    where: { id: parsed.data.id },
    data: {
      label: parsed.data.label,
      kind: parsed.data.kind,
      // Undefined leaves the column alone; null clears it. The two callers are
      // the label field and the colour dots, and neither should tread on the
      // other's value by not mentioning it.
      ...(parsed.data.colour === undefined
        ? {}
        : { colour: (parsed.data.colour as never) ?? null }),
      ...(parsed.data.mic === undefined
        ? {}
        : { mic: parsed.data.mic?.trim() || null }),
    },
  });

  revalidatePath("/admin/desks");
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
  await requireGrantedCapability("manageDesks");

  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const usedBy = await prisma.session.count({ where: { deskId: parsed.data.id } });
  await prisma.desk.delete({ where: { id: parsed.data.id } });

  revalidatePath("/admin/desks");
  return { ok: true, usedBy };
}
