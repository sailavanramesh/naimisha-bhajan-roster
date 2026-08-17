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

/*
 * Guarded, because setVapidDetails THROWS on a malformed key — and it runs at
 * module load, so the throw takes down every page that imports this, not just
 * the notifications one. A mistyped setting should degrade to "notifications
 * are not configured", never to a 500 on the roster.
 */
function configure(): boolean {
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (e) {
    console.error("VAPID keys are set but not valid; push disabled.", e);
    return false;
  }
}

export const pushConfigured = configure();

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
/**
 * Is this subscription beyond saving, as opposed to merely failing today?
 *
 * 404 and 410 are the documented "this endpoint is gone" answers and have
 * always been pruned. The third case was found by testing on 2026-08-17: Apple
 * refuses a subscription made against a DIFFERENT VAPID public key with
 *
 *     400 {"reason":"VapidPkHashMismatch"}
 *
 * which is just as permanent — the keys cannot be un-rotated, so that endpoint
 * can never be delivered to again — but is not a status anything treated as
 * dead. So the row sat there failing on every send, forever, while the device
 * showed notifications as on. The browser makes a fresh subscription once it
 * notices (see lib/pushKeys.ts); this clears away the one it replaces.
 *
 * Deliberately narrow. A 400 on its own is NOT taken as dead — that is the
 * status a malformed payload of our own making would return, and pruning
 * everybody's subscription over our own bug is not a mistake worth risking.
 */
function isGone(status: number | undefined, body: string | undefined): boolean {
  if (status === 404 || status === 410) return true;
  return status === 400 && /VapidPkHashMismatch/i.test(body ?? "");
}

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
  let failed = 0;
  const dead: string[] = [];
  /*
   * WHICH subscriptions delivered, not how many.
   *
   * `lastOkAt` lives on the subscription row, so it has to mean "this device
   * received something". It was stamped on every subscription belonging to
   * every recipient whenever any single send succeeded — so one working phone
   * marked a person's broken one healthy, and a device that had never received
   * anything looked fine. That is exactly backwards for a column whose only job
   * is to let somebody find the dead device.
   */
  const delivered: string[] = [];

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
        delivered.push(s.id);
      } catch (e: unknown) {
        const err = e as { statusCode?: number; body?: string };
        if (isGone(err.statusCode, err.body)) dead.push(s.id);
        else failed++;
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
  if (delivered.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: delivered } },
      data: { lastOkAt: new Date() },
    });
  }

  return { sent: delivered.length, failed, pruned: dead.length };
}
