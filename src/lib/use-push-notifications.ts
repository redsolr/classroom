"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Enable or disable web push for THIS browser.
 *
 * Adapted from `crm/src/hooks/use-push-notifications.ts`. The CRM gets
 * its service worker from serwist, which registers one in production
 * builds and none in dev — so its hook only ever LOOKS one up and
 * reports `available: false` locally, and push cannot be exercised on a
 * dev machine at all. This app has no serwist and one hand-written
 * worker that does nothing but notifications, so it registers its own:
 * the feature then behaves the same in dev as in production, which is
 * the only way the founder can test a notification before shipping it.
 *
 * Everything stays gated on the server having a VAPID key. A null key
 * means the caller renders nothing at all, rather than an enable button
 * that would ask for a permission no notification could ever use.
 */

const noopSubscribe = () => () => {};
const detectSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export type PushNotificationsState = {
  /** Browser capability AND a live registration AND a server key. */
  available: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

export function usePushNotifications(): PushNotificationsState {
  // Feature detection is a static boolean — `useSyncExternalStore`
  // returns the server-safe `false` during SSR and on the first client
  // render, then the real value once hydration commits.
  const supported = useSyncExternalStore(
    noopSubscribe,
    detectSupported,
    () => false,
  );

  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Adjusting state during render rather than through a setState-in-effect
  // cascade, once `supported` flips true after hydration.
  const [lastSupported, setLastSupported] = useState(supported);
  if (supported !== lastSupported) {
    if (supported && typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    setLastSupported(supported);
  }

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    void (async () => {
      try {
        // Asked FIRST: with no key configured there is nothing to
        // register a worker for, and registering one anyway would leave
        // a service worker installed on every visitor's browser for a
        // feature that is switched off.
        const response = await fetch("/api/push/vapid-key");
        if (!response.ok) return;
        const { key } = (await response.json()) as { key: string | null };
        if (cancelled || !key) return;
        setServerKey(key);

        const reg = await navigator.serviceWorker.register("/sw-push.js");
        if (cancelled) return;
        setRegistration(reg);
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(sub !== null);
      } catch (error) {
        console.error("[push] setup failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!registration || !serverKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(serverKey),
      });
      const sub = subscription.toJSON();
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys.auth) {
        throw new Error("PushSubscription serialized without endpoint/keys");
      }
      const stored = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        }),
      });
      if (!stored.ok) {
        // The browser now holds a subscription the server has no row
        // for, which would silently deliver nothing forever. Undo it, so
        // the button honestly goes back to "off".
        await subscription.unsubscribe();
        throw new Error(`subscribe failed: ${stored.status}`);
      }
      setSubscribed(true);
    } catch (error) {
      console.error("[push] enable failed:", error);
    } finally {
      setBusy(false);
    }
  }, [registration, serverKey]);

  const disable = useCallback(async () => {
    if (!registration) return;
    setBusy(true);
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (error) {
      console.error("[push] disable failed:", error);
    } finally {
      setBusy(false);
    }
  }, [registration]);

  return {
    available: supported && registration !== null && serverKey !== null,
    permission,
    subscribed,
    busy,
    enable,
    disable,
  };
}

/**
 * VAPID keys travel base64url; `PushManager` wants raw bytes.
 *
 * The buffer is allocated explicitly rather than through
 * `new Uint8Array(length)`: that overload types as
 * `Uint8Array<ArrayBufferLike>`, which could be backed by a
 * `SharedArrayBuffer` and so is not assignable to the `BufferSource`
 * `applicationServerKey` wants. Naming the ArrayBuffer is the fix, not a
 * cast — the value really is backed by one.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}
