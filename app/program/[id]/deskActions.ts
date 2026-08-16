"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { isChorusColour, type MicColourValue } from "@/lib/micCushion";
import { proposeChannels, proposeOpenChannels } from "@/lib/deskChannels";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * A programme's channel list, and which channels are open on each item.
 *
 * The channels are a SNAPSHOT. Picking a desk copies its strips onto the
 * session and everything after that edits the copy — so tidying the desk
 * template next year cannot rewrite what a programme two years ago says was on
 * channel 6. A programme is a record of an evening.
 */

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };

const Id = z.string().min(1);
const Text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s));

async function refresh(sessionId: string) {
  revalidatePath(`/program/${sessionId}`);
  revalidatePath(`/program/${sessionId}/print`);
  revalidatePath(`/program/${sessionId}/desk`);
}

/**
 * Move the programme on to another item.
 *
 * Gated on `setMicCushion`, not `editPrograms`, and the difference is the whole
 * point. Deciding the running order is an editor's job; saying which item the
 * room is on right now is live desk state, done mid-performance by whoever is
 * standing at the desk — the same reasoning that lets any signed-in person move
 * a mic cushion. Somebody trusted to run the sound is not thereby trusted to
 * rewrite the programme, and does not need to be.
 *
 * Writes a POSITION and does not check it names an item, deliberately: the
 * caller has just derived it with `stepItem`, and `currentItemOf` clamps on the
 * way back out, so an item deleted between the press and the write lands
 * somewhere sensible instead of failing in front of an audience.
 */
export async function setCurrentItem(input: {
  sessionId: string;
  position: number | null;
}): Promise<Result> {
  await requireCapability("setMicCushion");

  const parsed = z
    .object({
      sessionId: Id,
      // Bounded so a malformed client cannot store something that reads as a
      // position but is not one. Null is "we have not begun".
      position: z.union([z.number().int().min(1).max(500), z.null()]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an item." };

  const session = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
    select: { id: true, format: true },
  });
  if (!session) return { ok: false, error: "That programme is gone." };
  if (session.format !== "program") return { ok: false, error: "That is not a programme." };

  await prisma.session.update({
    where: { id: session.id },
    data: { currentItemPosition: parsed.data.position },
  });

  /*
   * The session row's own updatedAt moves with this write, which is what the
   * version stamp other devices poll is built on — so pressing Next here is
   * what puts every other screen on the same item.
   */
  await refresh(session.id);
  return ok;
}

/**
 * Put a programme on a desk, copying that desk's strips onto it.
 *
 * NOT named `useDesk`: a `use` prefix makes React's rules-of-hooks lint treat a
 * plain function as a hook, and it is right to — anybody reading a call to
 * `useDesk()` inside a click handler would think the same thing.
 *
 * Refuses when the programme already has channels rather than merging or
 * replacing: the channels may have been edited for hours, and there is no
 * reading of "pick a desk" that is worth losing that to. Clearing them is a
 * separate, deliberate act.
 */
export async function applyDesk(input: { sessionId: string; deskId: string }): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ sessionId: Id, deskId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a desk." };

  const [session, desk, existing] = await Promise.all([
    prisma.session.findUnique({
      where: { id: parsed.data.sessionId },
      select: { format: true },
    }),
    prisma.desk.findUnique({
      where: { id: parsed.data.deskId },
      include: { channels: { orderBy: { number: "asc" } } },
    }),
    prisma.sessionChannel.count({ where: { sessionId: parsed.data.sessionId } }),
  ]);

  if (!session) return { ok: false, error: "That programme is gone." };
  if (session.format !== "program") return { ok: false, error: "That is not a music programme." };
  if (!desk) return { ok: false, error: "That desk is gone." };
  if (existing > 0) {
    return {
      ok: false,
      error: "This programme already has channels. Clear them first if you mean to start again.",
    };
  }

  await prisma.$transaction([
    prisma.session.update({
      where: { id: parsed.data.sessionId },
      data: { deskId: parsed.data.deskId },
    }),
    prisma.sessionChannel.createMany({
      data: desk.channels.map((c) => ({
        sessionId: parsed.data.sessionId,
        number: String(c.number),
        label: c.label,
        kind: c.kind,
        colour: c.colour,
      })),
    }),
  ]);

  await refresh(parsed.data.sessionId);
  return ok;
}

