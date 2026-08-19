import { prisma } from "@/lib/db";
import { deskCushions, type Cushion } from "@/lib/micCushion";

/**
 * lib/sessionDesk.ts — which desk a session is on, and what cushions it has.
 *
 * The resolution below was already written out inline in the live view. It
 * moved here when the roster page needed the same answer: two copies of "which
 * desk is this?" would eventually disagree, and the one place that would show
 * is the pickers offering different cushions on two screens of the same
 * session, which is the exact bug this whole change is fixing.
 */

/** Just enough of a desk to know its cushions. */
export type DeskCushionSource = {
  id: string;
  name: string;
  channels: { number: number; colour: string | null }[];
};

const CHANNEL_SELECT = {
  channels: {
    select: { number: true, colour: true },
    orderBy: { number: "asc" as const },
  },
} as const;

/**
 * The desk a session is run on.
 *
 * Falls back to the default desk, then to any desk at all. That fallback is
 * load-bearing rather than defensive: of 204 sessions only ONE has a desk
 * explicitly set, because the centre has one desk and nobody has ever had to
 * choose it. Requiring an explicit link would leave every other session with no
 * cushions to pick from.
 *
 * Null only when there is no desk in the database whatsoever.
 */
export async function deskForSession(deskId: string | null): Promise<DeskCushionSource | null> {
  const byId = deskId
    ? await prisma.desk.findUnique({
        where: { id: deskId },
        select: { id: true, name: true, ...CHANNEL_SELECT },
      })
    : null;
  if (byId) return byId;

  const fallback =
    (await prisma.desk.findFirst({
      where: { isDefault: true },
      select: { id: true, name: true, ...CHANNEL_SELECT },
    })) ??
    (await prisma.desk.findFirst({
      orderBy: { name: "asc" },
      select: { id: true, name: true, ...CHANNEL_SELECT },
    }));

  return fallback;
}

/**
 * The cushions offered on a session, in channel order.
 *
 * An empty list is a true answer, not a failure: a desk with no cushions on any
 * strip has no cushions to hand out, and the pickers say so rather than
 * offering colours the sound person would go looking for and not find.
 */
export async function cushionsForSession(deskId: string | null): Promise<Cushion[]> {
  const desk = await deskForSession(deskId);
  return desk ? deskCushions(desk.channels) : [];
}
