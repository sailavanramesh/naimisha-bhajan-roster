"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { pushToSingers, pushConfigured } from "@/lib/push";
import { missingParts, nudgeNotification, rosteredNotification } from "@/lib/notify";

const Input = z.object({
  sessionId: z.string().min(1),
  singerId: z.string().min(1),
});

/**
 * Send one person a reminder about one session, by hand.
 *
 * The 3pm nudge covers the ordinary case. This is for the rest: somebody
 * added at short notice, somebody who says they never got it, a Sunday that
 * does not behave like a weekday. A coordinator who cannot do this ends up
 * ringing round instead, which is the thing the app is meant to save.
 *
 * The message is the same one the app would have sent on its own — what is
 * missing, or what they are singing if nothing is. Writing a second, hand-made
 * kind of message would be one more thing to keep true as the roster changes.
 *
 * Deliberately writes NO SessionNotice. A manual send is not the automatic one
 * and must not consume it: a coordinator nudging somebody at noon should not
 * stop the 3pm reminder, and should not be blocked by it either. The rate limit
 * on this is that a human has to press it.
 */
export async function sendManualNotice(input: {
  sessionId: string;
  singerId: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireCapability("notifySingers");

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad request." };
  const { sessionId, singerId } = parsed.data;

  if (!pushConfigured) {
    return { ok: false, error: "Push is not configured on this server." };
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      date: true,
      slots: {
        where: { singerId },
        orderBy: { position: "asc" },
        select: {
          confirmedPitch: true,
          bhajanTitle: true,
          festivalBhajanTitle: true,
          bhajan: { select: { title: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, error: "No such session." };
  if (session.slots.length === 0) {
    return { ok: false, error: "They are not on this session." };
  }

  const singer = await prisma.singer.findUnique({
    where: { id: singerId },
    select: { name: true },
  });

  const dateISO = session.date.toISOString().slice(0, 10);
  const titles = session.slots
    .map((s) => s.bhajan?.title ?? s.bhajanTitle ?? s.festivalBhajanTitle ?? null)
    .filter((t): t is string => Boolean(t));

  // The first row of theirs that is short of something decides the message.
  const gap = session.slots
    .map((s) => ({
      missing: missingParts({
        bhajanTitle: s.bhajan?.title ?? s.bhajanTitle ?? s.festivalBhajanTitle ?? null,
        confirmedPitch: s.confirmedPitch,
      }),
      title: s.bhajan?.title ?? s.bhajanTitle ?? s.festivalBhajanTitle ?? null,
      pitch: s.confirmedPitch,
    }))
    .find((s) => s.missing.length > 0);

  const notification = gap
    ? nudgeNotification({
        sessionId,
        dateISO,
        missing: gap.missing,
        bhajanTitle: gap.title,
        confirmedPitch: gap.pitch,
      })
    : rosteredNotification({ sessionId, dateISO, bhajanTitles: titles });

  const res = await pushToSingers([singerId], notification);
  const who = singer?.name ?? "They";

  if (res.sent === 0) {
    return {
      ok: false,
      error:
        res.pruned > 0
          ? `${who} had a device registered but it has expired. They will need to turn notifications on again.`
          : `${who} has no device set up for notifications yet.`,
    };
  }

  return {
    ok: true,
    message: `Sent to ${who} — ${res.sent} device${res.sent === 1 ? "" : "s"}.`,
  };
}
