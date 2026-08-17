"use server";

import { prisma } from "@/lib/db";
import { can, getRole, getSignedInSinger } from "@/lib/auth";
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
