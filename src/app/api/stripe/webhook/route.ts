import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, learners } from "@/db";
import {
  billingConfigured,
  getStripe,
  planStatusFromStripe,
  stripeWebhookSecrets,
} from "@/lib/billing";
import { handleTutorEvent, isTutorSubscription } from "@/lib/tutor-webhook";

/**
 * Stripe → learner plan state. The webhook is the single writer of
 * planStatus/planRenewsAt (checkout redirects never mutate entitlement —
 * the session `success_url` is cosmetic). Signature verification is
 * mandatory; an unconfigured deployment answers 503 loudly rather than
 * pretending to accept events.
 */

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // current_period_end lives on the subscription item (Basil API shape).
  const periodEnd = sub.items.data[0]?.current_period_end;

  const updated = await db
    .update(learners)
    .set({
      stripeSubscriptionId: sub.id,
      planStatus: planStatusFromStripe(sub.status),
      planRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(learners.stripeCustomerId, customerId))
    .returning({ id: learners.id });

  if (updated.length === 0) {
    console.error(
      `stripe webhook: no learner for customer ${customerId} (subscription ${sub.id})`,
    );
  }
}

export async function POST(req: Request) {
  if (!billingConfigured()) {
    console.error(
      "stripe webhook: received an event but billing is not configured",
    );
    return Response.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "missing_signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const payload = await req.text();

  /**
   * Verify against EVERY secret this endpoint could legitimately be
   * signed with.
   *
   * Stripe scopes a webhook endpoint to your own account or to your
   * connected accounts, never both — so this same URL is registered
   * twice, and the two registrations sign with different secrets.
   * Checking only the platform one silently drops every
   * `account.updated`, which is how we learn Stripe has disabled a
   * tutor's payouts. A tutor we can no longer pay would stay listed and
   * bookable, and the money for the next lesson would have nowhere to
   * land.
   */
  let event: Stripe.Event | null = null;
  for (const secret of stripeWebhookSecrets()) {
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {
      // Wrong secret for this delivery — try the next one.
    }
  }
  if (!event) {
    console.error("stripe webhook: signature matched no configured secret");
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  /**
   * MARKETPLACE FIRST, and the order matters.
   *
   * Two products now share one endpoint: Study Pro (our subscription)
   * and tutor lessons (money passing through us to someone else). They
   * emit the same event TYPES, so the handler below has to be able to
   * tell them apart — and the dangerous direction is the one where a
   * tutor subscription reaches `applySubscription`, which matches a
   * learner by customer id and would hand out Study Pro to somebody who
   * bought a weekly lesson.
   *
   * `handleTutorEvent` returns true when it owned the event, and the
   * Study Pro path is skipped. Its own `isTutorSubscription` /
   * `isTutorCheckout` guards are what make that call, keyed on metadata
   * the tutor flows stamp at creation and Study Pro never has.
   */
  try {
    if (await handleTutorEvent(event)) {
      return Response.json({ received: true });
    }
  } catch (error) {
    console.error(`stripe webhook: tutor handler failed on ${event.type}`, error);
    // 500 so Stripe RETRIES. Swallowing this would leave a learner
    // charged for a lesson that never reached a tutor's calendar —
    // exactly the state this endpoint exists to prevent.
    return Response.json({ error: "handler_failed" }, { status: 500 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        if (!isTutorSubscription(sub)) await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      // Belt and braces: `handleTutorEvent` already claimed the tutor
      // ones, and `created` never reaches it at all.
      if (!isTutorSubscription(sub)) await applySubscription(sub);
      break;
    }
    default:
      // Not a subscription-state event — acknowledged and ignored.
      break;
  }

  return Response.json({ received: true });
}
