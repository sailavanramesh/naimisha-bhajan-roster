/**
 * lib/pushKeys.ts — the VAPID public key, on the browser's terms.
 *
 * Pure. No DOM, no Prisma.
 *
 * A push subscription is created against ONE server public key and is
 * deliverable only with that key's private half. Rotate the VAPID pair and
 * every subscription made before the rotation becomes permanently undeliverable
 * — Apple answers `{"reason":"VapidPkHashMismatch"}` with a 400, which is not
 * one of the statuses that mean "gone", so nothing prunes it and nothing retries
 * it into working. The device shows notifications as ON and receives nothing,
 * for good.
 *
 * The only cure is for the browser to subscribe again with the current key, so
 * the client has to be able to notice that its own subscription is out of date.
 * That comparison is what lives here.
 */

/** base64url -> bytes. The wire form VAPID keys travel in. */
export function base64UrlToBytes(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Was this subscription made against the key we are sending with?
 *
 * `subscribed` is what `PushSubscription.options.applicationServerKey` gives
 * back: the raw bytes, or null on a browser that does not report them.
 *
 * NULL IS TREATED AS A MATCH, deliberately. Not knowing is not the same as
 * knowing it is wrong, and the cost of guessing wrong the other way is a device
 * that re-subscribes on every page load — which would churn endpoints and buzz
 * nobody usefully. A browser that cannot tell us keeps what it has.
 */
export function sameApplicationServerKey(
  subscribed: ArrayBuffer | null | undefined,
  serverKey: string,
): boolean {
  if (!subscribed) return true;
  if (!serverKey) return true;

  const mine = base64UrlToBytes(serverKey);
  const theirs = new Uint8Array(subscribed);
  if (mine.length !== theirs.length) return false;
  for (let i = 0; i < mine.length; i++) {
    if (mine[i] !== theirs[i]) return false;
  }
  return true;
}
