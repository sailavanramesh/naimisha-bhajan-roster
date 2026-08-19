"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability, getSignedInSinger } from "@/lib/auth";
import { isMicColour, type MicColourValue } from "@/lib/micCushion";
import { cushionsForSession, deskRefOf } from "@/lib/sessionDesk";

/**
 * Set which colour mic cushion a singer is on for a session.
 *
 * Concurrency is deliberately different from the roster grid next door. That
 * one refuses a save when someone else has touched the same rows, because it
 * writes the historical record and a silent overwrite would lose a
 * confirmedPitch. This writes one small piece of live state, so:
 *
 *   - The write is a single-row upsert keyed on (sessionId, singerId). Two
 *     people setting DIFFERENT singers therefore cannot clobber each other at
 *     all — that is the failure that would actually hurt during a session.
 *   - Two people setting the SAME singer is last-writer-wins, on purpose.
 *     Interrupting a sound engineer mid-session with a conflict dialog over a
 *     cushion colour would be the wrong trade.
 *
 * The authoritative updatedAt comes back so the caller can order it against
 * whatever its polling loop has seen. See lib/micCushion.ts.
 */

const schema = z.object({
  sessionId: z.string().min(1),
  singerId: z.string().min(1),
  colour: z
    .union([z.string(), z.null()])
    .refine((v) => v === null || isMicColour(v), "not a mic cushion colour"),
});

export type SetMicCushionResult = {
  singerId: string;
  colour: MicColourValue | null;
  updatedAt: number;
  setByName: string | null;
};

export async function setMicCushion(input: {
  sessionId: string;
  singerId: string;
  colour: string | null;
}): Promise<SetMicCushionResult> {
  await requireCapability("setMicCushion");

  const { sessionId, singerId, colour } = schema.parse(input);
  const value = (colour as MicColourValue | null) ?? null;

  /*
   * A cushion that is not on this session's desk cannot be set, not merely
   * hidden. Sailavan, 2026-08-19: "if a cushion colour is not ascribed to a
   * channel set for a certain session, then it can't be picked." A picker that
   * only omits the option leaves the rule true by accident — a stale tab
   * rendered before the desk changed would still write the old colour.
   *
   * A session marked as not on a desk offers nothing, so this refuses every
   * colour on it — which is the point of the flag.
   *
   * Clearing is always allowed: null is "take the cushion off", which stays
   * available however the desk is configured, and is the only way to correct a
   * colour the desk has since dropped, or one left over from before the session
   * was taken off the desk.
   */
  if (value !== null) {
    const offered = await cushionsForSession(await deskRefOf(sessionId));
    if (!offered.some((c) => c.value === value)) {
      throw new Error("That cushion is not on this session's desk.");
    }
  }

  const who = await getSignedInSinger();
  const setByName = who?.name ?? null;

  const row = await prisma.micCushion.upsert({
    where: { sessionId_singerId: { sessionId, singerId } },
    create: { sessionId, singerId, colour: value, setByName },
    update: { colour: value, setByName },
    select: { singerId: true, colour: true, updatedAt: true, setByName: true },
  });

  return {
    singerId: row.singerId,
    colour: row.colour,
    updatedAt: row.updatedAt.getTime(),
    setByName: row.setByName,
  };
}
