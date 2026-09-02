import type { NextRequest } from "next/server";
import { z } from "zod";
import { getLearner } from "@/lib/auth";
import {
  removePushSubscription,
  upsertPushSubscription,
  pushConfigured,
} from "@/lib/push";

/**
 * Enrol (POST) or forget (DELETE) one browser's push subscription.
 *
 * The subscription is stored against the CALLER's WorkOS id, taken from
 * the session — never from the body. A client that can name whose
 * notifications a browser receives is a client that can subscribe itself
 * to someone else's messages.
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(req: NextRequest) {
  const learner = await getLearner();
  if (!learner) return new Response("Unauthorized", { status: 401 });
  if (!pushConfigured()) {
    // Nothing could ever be delivered, so storing the row would only
    // make the UI claim notifications are on.
    return new Response("Push is not configured", { status: 503 });
  }

  const parsed = subscriptionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response("Invalid subscription", { status: 400 });
  }

  await upsertPushSubscription(
    parsed.data,
    learner.workosUserId,
    req.headers.get("user-agent"),
  );
  return new Response(null, { status: 204 });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

export async function DELETE(req: NextRequest) {
  const learner = await getLearner();
  if (!learner) return new Response("Unauthorized", { status: 401 });

  const parsed = unsubscribeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response("Invalid subscription", { status: 400 });
  }

  // Deliberately keyed on the endpoint alone: the person turning a
  // subscription off is holding the browser it belongs to, and refusing
  // to forget one because the row is stamped with somebody else's id
  // would strand notifications on a shared machine with no way to stop
  // them. Nothing is disclosed by the delete.
  await removePushSubscription(parsed.data.endpoint);
  return new Response(null, { status: 204 });
}
