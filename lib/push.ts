import webpush from "web-push";
import { prisma } from "@/lib/db";
import type { Notification } from "@/lib/notify";

/**
 * Sending push messages, and clearing up after dead ones.
 *
 * The VAPID keys identify this server to the push services. Without them
 * nothing can be sent, so `pushConfigured` is exported and every caller checks
 * it rather than throwing in the middle of saving a roster — a coordinator
 * saving a session must not be blocked because notifications are misconfigured.
 */

const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const subject = process.env.VAPID_SUBJECT ?? "mailto:swamilavan@gmail.com";

export const pushConfigured = Boolean(publicKey && privateKey);

if (pushConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/** The browser needs this to subscribe. Safe to expose — it is the public half. */
export function vapidPublicKey(): string {
  return publicKey;
}

/**
 * Push one notification to every device belonging to these people.
 *
 * A 404 or 410 from the push service means the subscription is dead — the
 * browser was uninstalled, or the user cleared their data. Those are DELETED
 * rather than retried: they are the normal end of a subscription's life, and
 * left in place they slow every later send and never recover.
 *
 * Other failures are left alone. A 500 from a push service is transient and
 * deleting the subscription would lose a real device over a temporary fault.
 */
export async function pushToSingers(
  singerIds: readonly string[],
  notification: Notification,
): Promise<{ sent: number; failed: number; pruned: number }> {
  if (!pushConfigured || singerIds.length === 0) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { singerId: { in: [...singerIds] } },
  });
  if (subs.length === 0) return { sent: 0, failed: 0, pruned: 0 };

  const payload = JSON.stringify(notification);
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            // Urgency tells the phone whether it may hold the message back to
            // save battery. The quiet kind can wait; being rostered cannot.
            urgency: notification.alert ? "high" : "low",
            TTL: 60 * 60 * 24,
          },
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else failed++;
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
  if (sent > 0) {
    await prisma.pushSubscription.updateMany({
      where: { singerId: { in: [...singerIds] }, id: { notIn: dead } },
      data: { lastOkAt: new Date() },
    });
  }

  return { sent, failed, pruned: dead.length };
}