/**
 * Propose a channel list from everybody actually in the programme.
 *
 * The reason any of this beats paper: the app knows who sings each item and
 * what plays on it. Adds only what is missing, so it can be run again after
 * more items are added without disturbing a channel somebody has already
 * labelled by hand.
 */
export async function suggestChannels(input: {
  sessionId: string;
}): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  await requireCapability("editPrograms");

  const parsed = z.object({ sessionId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not do that." };

  const [items, singers, instruments, existing] = await Promise.all([
    prisma.programItem.findMany({
      where: { sessionId: parsed.data.sessionId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        performers: { select: { singerId: true, name: true } },
        instruments: { select: { instrumentId: true, singerId: true, person: true } },
      },
    }),
    prisma.singer.findMany({ select: { id: true, name: true } }),
    prisma.instrument.findMany({ select: { id: true, name: true } }),
    prisma.sessionChannel.findMany({
      where: { sessionId: parsed.data.sessionId },
      select: { number: true, singerId: true, person: true, instrumentId: true },
    }),
  ]);

  const singerName = new Map(singers.map((s) => [s.id, s.name]));
  const instrumentName = new Map(instruments.map((i) => [i.id, i.name]));

  const proposed = proposeChannels(
    items.map((i) => ({
      itemId: i.id,
      performers: i.performers,
      instruments: i.instruments,
    })),
    {
      singerName: (id) => singerName.get(id),
      instrumentName: (id) => instrumentName.get(id),
    },
  );

  const haveSinger = new Set(existing.map((c) => c.singerId).filter(Boolean));
  const havePerson = new Set(
    existing.map((c) => (c.person ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const haveInstrument = new Set(existing.map((c) => c.instrumentId).filter(Boolean));
  const usedNumbers = new Set(existing.map((c) => c.number));

  const missing = proposed.filter((c) => {
    if (c.singerId) return !haveSinger.has(c.singerId);
    if (c.person) return !havePerson.has(c.person.trim().toLowerCase());
    if (c.instrumentId) return !haveInstrument.has(c.instrumentId);
    return false;
  });
  if (missing.length === 0) return { ok: true, added: 0 };

  // Carry on from the highest number already used rather than from 1, so
  // running this twice does not collide with the first run.
  let next = 1;
  const nextFree = () => {
    while (usedNumbers.has(String(next))) next++;
    usedNumbers.add(String(next));
    return String(next);
  };

  await prisma.sessionChannel.createMany({
    data: missing.map((c) => ({
      sessionId: parsed.data.sessionId,
      number: nextFree(),
      label: c.label,
      kind: c.kind,
      singerId: c.singerId ?? null,
      person: c.person ?? null,
      instrumentId: c.instrumentId ?? null,
    })),
  });

  await refresh(parsed.data.sessionId);
  return { ok: true, added: missing.length };
}

export async function addChannel(input: {
  sessionId: string;
  number: string;
  label: string;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({ sessionId: Id, number: z.string().trim().min(1).max(8), label: Text(60) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give it a number." };

  const clash = await prisma.sessionChannel.findFirst({
    where: { sessionId: parsed.data.sessionId, number: parsed.data.number },
    select: { id: true },
  });
  if (clash) return { ok: false, error: `Channel ${parsed.data.number} is already there.` };

  await prisma.sessionChannel.create({
    data: {
      sessionId: parsed.data.sessionId,
      number: parsed.data.number,
      label: parsed.data.label ?? `Channel ${parsed.data.number}`,
      kind: "spare",
    },
  });

  await refresh(parsed.data.sessionId);
  return ok;
}

export async function updateChannel(input: {
  id: string;
  label: string;
  kind: "vocal" | "instrument" | "track" | "spare";
  singerId: string;
  person: string;
  colour: string | null;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({
      id: Id,
      label: z.string().trim().min(1).max(60),
      kind: z.enum(["vocal", "instrument", "track", "spare"]),
      singerId: Text(60),
      person: Text(80),
      colour: z
        .union([z.string(), z.null()])
        .refine((v) => v === null || v === "" || isChorusColour(v), "not a cushion colour"),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that channel." };

  const channel = await prisma.sessionChannel.findUnique({
    where: { id: parsed.data.id },
    select: { sessionId: true },
  });
  if (!channel) return { ok: false, error: "That channel is gone." };

  await prisma.sessionChannel.update({
    where: { id: parsed.data.id },
    data: {
      label: parsed.data.label,
      kind: parsed.data.kind,
      singerId: parsed.data.singerId,
      // A singer carries their own name; storing it twice lets the two disagree.
      person: parsed.data.singerId ? null : parsed.data.person,
      colour: parsed.data.colour ? (parsed.data.colour as MicColourValue) : null,
    },
  });

  await refresh(channel.sessionId);
  return ok;
}

export async function removeChannel(input: { id: string }): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const channel = await prisma.sessionChannel.findUnique({
    where: { id: parsed.data.id },
    select: { sessionId: true },
  });
  if (!channel) return ok;

  await prisma.sessionChannel.delete({ where: { id: parsed.data.id } });
  await refresh(channel.sessionId);
  return ok;
}

/** Open or close one channel on one item. The grid's only write. */
export async function setChannelOpen(input: {
  itemId: string;
  channelId: string;
  open: boolean;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z
    .object({ itemId: Id, channelId: Id, open: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not change that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { sessionId: true },
  });
  if (!item) return { ok: false, error: "That item is gone." };

  await prisma.programItemChannel.upsert({
    where: {
      itemId_channelId: { itemId: parsed.data.itemId, channelId: parsed.data.channelId },
    },
    create: {
      itemId: parsed.data.itemId,
      channelId: parsed.data.channelId,
      open: parsed.data.open,
    },
    update: { open: parsed.data.open },
  });

  await refresh(item.sessionId);
  return ok;
}

/**
 * Fill in an item's open channels from who is on it.
 *
 * Per item rather than for the whole programme, because it is a proposal and a
 * proposal you cannot see the extent of is one you cannot check. It sets both
 * ways — open where somebody is on the item, closed where they are not — so
 * running it after changing the singers actually corrects the row.
 */
export async function suggestOpenChannels(input: {
  itemId: string;
}): Promise<{ ok: true; open: number } | { ok: false; error: string }> {
  await requireCapability("editPrograms");

  const parsed = z.object({ itemId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not do that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: {
      id: true,
      sessionId: true,
      performers: { select: { singerId: true, name: true } },
      instruments: { select: { instrumentId: true, singerId: true, person: true } },
    },
  });
  if (!item) return { ok: false, error: "That item is gone." };

  const channels = await prisma.sessionChannel.findMany({
    where: { sessionId: item.sessionId },
    select: { id: true, singerId: true, person: true, instrumentId: true },
  });
  if (channels.length === 0) {
    return { ok: false, error: "This programme has no channels yet." };
  }

  const open = proposeOpenChannels(
    { itemId: item.id, performers: item.performers, instruments: item.instruments },
    channels,
  );

  await prisma.$transaction(
    channels.map((c) =>
      prisma.programItemChannel.upsert({
        where: { itemId_channelId: { itemId: item.id, channelId: c.id } },
        create: { itemId: item.id, channelId: c.id, open: open.has(c.id) },
        update: { open: open.has(c.id) },
      }),
    ),
  );

  await refresh(item.sessionId);
  return { ok: true, open: open.size };
}

/** The scene to recall for an item, on a desk that has scenes. */
export async function setSceneNumber(input: {
  itemId: string;
  scene: string;
}): Promise<Result> {
  await requireCapability("editPrograms");

  const parsed = z.object({ itemId: Id, scene: z.string().trim().max(4) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that." };

  const n = Number(parsed.data.scene);
  const scene = parsed.data.scene.length === 0 || !Number.isFinite(n) || n < 0 ? null : Math.round(n);

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { sessionId: true },
  });
  if (!item) return { ok: false, error: "That item is gone." };

  await prisma.programItem.update({
    where: { id: parsed.data.itemId },
    data: { sceneNumber: scene },
  });

  await refresh(item.sessionId);
  return ok;
}
