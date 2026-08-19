"use server";

import { prisma } from "@/lib/db";
import { requireCapability, getRole, can, getSignedInSinger } from "@/lib/auth";
import { isMicColour, type MicColourValue } from "@/lib/micCushion";
import { proposeChannels } from "@/lib/deskChannels";
import { jobsOf, runsSound } from "@/lib/sessionView";
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

/**
 * May this person SET UP the desk on this programme?
 *
 * Editors, plus whoever is down as sound engineer or mic coordinator under "Who
 * is running it" on this session. Sailavan: the desk picker, taking the strips
 * again and the channel list "shouldn't be available to anyone but editors and
 * people marked as sound engineers or mic coordinators".
 *
 * Wider than `editPrograms`, and that is the point — the person who agreed to run
 * the sound is usually not an editor, and they are the one standing at the desk.
 * Narrower than "anybody with the link", because a repatched channel list is how
 * a programme loses the record of what was actually on channel 6.
 *
 * The two jobs are roles on the PERSON, set in /admin, so this is one question
 * rather than the two it used to be — a per-session crew row plus a standing
 * grant that always named the same people.
 *
 * Checked here rather than trusted from the page, because hiding a button is not
 * a permission; a Server Action is a public endpoint.
 */
async function requireDeskSetup(): Promise<void> {
  const role = await getRole();
  if (can(role, "editPrograms")) return;

  const me = await getSignedInSinger();
  if (runsSound(jobsOf(me))) return;

  throw new Error(
    "Only an editor, or somebody down as sound engineer or mic coordinator, " +
      "can set up the desk.",
  );
}

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
  await requireDeskSetup();

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
        // The cushion and the mic come across with the strip: they are what the
        // programme's copy is FOR — a record of how the desk was patched that
        // night, which stays true when the desk is re-patched next year.
        colour: c.colour,
        mic: c.mic,
        // How the desk is BUILT. Whether this programme uses the pair as a
        // pair is its own decision from here on.
        stereo: c.stereo,
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
  await requireDeskSetup();

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
    prisma.instrument.findMany({ select: { id: true, name: true, channels: true } }),
    prisma.sessionChannel.findMany({
      where: { sessionId: parsed.data.sessionId },
      select: { number: true, singerId: true, person: true, instrumentId: true },
    }),
  ]);

  const singerName = new Map(singers.map((s) => [s.id, s.name]));
  const instrumentName = new Map(instruments.map((i) => [i.id, i.name]));
  // A two-headed drum is two strips. See Instrument.channels.
  const instrumentChannels = new Map(instruments.map((i) => [i.id, i.channels]));

  const proposed = proposeChannels(
    items.map((i) => ({
      itemId: i.id,
      performers: i.performers,
      instruments: i.instruments,
    })),
    {
      singerName: (id) => singerName.get(id),
      instrumentName: (id) => instrumentName.get(id),
      instrumentChannels: (id) => instrumentChannels.get(id),
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
  await requireDeskSetup();

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
  instrumentId?: string;
  /** A second person sharing the mic. See SessionChannel.withSingerId. */
  withSingerId?: string;
  withPerson?: string;
  colour: string | null;
  stereo?: boolean;
}): Promise<Result> {
  const parsed = z
    .object({
      id: Id,
      label: z.string().trim().min(1).max(60),
      kind: z.enum(["vocal", "instrument", "track", "spare"]),
      singerId: Text(60),
      person: Text(80),
      // A strip can carry an INSTRUMENT, which this could not say until now —
      // so a tabla channel could be labelled but never actually pointed at the
      // tabla, and nothing downstream knew what was on it.
      instrumentId: Text(60).optional(),
      withSingerId: Text(60).optional(),
      withPerson: Text(80).optional(),
      colour: z
        .union([z.string(), z.null()])
        .refine((v) => v === null || v === "" || isMicColour(v), "not a cushion colour"),
      // Whether THIS programme runs the pair as a pair. See SessionChannel.
      stereo: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that channel." };

  const channel = await prisma.sessionChannel.findUnique({
    where: { id: parsed.data.id },
    select: { sessionId: true },
  });
  if (!channel) return { ok: false, error: "That channel is gone." };
  await requireDeskSetup();

  await prisma.sessionChannel.update({
    where: { id: parsed.data.id },
    data: {
      label: parsed.data.label,
      kind: parsed.data.kind,
      /*
       * One occupant, three ways of naming them, and only one may be set.
       * Storing two lets them disagree, and then the desk view has to pick —
       * which is a decision nobody made on purpose.
       */
      singerId: parsed.data.singerId,
      instrumentId: parsed.data.singerId ? null : (parsed.data.instrumentId ?? null),
      person:
        parsed.data.singerId || parsed.data.instrumentId ? null : parsed.data.person,
      // The second seat on the mic. Same rule as the first: a singer carries
      // their own name, so storing it twice lets the two disagree.
      withSingerId: parsed.data.withSingerId ?? null,
      withPerson: parsed.data.withSingerId ? null : (parsed.data.withPerson ?? null),
      colour: parsed.data.colour ? (parsed.data.colour as MicColourValue) : null,
      ...(parsed.data.stereo === undefined ? {} : { stereo: parsed.data.stereo }),
    },
  });

  await refresh(channel.sessionId);
  return ok;
}

export async function removeChannel(input: { id: string }): Promise<Result> {
  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not remove that." };

  const channel = await prisma.sessionChannel.findUnique({
    where: { id: parsed.data.id },
    select: { sessionId: true },
  });
  if (!channel) return ok;
  await requireDeskSetup();

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
  const parsed = z
    .object({ itemId: Id, channelId: Id, open: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not change that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: {
      sessionId: true,
      position: true,
      channels: {
        where: { channelId: parsed.data.channelId },
        select: { singerId: true, person: true, instrumentId: true },
      },
    },
  });
  if (!item) return { ok: false, error: "That item is gone." };
  await requireDeskSetup();

  /*
   * OPENING A FADER CARRIES THE LAST ANSWER WITH IT.
   *
   * Sailavan: "if the same channel is allocated for the next song can copy down
   * the singer from the previous song, we can always override it." Most of a
   * running order is the same people on the same mics — the set changes, the
   * patch mostly does not — so opening channel 1 on the second song and being
   * asked again who is on it is asking for something the row above already said.
   *
   * At the moment of OPENING, because that is when the question arises, and it
   * is what somebody clicking the strip is expecting. There is a bulk button for
   * a whole item as well, but nobody should have to find it to get the ordinary
   * case right.
   *
   * Only into an empty answer, and never over one somebody has given here.
   */
  const mine = item.channels[0];
  const unanswered = !mine?.singerId && !mine?.person && !mine?.instrumentId;

  let inherited: { singerId: string | null; person: string | null; instrumentId: string | null } | null =
    null;

  if (parsed.data.open && unanswered) {
    /*
     * THE MOST RECENT ITEM THIS MIC WAS ALLOCATED ON, not the item immediately
     * before.
     *
     * Sailavan: "it should actually look to the most recent item where that mic
     * was allocated to someone." Channel 3 is Prasanna's for the evening; item 2
     * is a reading that does not use it. Asking only the item before means the
     * reading — which says nothing about channel 3 — erases her from item 3, and
     * the answer given two items ago is thrown away by a row that never had an
     * opinion.
     *
     * So it looks back until it finds an item that actually answered for this
     * channel, and takes that.
     */
    const was = await prisma.programItemChannel.findFirst({
      where: {
        channelId: parsed.data.channelId,
        item: { sessionId: item.sessionId, position: { lt: item.position } },
        OR: [
          { singerId: { not: null } },
          { person: { not: null } },
          { instrumentId: { not: null } },
        ],
      },
      orderBy: { item: { position: "desc" } },
      select: { singerId: true, person: true, instrumentId: true },
    });
    if (was) inherited = was;
  }

  await prisma.programItemChannel.upsert({
    where: {
      itemId_channelId: { itemId: parsed.data.itemId, channelId: parsed.data.channelId },
    },
    create: {
      itemId: parsed.data.itemId,
      channelId: parsed.data.channelId,
      open: parsed.data.open,
      ...(inherited ?? {}),
    },
    update: { open: parsed.data.open, ...(inherited ?? {}) },
  });

  await refresh(item.sessionId);
  return ok;
}

/**
 * Say who is on a strip FOR ONE ITEM, when it is not its usual occupant.
 *
 * Sailavan: a mic used for a singer will, on another song, be used for an
 * instrument — or for one head of a two-sided drum, where a dholak or a
 * mridangam is miked twice. Without this the desk view names the singer on
 * channel 3 for a song where channel 3 is the mridangam, which is worse than
 * saying nothing at all.
 *
 * The same three answers as everywhere else — a managed instrument, a roster
 * singer, or a name typed in — and clearing all three puts the channel's own
 * occupant back, which is the ordinary state and the way out of a mistake.
 */
export async function setItemChannelWho(input: {
  itemId: string;
  channelId: string;
  instrumentId?: string | null;
  singerId?: string | null;
  person?: string | null;
  /** A second person sharing the mic on this item. */
  withSingerId?: string | null;
  withPerson?: string | null;
}): Promise<Result> {
  const parsed = z
    .object({
      itemId: Id,
      channelId: Id,
      instrumentId: z.union([Id, z.null()]).optional(),
      singerId: z.union([Id, z.null()]).optional(),
      person: z.union([Text(60), z.null()]).optional(),
      withSingerId: z.union([Id, z.null()]).optional(),
      withPerson: z.union([Text(60), z.null()]).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not change that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { sessionId: true },
  });
  if (!item) return { ok: false, error: "That item is gone." };
  await requireDeskSetup();

  /*
   * EVERY FIELD IS ONLY MOVED WHEN THE CALLER MENTIONS IT.
   *
   * The three primary fields used to be written unconditionally, so the control
   * that sets who SHARES a mic — which says nothing about the primary — cleared
   * it. Setting Anvita as sharing channel 7 deleted Pavitra from it, and the
   * strip went from naming one person to naming the wrong one.
   *
   * The callers that mean "clear the others" still say so explicitly, by passing
   * null, so picking a singer still removes the instrument and the typed name.
   * Undefined now means "leave it", which is what a control that did not ask the
   * question should say.
   */
  const who = {
    ...(parsed.data.instrumentId === undefined ? {} : { instrumentId: parsed.data.instrumentId }),
    ...(parsed.data.singerId === undefined ? {} : { singerId: parsed.data.singerId }),
    ...(parsed.data.person === undefined ? {} : { person: parsed.data.person }),
    ...(parsed.data.withSingerId === undefined ? {} : { withSingerId: parsed.data.withSingerId }),
    ...(parsed.data.withPerson === undefined ? {} : { withPerson: parsed.data.withPerson }),
  };

  /*
   * Upsert rather than update: a swap can be recorded on a channel that has no
   * row yet. It arrives CLOSED, because saying who would be on a fader is not
   * the same as putting the fader up, and guessing the second from the first is
   * how a mic ends up live when nobody asked for it.
   */
  await prisma.programItemChannel.upsert({
    where: {
      itemId_channelId: { itemId: parsed.data.itemId, channelId: parsed.data.channelId },
    },
    create: { itemId: parsed.data.itemId, channelId: parsed.data.channelId, open: false, ...who },
    update: who,
  });

  await refresh(item.sessionId);
  return ok;
}


/** The scene to recall for an item, on a desk that has scenes. */
export async function setSceneNumber(input: {
  itemId: string;
  scene: string;
}): Promise<Result> {
  const parsed = z.object({ itemId: Id, scene: z.string().trim().max(4) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not save that." };

  const n = Number(parsed.data.scene);
  const scene = parsed.data.scene.length === 0 || !Number.isFinite(n) || n < 0 ? null : Math.round(n);

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { sessionId: true },
  });
  if (!item) return { ok: false, error: "That item is gone." };
  await requireDeskSetup();

  await prisma.programItem.update({
    where: { id: parsed.data.itemId },
    data: { sceneNumber: scene },
  });

  await refresh(item.sessionId);
  return ok;
}

/**
 * Take the desk's strips again, without disturbing the programme.
 *
 * A programme's channels are a SNAPSHOT — that is what lets a programme two
 * years old still say what was on channel 6 after the desk has been re-patched
 * twice. The cost of that is the thing Sailavan hit: "the sound desk info
 * didn't update in the music programme view when I updated it." Correct by
 * design, and useless while you are still setting the programme up.
 *
 * So this re-copies what DESCRIBES each strip — its label, what it carries, its
 * cushion, its mic, whether it is a pair — matching on the channel NUMBER, and
 * touches nothing else. It does not delete: a strip the programme added by hand
 * stays, and every per-item row survives, because those hang off the session
 * channel and re-creating one would take the whole open-channel plan with it.
 *
 * Not automatic, for the same reason the snapshot exists. Somebody asks for the
 * desk as it is now; nothing reaches back into a programme on its own.
 */
export async function refreshFromDesk(input: {
  sessionId: string;
  /**
   * Switch to a different desk at the same time.
   *
   * Sailavan wanted to keep several versions of one desk — a festival patch and
   * an ordinary Thursday — and choose between them per programme. Switching is
   * the same operation as refreshing, since both mean "take the strips from
   * this desk", so it is one action rather than two that would have to agree.
   */
  deskId?: string;
}): Promise<
  | { ok: true; updated: number; added: number; removed: number; kept: number }
  | { ok: false; error: string }
> {
  await requireDeskSetup();

  const parsed = z.object({ sessionId: Id, deskId: Id.optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not do that." };

  if (parsed.data.deskId) {
    const exists = await prisma.desk.count({ where: { id: parsed.data.deskId } });
    if (exists === 0) return { ok: false, error: "That desk is gone." };
    await prisma.session.update({
      where: { id: parsed.data.sessionId },
      data: { deskId: parsed.data.deskId },
    });
  }

  const session = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
    select: {
      format: true,
      desk: { select: { channels: { orderBy: { number: "asc" } } } },
      channels: {
        select: {
          id: true,
          number: true,
          // Enough to tell a strip somebody has claimed from one that is still
          // the desk's own scaffolding. See the removal below.
          singerId: true,
          person: true,
          instrumentId: true,
          withSingerId: true,
          withPerson: true,
          note: true,
          items: {
            select: {
              open: true,
              singerId: true,
              person: true,
              instrumentId: true,
              withSingerId: true,
              withPerson: true,
              note: true,
            },
          },
        },
      },
    },
  });
  if (!session) return { ok: false, error: "That programme is gone." };
  if (session.format !== "program") return { ok: false, error: "That is not a music programme." };
  if (!session.desk) return { ok: false, error: "This programme is not on a desk yet." };

  const mine = new Map(session.channels.map((c) => [c.number, c.id]));
  const writes = [];
  let updated = 0;
  let added = 0;

  for (const c of session.desk.channels) {
    const number = String(c.number);
    const existing = mine.get(number);
    const fields = {
      label: c.label,
      kind: c.kind,
      colour: c.colour,
      mic: c.mic,
      stereo: c.stereo,
    };

    if (existing) {
      updated += 1;
      writes.push(prisma.sessionChannel.update({ where: { id: existing }, data: fields }));
    } else {
      added += 1;
      writes.push(
        prisma.sessionChannel.create({
          data: { sessionId: parsed.data.sessionId, number, ...fields },
        }),
      );
    }
  }

  /*
   * A STRIP THE DESK NO LONGER HAS.
   *
   * Adding and updating was only two thirds of "take the strips from this desk".
   * Sailavan deleted channel 20 from the MG20XU, pressed Update from the desk,
   * and the programme went on showing a channel 20 that exists nowhere — which
   * is the same phantom the desk itself had, one table further along.
   *
   * Removed only when the programme has not CLAIMED it. A strip carrying a name,
   * an instrument, a note, or open on any item is somebody's answer, and a
   * programme is a record of an evening: deleting that because the desk was
   * re-patched afterwards would throw away the one thing the copy exists to
   * protect. Those are kept and counted, so the person is told rather than left
   * to notice.
   */
  const onDesk = new Set(session.desk.channels.map((c) => String(c.number)));
  const claimed = (c: (typeof session.channels)[number]) =>
    Boolean(
      c.singerId ||
        c.person ||
        c.instrumentId ||
        c.withSingerId ||
        c.withPerson ||
        c.note ||
        c.items.some(
          (i) =>
            i.open ||
            i.singerId ||
            i.person ||
            i.instrumentId ||
            i.withSingerId ||
            i.withPerson ||
            i.note,
        ),
    );

  const gone = session.channels.filter((c) => !onDesk.has(c.number));
  const removable = gone.filter((c) => !claimed(c));
  const kept = gone.length - removable.length;

  if (removable.length > 0) {
    writes.push(
      prisma.sessionChannel.deleteMany({ where: { id: { in: removable.map((c) => c.id) } } }),
    );
  }

  if (writes.length > 0) await prisma.$transaction(writes);
  await refresh(parsed.data.sessionId);
  return { ok: true, updated, added, removed: removable.length, kept };
}

/**
 * Carry the previous item's mic allocation into this one.
 *
 * Sailavan: "if the same channel is allocated for the next song can copy down
 * the singer from the previous song, we can always override it." Most of a
 * running order is the same people on the same mics — the set changes, the patch
 * mostly does not — so filling twenty strips again for item 2 is re-entering
 * something the programme already said one row above.
 *
 * Only the channels this item ALREADY has open are touched. Copying the previous
 * item's open set as well would mean this decides which faders are up, which is
 * a different decision and the one most worth making deliberately: a reading
 * wants one mic open where the song before it wanted nine.
 *
 * And it never overwrites an answer somebody has given. A strip already carrying
 * a name on this item is left exactly as it is, so running this twice, or after
 * correcting one channel by hand, cannot undo the correction.
 */
export async function carryOverMics(input: {
  itemId: string;
}): Promise<{ ok: true; copied: number } | { ok: false; error: string }> {
  const parsed = z.object({ itemId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not do that." };

  const item = await prisma.programItem.findUnique({
    where: { id: parsed.data.itemId },
    select: {
      sessionId: true,
      position: true,
      channels: { select: { channelId: true, open: true, singerId: true, person: true, instrumentId: true } },
    },
  });
  if (!item) return { ok: false, error: "That item is gone." };
  await requireDeskSetup();

  /*
   * The most recent answer for each channel, wherever it was given — not
   * whatever the item immediately before happened to say. A reading between two
   * songs says nothing about channel 3, and must not erase what song one said
   * about it.
   *
   * Ordered oldest first so that later answers overwrite earlier ones as the map
   * is built, leaving the most recent for each channel.
   */
  const answers = await prisma.programItemChannel.findMany({
    where: {
      item: { sessionId: item.sessionId, position: { lt: item.position } },
      OR: [
        { singerId: { not: null } },
        { person: { not: null } },
        { instrumentId: { not: null } },
      ],
    },
    orderBy: { item: { position: "asc" } },
    select: { channelId: true, singerId: true, person: true, instrumentId: true },
  });
  if (answers.length === 0) {
    return { ok: false, error: "No mic has been allocated on an earlier item yet." };
  }

  const before = new Map(answers.map((c) => [c.channelId, c]));
  const writes = [];

  for (const mine of item.channels) {
    if (!mine.open) continue;
    // Already answered here — leave it alone.
    if (mine.singerId || mine.person || mine.instrumentId) continue;

    const was = before.get(mine.channelId);
    if (!was) continue;

    writes.push(
      prisma.programItemChannel.update({
        where: { itemId_channelId: { itemId: parsed.data.itemId, channelId: mine.channelId } },
        data: { singerId: was.singerId, person: was.person, instrumentId: was.instrumentId },
      }),
    );
  }

  if (writes.length > 0) await prisma.$transaction(writes);
  await refresh(item.sessionId);
  return { ok: true, copied: writes.length };
}
