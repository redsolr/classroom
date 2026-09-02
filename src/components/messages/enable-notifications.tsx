"use client";

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/lib/use-push-notifications";

/**
 * The one control for "tell me when someone writes".
 *
 * Renders NOTHING when push is unavailable — no VAPID key on the server,
 * or a browser without a push manager. An enable button that asks for a
 * permission nothing can use is worse than no button: it spends the one
 * permission prompt a person will ever say yes to.
 *
 * A denied permission is also a dead end, and says so rather than
 * offering a button the browser will silently ignore — once blocked,
 * only the site settings can undo it.
 */
export function EnableNotifications() {
  const { available, permission, subscribed, busy, enable, disable } =
    usePushNotifications();

  if (!available) return null;

  if (permission === "denied") {
    return (
      <p className="text-[0.8125rem] text-fg-tertiary">
        Notifications are blocked for this site in your browser settings.
      </p>
    );
  }

  return (
    <Button
      size="sm"
      variant={subscribed ? "ghost" : "secondary"}
      loading={busy}
      onClick={() => void (subscribed ? disable() : enable())}
    >
      {subscribed ? (
        <>
          <BellOff className="size-3.5" />
          Turn off notifications
        </>
      ) : (
        <>
          <Bell className="size-3.5" />
          Notify me
        </>
      )}
    </Button>
  );
}
