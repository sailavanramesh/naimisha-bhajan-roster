/*
 * Service worker: receives pushes and opens the right page when one is tapped.
 *
 * Must live at the site root. A worker's scope is its own directory, so served
 * from /sw.js it controls the whole app; from anywhere else it would control
 * only part of it.
 *
 * Deliberately minimal — no caching. An offline cache on a roster that changes
 * during a session is a way to show somebody yesterday's pitches, which is
 * worse than showing them nothing.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Naimiṣa Roster";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // Collapses an earlier unread notice about the same session rather than
    // stacking two that say nearly the same thing.
    tag: data.tag || "naimisha",
    renotify: Boolean(data.alert),
    // The quiet kind arrives without sound or vibration.
    silent: !data.alert,
    requireInteraction: false,
    data: { url: data.url || "/roster" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/roster";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse a window that is already open rather than piling up tabs.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
