import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, learners } from "@/db";
import {
  billingConfigured,
  getStripe,
  planStatusFromStripe,
  stripeWebhookSecret,
} from "@/lib/billing";

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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      stripeWebhookSecret(),
    );
  } catch (error) {
    console.error("stripe webhook: signature verification failed", error);
    return Response.json({ error: "invalid_signature" }, { status: 400 });
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
        await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await applySubscription(event.data.object);
      break;
    }
    default:
      // Not a subscription-state event — acknowledged and ignored.
      break;
  }

  return Response.json({ received: true });
}
