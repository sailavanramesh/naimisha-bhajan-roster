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
 *
 * That makes this the one choke point for "no desk" as well. Both pickers and
 * both write actions already come through here, so switching a session off the
 * desk switches off the offer AND the enforcement together, rather than in four
 * places that could drift apart.
 */

/**
 * The two fields that decide which desk a session is on, if any.
 *
 * Taken together rather than as a bare `deskId`, because reading one without
 * the other is always a bug: a session with `noDesk` set still has whatever
 * `deskId` it had before, and answering from that alone would hand cushions to
 * a session that is not amplified.
 */
export type SessionDeskRef = { deskId: string | null; noDesk: boolean };

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
export async function deskForSession(session: SessionDeskRef): Promise<DeskCushionSource | null> {
  // Not on a desk at all: no fallback, because falling back is what "not
  // specified" means and this is a decision, not an omission.
  if (session.noDesk) return null;

  const { deskId } = session;
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
 * An empty list is a true answer, not a failure, and it arises two ways: the
 * session is not on a desk, or it is on one with nothing on its strips. Both
 * mean "nothing to hand out"; the pickers tell the two apart when they say so,
 * because the fix is different.
 */
export async function cushionsForSession(session: SessionDeskRef): Promise<Cushion[]> {
  const desk = await deskForSession(session);
  return desk ? deskCushions(desk.channels) : [];
}

/** The two fields, for a session id. For callers that hold only the id. */
export async function deskRefOf(sessionId: string): Promise<SessionDeskRef> {
  const row = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { deskId: true, noDesk: true },
  });
  return { deskId: row?.deskId ?? null, noDesk: row?.noDesk ?? false };
}
