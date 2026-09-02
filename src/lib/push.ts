import "server-only";
import { and, eq, ne } from "drizzle-orm";
import webpush from "web-push";
import { db, pushSubscriptions } from "@/db";

/**
 * WEB PUSH — how a message reaches a phone that isn't open.
 *
 * Ported from the CRM's ambient-digest arc (`crm/src/server/push.ts`),
 * which is the proven in-portfolio implementation. Two changes, both
 * forced by this app being multi-user:
 *
 *   · a subscription belongs to a WorkOS user, and delivery is TARGETED.
 *     Fanning out to every stored subscription is correct in a
 *     single-operator CRM and is a privacy incident here.
 *   · a failed send never fails the write that triggered it. A message
 *     that is stored but not pushed is a late notification; a message
 *     that is pushed but not stored does not exist. The ordering follows
 *     from that, and so does the swallowing.
 *
 * ENV-GATED, like realtime and Stripe: with `VAPID_PUBLIC_KEY` /
 * `VAPID_PRIVATE_KEY` unset the key route answers null, the UI renders
 * no enable button, and nothing here throws — the app degrades to the
 * in-app unread badge, which is the floor this feature is built on
 * rather than an emergency fallback.
 *
 * Key generation (founder, one-time): `npx web-push generate-vapid-keys`
 * → the pair goes into Vercel env + `.env.local`.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** In-app path the notification click opens. */
  url: string;
  /** Collapses same-tag notifications — one bubble per thread, not a
   * pile of them when someone sends four lines in a row. */
  tag?: string;
};

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function configureWebpush(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not configured — web push cannot run.",
    );
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@jurisimus.com",
    publicKey,
    privateKey,
  );
}

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Store (or re-point) a browser's subscription.
 *
 * Keyed on the endpoint, which is the browser installation's identity.
 * The upsert also rewrites `workos_user_id`, which is the case that
 * matters on a shared machine: signing in as someone else must move the
 * subscription to them rather than leave the previous person's
 * notifications arriving on it.
 */
export async function upsertPushSubscription(
  input: PushSubscriptionInput,
  workosUserId: string,
  userAgent: string | null,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      workosUserId,
      userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        workosUserId,
        userAgent,
        updatedAt: new Date(),
      },
    });
}

/** Forget one browser's subscription — the "turn notifications off" path. */
export async function removePushSubscription(endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Whether this person has at least one browser enrolled. */
export async function hasPushSubscription(
  workosUserId: string,
): Promise<boolean> {
  const row = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.workosUserId, workosUserId),
    columns: { id: true },
  });
  return Boolean(row);
}

export type PushSendReport = {
  sent: number;
  /** Endpoints the push service reported gone (404/410) — deleted. */
  removed: number;
  /** Transient failures, kept for next time. */
  failed: number;
};

/**
 * Notify one person on every browser they have enrolled.
 *
 * Never throws. Endpoints the push service reports as gone are deleted
 * in place; every other failure is logged and counted, and the caller —
 * always a write that has already committed — carries on.
 */
export async function sendPushToUser(
  workosUserId: string,
  payload: PushPayload,
  /** Browsers to skip, by endpoint. Unused today; the sender's own
   * device is identified by the session, not by the subscription. */
  exceptEndpoint?: string,
): Promise<PushSendReport> {
  const report: PushSendReport = { sent: 0, removed: 0, failed: 0 };
  if (!pushConfigured()) return report;

  try {
    configureWebpush();
  } catch (error) {
    console.error("[push] configuration failed:", error);
    return report;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(
      exceptEndpoint
        ? and(
            eq(pushSubscriptions.workosUserId, workosUserId),
            ne(pushSubscriptions.endpoint, exceptEndpoint),
          )
        : eq(pushSubscriptions.workosUserId, workosUserId),
    );

  const body = JSON.stringify(payload);
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      report.sent += 1;
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : null;
      if (statusCode === 404 || statusCode === 410) {
        // The browser installation is gone — the row is dead weight.
        await removePushSubscription(sub.endpoint);
        report.removed += 1;
        console.warn(
          `[push] subscription gone (${statusCode}) — removed ${sub.id}`,
        );
      } else {
        report.failed += 1;
        console.error(`[push] delivery failed for ${sub.id}:`, error);
      }
    }
  }
  return report;
}
