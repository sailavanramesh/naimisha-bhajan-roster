"use server";

import { prisma } from "@/lib/db";
import { requireGrantedCapability } from "@/lib/auth";
import { defaultStrips } from "@/lib/deskChannels";
import { isChorusColour } from "@/lib/micCushion";
import { melbourneTodayISO } from "@/lib/dates";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ARCHIVED } from "@/lib/archive";

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
      // INPUTS, not strips: a "20-channel" desk is sixteen faders. See
      // lib/deskChannels.ts defaultStrips.
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
        stereo: sp.stereo ?? false,
      })),
    });
  }

  revalidatePath("/admin/desks");
  return ok;
}


/**
 * Push a desk's strips out to the programmes that have not happened yet.
 *
 * The tension this settles: a programme's channels are a SNAPSHOT, so that a
 * programme from two years ago still says what was on channel 6 after the desk
 * has been re-patched twice. Sailavan, setting one up: "I need to be able to
 * save sound desk settings and it to immediately reflect in the mics and
 * channels area in a program."
 *
 * Both are right, about different programmes. A programme still ahead of us has
 * no history to protect — its channels are a plan, and a plan should follow the
 * desk. One that has already happened is a record, and nothing may rewrite it.
 * So the date decides, and only the future moves.
 *
 * Only what DESCRIBES a strip travels: its label, what it carries, its cushion,
 * its mic, whether it is a pair. Matched on the channel NUMBER. Nothing is
 * deleted and nothing per-item is touched — a strip somebody added to one
 * programme by hand stays, and the open-channel plan hangs off these rows, so
 * re-creating one would take that plan with it.
 */
async function pushDeskToFutureProgrammes(deskId: string): Promise<void> {
  const todayISO = melbourneTodayISO();

  const [desk, sessions] = await Promise.all([
    prisma.desk.findUnique({
      where: { id: deskId },
      select: { channels: { orderBy: { number: "asc" } } },
    }),
    prisma.session.findMany({
      where: {
        ...NOT_ARCHIVED,
        deskId,
        format: "program",
        date: { gte: new Date(`${todayISO}T00:00:00.000Z`) },
      },
      select: { id: true, channels: { select: { id: true, number: true } } },
    }),
  ]);
  if (!desk || sessions.length === 0) return;

  const writes = [];
  for (const session of sessions) {
    const mine = new Map(session.channels.map((c) => [c.number, c.id]));
    for (const c of desk.channels) {
      const fields = {
        label: c.label,
        kind: c.kind,
        colour: c.colour,
        mic: c.mic,
        stereo: c.stereo,
      };
      const existing = mine.get(String(c.number));
      writes.push(
        existing
          ? prisma.sessionChannel.update({ where: { id: existing }, data: fields })
          : prisma.sessionChannel.create({
              data: { sessionId: session.id, number: String(c.number), ...fields },
            }),
      );
    }
  }

  if (writes.length > 0) await prisma.$transaction(writes);
  for (const session of sessions) {
    revalidatePath(`/program/${session.id}`);
    revalidatePath(`/program/${session.id}/desk`);
    revalidatePath(`/program/${session.id}/print`);
  }
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
  stereo?: boolean;
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
      stereo: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that." };

  const channel = await prisma.deskChannel.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      number: true,
      stereo: true,
      deskId: true,
      desk: { select: { monoInputs: true } },
    },
  });
  if (!channel) return { ok: false, error: "That channel is gone." };

  /** Everything except the pairing, which the branches below decide. */
  const fields = {
    label: parsed.data.label,
    kind: parsed.data.kind,
    // Undefined leaves the column alone; null clears it. The callers are the
    // label field, the colour dots and the mic box, and none should tread on
    // another's value by not mentioning it.
    ...(parsed.data.colour === undefined
      ? {}
      : { colour: (parsed.data.colour as never) ?? null }),
    ...(parsed.data.mic === undefined ? {} : { mic: parsed.data.mic?.trim() || null }),
  };

  /*
   * A STEREO STRIP IS ONE FADER OVER TWO INPUTS, so turning one on consumes the
   * input above it. Ticking 19 and then 20 used to make two overlapping pairs —
   * "19/20" and "20/21" — and there is no 21 on a twenty-input desk. Sailavan:
   * "when I mark 19 and 20 as stereo, that means they are together."
   */
  const pairing = parsed.data.stereo === true && !channel.stereo;
  const splitting = parsed.data.stereo === false && channel.stereo;

  if (pairing) {
    if (channel.number <= channel.desk.monoInputs) {
      return {
        ok: false,
        error: `Channels 1 to ${channel.desk.monoInputs} are mono on this desk.`,
      };
    }

    const sibling = await prisma.deskChannel.findFirst({
      where: { deskId: channel.deskId, number: channel.number + 1 },
      select: { id: true, label: true, colour: true, mic: true, kind: true },
    });
    if (!sibling) {
      return {
        ok: false,
        error: `There is no channel ${channel.number + 1} to pair with ${channel.number}.`,
      };
    }

    /*
     * The pair swallows the strip above it, so refuse when that strip carries
     * anything somebody put there. A named channel with a cushion on it is not
     * scaffolding to be deleted on a tick.
     */
    const bare =
      /^channel\s*\d+$/i.test(sibling.label.trim()) &&
      sibling.colour === null &&
      (sibling.mic ?? "").trim().length === 0 &&
      sibling.kind === "spare";
    if (!bare) {
      return {
        ok: false,
        error: `Channel ${channel.number + 1} has its own label. Clear it first, then pair them.`,
      };
    }

    await prisma.$transaction([
      prisma.deskChannel.delete({ where: { id: sibling.id } }),
      prisma.deskChannel.update({
        where: { id: channel.id },
        data: { ...fields, stereo: true },
      }),
    ]);
    await pushDeskToFutureProgrammes(channel.deskId);
    revalidatePath("/admin/desks");
    return ok;
  }

  if (splitting) {
    /*
     * Splitting gives the second input its own strip back — but only if that
     * input exists on the desk.
     *
     * Two guards, and the second one matters because of what the bug left
     * behind: a twenty-input desk where 19 and 20 had each been ticked
     * separately, so 20 claimed to be "20/21". Un-ticking that must not
     * conjure a channel 21 out of the correction. So the desk's highest real
     * input is read from its OTHER strips, and nothing is created past it.
     */
    const others = await prisma.deskChannel.findMany({
      where: { deskId: channel.deskId, id: { not: channel.id } },
      select: { number: true, stereo: true },
    });
    const highestInput = others.reduce((n, c) => Math.max(n, c.number + (c.stereo ? 1 : 0)), 0);

    const taken =
      channel.number + 1 > highestInput
        ? 1
        : await prisma.deskChannel.count({
            where: { deskId: channel.deskId, number: channel.number + 1 },
          });

    await prisma.$transaction([
      prisma.deskChannel.update({
        where: { id: channel.id },
        data: { ...fields, stereo: false },
      }),
      ...(taken === 0
        ? [
            prisma.deskChannel.create({
              data: {
                deskId: channel.deskId,
                number: channel.number + 1,
                label: `Channel ${channel.number + 1}`,
                kind: "spare" as const,
              },
            }),
          ]
        : []),
    ]);
    await pushDeskToFutureProgrammes(channel.deskId);
    revalidatePath("/admin/desks");
    return ok;
  }

  await prisma.deskChannel.update({ where: { id: channel.id }, data: fields });
  await pushDeskToFutureProgrammes(channel.deskId);

  revalidatePath("/admin/desks");
  return ok;
}

