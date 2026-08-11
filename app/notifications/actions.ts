"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSignedInSinger } from "@/lib/auth";

const Sub = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

/**
 * Remember this browser so it can be pushed to.
 *
 * Requires a SIGNED-IN person, not merely an access link. A notification is
 * addressed to somebody — "you are singing on Thursday" — so an anonymous
 * browser has nobody to be. That is why the page says to sign in first rather
 * than offering a button that cannot work.
 *
 * Upserts on the endpoint: re-subscribing the same browser, which happens
 * whenever the push service rotates its keys, must replace the row rather than
 * accumulate duplicates that would each get a copy of every message.
 */
export async function saveSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getSignedInSinger();
  if (!me) {
    return { ok: false, error: "Sign in with Google first — a notification has to reach a person." };
  }

  const parsed = Sub.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That subscription looked malformed." };
  const { endpoint, p256dh, auth, userAgent } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { singerId: me.id, endpoint, p256dh, auth, userAgent: userAgent ?? null },
    update: { singerId: me.id, p256dh, auth, userAgent: userAgent ?? null },
  });

  return { ok: true };
}

/** Forget this browser. */
export async function removeSubscription(endpoint: string): Promise<{ ok: true }> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return { ok: true };
}

/**
 * Send a test push to the signed-in person's own devices.
 *
 * Both kinds can be sent, because the two behave differently and the
 * difference is the point: one is meant to interrupt and the other is not.
 * Checking that on a real phone otherwise means rostering people on real
 * sessions and waiting to see what buzzes.
 */
export async function sendTestNotification(
  kind: "rostered" | "published" = "rostered",
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const me = await getSignedInSinger();
  if (!me) return { ok: false, error: "Sign in first." };

  const { pushToSingers, pushConfigured } = await import("@/lib/push");
  if (!pushConfigured) return { ok: false, error: "Push is not configured on the server yet." };

  const alert = kind === "rostered";
  const res = await pushToSingers([me.id], {
    title: alert ? "You are rostered" : "Roster is up",
    body: alert
      ? `This is what being rostered looks like, ${me.name} — it should make a sound.`
      : "This is the quiet kind — it should arrive without a sound or a buzz.",
    url: "/roster",
    tag: alert ? "test-rostered" : "test-published",
    alert,
  });
  if (res.sent === 0) {
    return { ok: false, error: "No device accepted it. Try switching notifications off and on." };
  }
  return { ok: true, sent: res.sent };
}
