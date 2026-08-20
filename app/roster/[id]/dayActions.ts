"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";

/** "HH:MM" on the clock at the session's own timezone. */
const Time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Give a time as HH:MM, like 17:30.");

/**
 * What a second session on the same day inherits from the first.
 *
 * The room and the kind of evening, not the content. A split or an added
 * session is the same gathering continuing, so the timezone, the type, the
 * format and the desk carry over — a coordinator who had already told the app
 * which desk is in use should not have to say it twice.
 *
 * What is deliberately NOT carried: the seed and the template, because neither
 * session was generated from them any more; the notes, which are about the
 * session they were written on; and the running position of a programme.
 */
function inheritedFrom(session: {
  date: Date;
  timeZone: string;
  type: string;
  format: string;
  status: string;
  categoryId: string | null;
  location: string | null;
  deskId: string | null;
  noDesk: boolean;
  tablaMicd: boolean;
}) {
  return {
    date: session.date,
    timeZone: session.timeZone,
    type: session.type as never,
    format: session.format as never,
    status: session.status as never,
    categoryId: session.categoryId,
    location: session.location,
    deskId: session.deskId,
    noDesk: session.noDesk,
    tablaMicd: session.tablaMicd,
  };
}

const SOURCE_SELECT = {
  id: true,
  date: true,
  startsAt: true,
  timeZone: true,
  type: true,
  format: true,
  status: true,
  categoryId: true,
  location: true,
  deskId: true,
  noDesk: true,
  tablaMicd: true,
} as const;

const AddSameDay = z.object({ sessionId: z.string().min(1), startsAt: Time });

/**
 * Another session on the same day, empty.
 *
 * Sailavan: "an option to add a session on the same day in the same day's
 * session page, so its easy to transcribe it across." The day already switches
 * between its sessions at the top of the page; this is how the second one comes
 * to exist without leaving for the calendar.
 */
export async function addSessionOnSameDay(input: {
  sessionId: string;
  startsAt: string;
}): Promise<{ ok: false; error: string }> {
  await requireCapability("buildSessions");

  const parsed = AddSameDay.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not do that." };
  }

  const source = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
    select: SOURCE_SELECT,
  });
  if (!source) return { ok: false, error: "That session no longer exists." };

  const clash = await prisma.session.findFirst({
    where: { date: source.date, startsAt: parsed.data.startsAt },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, error: `There is already a session at ${parsed.data.startsAt} that day.` };
  }

  const created = await prisma.session.create({
    data: { ...inheritedFrom(source), startsAt: parsed.data.startsAt },
    select: { id: true },
  });

  revalidatePath(`/roster/${parsed.data.sessionId}`);
  revalidatePath(`/roster/${created.id}`);
  redirect(`/roster/${created.id}`);
}

const Split = z.object({
  sessionId: z.string().min(1),
  slotIds: z.array(z.string().min(1)).min(1, "Choose at least one singer to move."),
  startsAt: Time,
});

/**
 * Split one session into two, MOVING the chosen slots to the new one.
 *
 * Moving is the whole point. On 2026-08-20 somebody split a session by hand —
 * created the second one, removed three singers from the first and added them
 * again on the second — and each recreated slot came back without its
 * `historicalRecommendedPitch`, because that field belongs to the imported row
 * and not to the person. Three pieces of the group's history went with it. A
 * moved row keeps everything: the confirmed pitch, the recommendation it was
 * measured against, the chorus mics hanging off it.
 *
 * Both sides are renumbered from 1 afterwards, so neither is left with gaps.
 *
 * Mic cushions do NOT move. They are keyed by session and singer and describe
 * which cushion somebody picked up in a room on a night — a fact about the
 * first session, not about the slot.
 */
export async function splitSession(input: {
  sessionId: string;
  slotIds: string[];
  startsAt: string;
}): Promise<{ ok: false; error: string }> {
  await requireCapability("buildSessions");

  const parsed = Split.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not do that." };
  }
  const { sessionId, slotIds, startsAt } = parsed.data;

  const source = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { ...SOURCE_SELECT, slots: { select: { id: true }, orderBy: { position: "asc" } } },
  });
  if (!source) return { ok: false, error: "That session no longer exists." };

  const here = new Set(source.slots.map((s) => s.id));
  const moving = [...new Set(slotIds)].filter((id) => here.has(id));
  if (moving.length !== new Set(slotIds).size) {
    return { ok: false, error: "Some of those rows are not on this session. Reload and try again." };
  }
  if (moving.length === source.slots.length) {
    return {
      ok: false,
      error:
        "That would move everybody and leave this session empty. Change its start time instead, or leave at least one singer here.",
    };
  }
  if (startsAt === source.startsAt) {
    return { ok: false, error: "Give the new session a different start time from this one." };
  }

  const clash = await prisma.session.findFirst({
    where: { date: source.date, startsAt },
    select: { id: true },
  });
  if (clash) return { ok: false, error: `There is already a session at ${startsAt} that day.` };

  const created = await prisma.$transaction(async (tx) => {
    const next = await tx.session.create({
      data: { ...inheritedFrom(source), startsAt },
      select: { id: true },
    });

    // Move, never recreate. Position is set per side afterwards.
    await tx.sessionSlot.updateMany({
      where: { id: { in: moving } },
      data: { sessionId: next.id },
    });

    for (const [index, id] of moving.entries()) {
      await tx.sessionSlot.update({ where: { id }, data: { position: index + 1 } });
    }

    const remaining = source.slots.filter((s) => !moving.includes(s.id));
    for (const [index, s] of remaining.entries()) {
      await tx.sessionSlot.update({ where: { id: s.id }, data: { position: index + 1 } });
    }

    return next;
  });

  revalidatePath(`/roster/${sessionId}`);
  revalidatePath(`/roster/${created.id}`);
  redirect(`/roster/${created.id}`);
}
