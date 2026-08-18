"use server";

import { prisma } from "@/lib/db";
import { can, getRole, getSignedInSinger, requireCapability } from "@/lib/auth";
import { jobsOf, runsSound } from "@/lib/sessionView";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Which desk a bhajan session is mixed on.
 *
 * The only thing the live desk view can change. Everything else it shows is
 * derived — the cushions come from the dots anybody can tap on the board, and
 * the channels come from the desk — so there is one decision here and this is
 * it: which desk, on a night that is not the usual one.
 *
 * Nothing is snapshotted. A programme takes a COPY of a desk's strips, because
 * an old programme has to keep saying what was on channel 6 after the desk is
 * repatched. A Thursday has no such record to protect: it reads the desk as it
 * is now, so tidying the desk simply fixes every session at once.
 */

type Result = { ok: true } | { ok: false; error: string };

/**
 * Editors, and whoever holds one of the two sound jobs.
 *
 * Sailavan: "the sound desk configuration option for the live view in bhajans
 * should only be visible to editors and people designated as mic coordinators
 * or sound engineer." Checked here as well as hidden there — a Server Action is
 * a public endpoint, and hiding a control is not a permission.
 */
async function requireDeskSetup(): Promise<void> {
  const role = await getRole();
  if (can(role, "editPrograms")) return;

  const me = await getSignedInSinger();
  if (runsSound(jobsOf(me))) return;

  throw new Error(
    "Only an editor, or somebody down as sound engineer or mic coordinator, " +
      "can change which desk this session is on.",
  );
}

/**
 * Which bhajan the room is on.
 *
 * `Session.currentItemPosition`, the same column the programme desk uses — it
 * lives on Session rather than on ProgramItem precisely so a bhajan night can
 * share it. Shared, not per device: the point is that the desk, the stage and
 * anybody watching are on the same bhajan.
 *
 * Gated on `setMicCushion`, which is every signed-in person, exactly as the
 * programme desk is. Saying "we are on the second one now" is live operational
 * state like a cushion colour, not an edit to the roster — and the person who
 * notices the room has moved on is rarely the coordinator.
 *
 * Null is "we have not begun", which is how a session opens.
 */
export async function setCurrentBhajan(input: {
  sessionId: string;
  position: number | null;
}): Promise<Result> {
  try {
    await requireCapability("setMicCushion");

    const { sessionId, position } = z
      .object({
        sessionId: z.string().min(1),
        // A bare int, not an index into anything: a slot's `position` is stable
        // and 1-based, and clamping happens where it is read.
        position: z.union([z.number().int().min(1).max(500), z.null()]),
      })
      .parse(input);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, archivedAt: true },
    });
    if (!session) return { ok: false, error: "That session is gone." };
    if (session.archivedAt) return { ok: false, error: "That session was removed." };

    /*
     * The session row's own updatedAt moves with this write, and that is what
     * /api/sessions/version stamps — so tapping a bhajan here is what puts
     * every other board on the same one, within a poll.
     */
    await prisma.session.update({
      where: { id: sessionId },
      data: { currentItemPosition: position },
    });

    revalidatePath(`/roster/${sessionId}/live`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That did not save." };
  }
}

export async function setSessionDesk(input: {
  sessionId: string;
  /** Empty string puts the session back on whichever desk is the default. */
  deskId: string;
}): Promise<Result> {
  try {
    await requireDeskSetup();

    const { sessionId, deskId } = z
      .object({ sessionId: z.string().min(1), deskId: z.string() })
      .parse(input);

    if (deskId) {
      const desk = await prisma.desk.findUnique({ where: { id: deskId }, select: { id: true } });
      if (!desk) return { ok: false, error: "That desk is gone." };
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { deskId: deskId || null },
    });

    revalidatePath(`/roster/${sessionId}/live`);
    revalidatePath(`/roster/${sessionId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That did not save." };
  }
}
