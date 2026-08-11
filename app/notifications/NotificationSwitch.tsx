"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { saveSubscription, removeSubscription, sendTestNotification } from "./actions";

type State = "checking" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

/**
 * base64url -> ArrayBuffer, which is what PushManager wants.
 *
 * Returned as an ArrayBuffer rather than a Uint8Array so the type lines up:
 * TypeScript's BufferSource insists on a view over a plain ArrayBuffer, and a
 * Uint8Array is typed over ArrayBufferLike, which includes SharedArrayBuffer.
 */
function toKey(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Turn notifications on for this device.
 *
 * The awkward part is iOS. Safari only allows web push for a site that has
 * been ADDED TO THE HOME SCREEN — in a normal tab the APIs are simply absent.
 * Showing a button that silently fails there would be worse than useless, so
 * that case is detected and explained instead.
 *
 * Permission is requested from a real click, never on load. A prompt that
 * appears unasked gets denied, and a denial is sticky — the browser will not
 * ask again, and the user has to dig through site settings to undo it.
 */
export function NotificationSwitch({ vapidKey, signedIn }: { vapidKey: string; signedIn: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      /*
       * Order matters here, and getting it wrong is what made this misleading.
       *
       * iOS reports Notification.permission as "denied" for a site opened in a
       * Safari TAB, because web push is only available once the site has been
       * added to the Home Screen. Checking "denied" first therefore told people
       * their notifications were blocked and sent them to site settings, where
       * there is nothing to change — the fix is to install the app.
       *
       * So: decide whether this is an iOS tab BEFORE looking at permission.
       */
      const iOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        // iPadOS reports itself as a Mac; touch points give it away.
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;

      if (iOS && !standalone) return setState("needs-install");

      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setState("unsupported");

      if (Notification.permission === "denied") return setState("blocked");

      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  const turnOn = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }

        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKey(vapidKey),
        });

        const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
        const res = await saveSubscription({
          endpoint: json.endpoint ?? "",
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        });

        if (!res.ok) {
          await sub.unsubscribe();
          setMessage(res.error);
          setState("off");
          return;
        }
        setState("on");
        setMessage("On for this device.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not switch them on.");
        setState("off");
      }
    });

  const turnOff = () =>
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMessage("Off for this device.");
    });

  const test = (kind: "rostered" | "published") =>
    startTransition(async () => {
      const res = await sendTestNotification(kind);
      setMessage(
        res.ok
          ? kind === "rostered"
            ? "Sent — it should make a sound."
            : "Sent — it should arrive silently."
          : res.error,
      );
    });

  if (state === "checking") {
    return <p className="text-sm text-on-surface-muted">Checking this device…</p>;
  }

  if (state === "needs-install") {
    return (
      <div className="grid gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
        <strong>Add this to your Home Screen first.</strong>
        <span className="text-on-surface-muted">
          You are in a Safari tab. On an iPhone, notifications only work once the app is
          installed — a tab has no way to receive them, whatever the settings say.
        </span>
        <ol className="ml-4 list-decimal text-on-surface-muted">
          <li>
            Tap <strong>Share</strong> — the square with the arrow, at the bottom
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>
          </li>
          <li>Open the app from your Home Screen, not from Safari</li>
          <li>Come back to this page and turn them on</li>
        </ol>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <p className="text-sm text-on-surface-muted">
        This browser cannot receive notifications. Try it on your phone.
      </p>
    );
  }

  if (state === "blocked") {
    return (
      <div className="grid gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
        <strong>Notifications are blocked for this site.</strong>
        <span className="text-on-surface-muted">
          The browser will not ask again, so it has to be changed in its own settings —
          site settings for this address, then allow notifications.
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {!signedIn ? (
        <p className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
          Sign in with Google first. A notification says <em>you</em> are singing, so it has to
          know who you are.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {state === "on" ? (
          <>
            <span className="inline-flex h-9 items-center rounded-full border border-brass/45 bg-brass/[0.10] px-3 text-sm font-semibold">
              On for this device
            </span>
            {/* Both kinds, because the difference between them — buzz versus
                no buzz — is the thing worth checking on a real phone. */}
            <Button
              type="button"
              className="h-9 text-xs"
              onClick={() => test("rostered")}
              disabled={pending}
            >
              Test the alert
            </Button>
            <Button
              type="button"
              className="h-9 text-xs"
              onClick={() => test("published")}
              disabled={pending}
            >
              Test the quiet one
            </Button>
            <Button type="button" className="h-9 text-xs" onClick={turnOff} disabled={pending}>
              Turn off
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="primary"
            className="h-9"
            onClick={turnOn}
            disabled={pending || !signedIn}
          >
            {pending ? "Turning on…" : "Turn on notifications"}
          </Button>
        )}
      </div>

      {message ? <p className="text-sm text-on-surface-muted">{message}</p> : null}
    </div>
  );
}