/**
 * Drop a strip whose input a stereo pair below it has already claimed.
 *
 * The repair for what the overlapping-pairs bug left behind: a twenty-input desk
 * showing both "19/20" and "20". Input 20 is one socket, so one of those strips
 * has to go, and the pair is the one Sailavan meant to keep.
 *
 * Deliberately NOT a general "delete this channel". It refuses anything that is
 * not overlapped, so it cannot be used to punch a hole in the middle of a desk —
 * a missing strip is worse than a spare one, because the channel then simply is
 * not on the list and nobody can say what is patched into it. The only thing this
 * can do is make the desk describe a desk that exists.
 *
 * See overlappedStrips.
 */
export async function absorbOverlappingStrip(input: {
  id: string;
}): Promise<Result> {
  await requireGrantedCapability("manageDesks");

  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not do that." };

  const channel = await prisma.deskChannel.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, number: true, deskId: true },
  });
  if (!channel) return ok;

  const below = await prisma.deskChannel.findFirst({
    where: { deskId: channel.deskId, number: channel.number - 1, stereo: true },
    select: { number: true },
  });
  if (!below) {
    return {
      ok: false,
      error: `Channel ${channel.number} is a strip of its own — nothing has claimed it.`,
    };
  }

  await prisma.deskChannel.delete({ where: { id: channel.id } });
  await pushDeskToFutureProgrammes(channel.deskId);
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

  const usedBy = await prisma.session.count({ where: { ...NOT_ARCHIVED, deskId: parsed.data.id } });
  await prisma.desk.delete({ where: { id: parsed.data.id } });

  revalidatePath("/admin/desks");
  return { ok: true, usedBy };
}

/**
 * Copy a desk, strips and all.
 *
 * Sailavan: "this allows us to create different versions of the same sound desk
 * if necessary and apply it to different programs." A festival is patched
 * differently from a Thursday on the same hardware — more vocal mics, the
 * keyboard on a pair, the tabla moved — and re-labelling twenty strips before
 * and after is how a desk ends up wrong in the middle.
 *
 * A full copy rather than a layer over the original. The strips of a desk are
 * already the thing a programme snapshots, so a second desk needs no new
 * machinery anywhere — the picker, the snapshot, the propagation and the printed
 * sheet all work on it exactly as they do on the first.
 */
export async function duplicateDesk(input: { id: string; name: string }): Promise<Result> {
  await requireGrantedCapability("manageDesks");

  const parsed = z
    .object({ id: z.string().min(1), name: z.string().trim().min(1).max(60) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the copy a name." };

  const clash = await prisma.desk.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { name: true },
  });
  if (clash) return { ok: false, error: `"${clash.name}" is already there.` };

  const source = await prisma.desk.findUnique({
    where: { id: parsed.data.id },
    include: { channels: { orderBy: { number: "asc" } } },
  });
  if (!source) return { ok: false, error: "That desk is gone." };

  const copy = await prisma.desk.create({
    data: {
      name: parsed.data.name,
      kind: source.kind,
      monoInputs: source.monoInputs,
      // Never the default. The copy is a variant, and the desk programmes reach
      // for first should not change because somebody made one.
      isDefault: false,
    },
    select: { id: true },
  });

  if (source.channels.length > 0) {
    await prisma.deskChannel.createMany({
      data: source.channels.map((c) => ({
        deskId: copy.id,
        number: c.number,
        socket: c.socket,
        label: c.label,
        kind: c.kind,
        colour: c.colour,
        mic: c.mic,
        stereo: c.stereo,
      })),
    });
  }

  revalidatePath("/admin/desks");
  return ok;
}
