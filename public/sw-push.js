/* eslint-disable no-restricted-globals */

/**
 * Service worker for web push — messages only.
 *
 * Deliberately does NOT cache anything. This app is a PWA by manifest,
 * not an offline app: a caching worker would start serving stale study
 * pages the first time someone kept the installed app open across a
 * deploy, and the failure would read as "the app lost my edit".
 *
 * Ported from `crm/public/sw-push.js` with two fixes the CRM's copy
 * still owes: it hard-coded `url: "/"` instead of reading the payload's,
 * and its click handler focused an existing tab WITHOUT navigating it —
 * so a notification about one thread dropped you wherever that tab
 * happened to be.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Classroom", body: event.data.text() };
  }

  const url = data.url || "/messages";
  event.waitUntil(
    self.registration.showNotification(data.title || "Classroom", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // One bubble per thread: four lines in a row replace each other on
      // the lock screen instead of stacking into a pile nobody reads.
      tag: data.tag || "classroom",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/messages";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.startsWith(self.location.origin)) {
            // Focus AND navigate. Focusing alone lands the reader on
            // whatever page that tab was already showing, which for a
            // notification about a specific thread is the wrong answer
            // dressed as the right one.
            return client.focus().then((focused) =>
              focused.navigate ? focused.navigate(url) : focused,
            );
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
