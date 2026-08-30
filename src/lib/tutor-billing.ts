import type Stripe from "stripe";
import { getStripe } from "@/lib/billing";

/**
 * STRIPE CONNECT — the wiring that lets a tutor be paid by a learner
 * without the money ever being ours.
 *
 * This is deliberately a separate module from `lib/billing.ts`. That one
 * owns Study Pro: OUR product, OUR subscription, one Stripe account.
 * This one owns marketplace money, which has a different failure mode
 * and a different moral weight — a bug in Study Pro overcharges us a
 * customer; a bug here takes a learner's money for a lesson a tutor
 * never gets paid for. Two concerns, two files, no shared helpers that
 * could quietly start serving both.
 *
 * ── Why Express accounts ───────────────────────────────────────────
 *
 * Stripe hosts onboarding, identity verification and the payouts
 * dashboard. We collect no bank details, store no tax IDs, and take on
 * none of the KYC obligations that come with holding them. For a pilot
 * of a handful of tutors that is not a shortcut, it is the only
 * defensible option: we are not a licensed money transmitter and should
 * never build anything that pretends otherwise.
 *
 * ── No fallbacks ───────────────────────────────────────────────────
 *
 * Every function here throws when Stripe is missing or refuses.
 * Marketplace money never degrades gracefully: a booking that cannot be
 * paid for must fail visibly at the moment of booking, not succeed and
 * leave someone owed. Same standing rule as Study Pro billing.
 */

export function connectConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3020";
}

/**
 * Create the tutor's connected account. Called once; the id is stored on
 * their profile and everything afterwards refers to it.
 */
export async function createConnectedAccount(input: {
  email: string;
  country?: string;
}): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    // `express` is the type; `controller` defaults suit it. Fees are
    // taken as application fees on destination charges, so the platform
    // is the one Stripe bills — see lib/tutor-pricing.ts for why we
    // chose to absorb processing rather than push it to the tutor.
    type: "express",
    email: input.email,
    // Two-letter ISO country. Stripe needs it at creation and it cannot
    // be changed afterwards, which is why the listing form asks for it
    // before anything else.
    country: input.country,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    business_type: "individual",
  });
  return account.id;
}

/**
 * A fresh onboarding link. These EXPIRE (minutes), so one is minted per
 * click rather than stored — a saved link is a support ticket waiting to
 * happen.
 */
export async function onboardingLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${appUrl()}/teaching/payouts?refresh=1`,
    return_url: `${appUrl()}/teaching/payouts?done=1`,
  });
  return link.url;
}

/** The Express dashboard, where a tutor sees their own payouts. */
export async function payoutDashboardLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

/**
 * Stripe's own answer to "can this account be paid".
 *
 * `payouts_enabled` and `charges_enabled` both matter and they are not
 * the same: an account can be allowed to take money before it is allowed
 * to receive it, and listing a tutor in that window means a learner pays
 * for a lesson whose money is stuck. Both, or not bookable.
 */
export function accountIsReady(account: Stripe.Account): boolean {
  return Boolean(account.payouts_enabled && account.charges_enabled);
}

export async function fetchAccount(accountId: string): Promise<Stripe.Account> {
  return getStripe().accounts.retrieve(accountId);
}

/**
 * ONE LESSON, paid once — a destination charge.
 *
 * `transfer_data.destination` sends the tutor's share to their account
 * and `application_fee_amount` keeps ours. Note what is NOT here:
 * `on_behalf_of`. Setting it would make the tutor the merchant of record
 * and push Stripe's processing fee onto them — which is how most
 * marketplaces do it, and which would make every tutor's earnings figure
 * an estimate until settlement, because Stripe's fee is not known when
 * the charge is created. We take the variable number instead so theirs
 * is exact. See lib/tutor-pricing.ts.
 */
export async function createLessonCheckout(input: {
  customerId: string;
  destinationAccountId: string;
  grossCents: number;
  platformFeeCents: number;
  currency: string;
  productName: string;
  description: string;
  bookingId: string;
  successPath: string;
  cancelPath: string;
}): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: input.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.grossCents,
          product_data: {
            name: input.productName,
            description: input.description,
          },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: input.platformFeeCents,
      transfer_data: { destination: input.destinationAccountId },
      // The booking id rides on the PAYMENT INTENT, not only on the
      // session: `payment_intent.succeeded` is the event that proves
      // money moved, and it must be able to find its booking without a
      // second lookup through a session that may already be expired.
      metadata: { bookingId: input.bookingId },
    },
    metadata: { bookingId: input.bookingId },
    success_url: `${appUrl()}${input.successPath}`,
    cancel_url: `${appUrl()}${input.cancelPath}`,
    // A checkout that outlives the slot hold would let someone pay for
    // an hour we already released. Stripe's floor is 30 minutes, so the
    // hold is what actually governs; this stops a stale tab paying days
    // later.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  if (!session.url) {
    throw new Error("Stripe returned a checkout session with no URL");
  }
  return session.url;
}

/**
 * A STANDING WEEKLY SLOT, billed monthly at the recurring discount.
 *
 * The subscription's application fee is a PERCENT rather than a fixed
 * amount, because a subscription renews on its own: a fixed fee stamped
 * today would be wrong the first time the tutor changes their rate, and
 * nobody would notice until the numbers stopped adding up.
 */
export async function createRecurringCheckout(input: {
  customerId: string;
  destinationAccountId: string;
  monthlyCents: number;
  feePercent: number;
  currency: string;
  productName: string;
  description: string;
  teacherId: string;
  learnerId: string;
  weekday: number;
  startMinute: number;
  lessonsPerMonth: number;
  discountPercent: number;
  successPath: string;
  cancelPath: string;
}): Promise<string> {
  const stripe = getStripe();
  const metadata = {
    teacherId: input.teacherId,
    learnerId: input.learnerId,
    weekday: String(input.weekday),
    startMinute: String(input.startMinute),
    lessonsPerMonth: String(input.lessonsPerMonth),
    discountPercent: String(input.discountPercent),
  };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.monthlyCents,
          recurring: { interval: "month" },
          product_data: {
            name: input.productName,
            description: input.description,
          },
        },
      },
    ],
    subscription_data: {
      application_fee_percent: input.feePercent,
      transfer_data: { destination: input.destinationAccountId },
      metadata,
    },
    metadata,
    success_url: `${appUrl()}${input.successPath}`,
    cancel_url: `${appUrl()}${input.cancelPath}`,
  });
  if (!session.url) {
    throw new Error("Stripe returned a checkout session with no URL");
  }
  return session.url;
}

/**
 * What Stripe actually charged us for a payment.
 *
 * Only knowable after the fact: the fee lives on the balance
 * transaction, which does not exist when the charge succeeds. Until this
 * resolves, our own take is shown as an estimate and labelled one —
 * which is why the ledger's `stripeFeeCents` is nullable rather than
 * pre-filled with a guess.
 */
export async function actualStripeFee(
  paymentIntentId: string,
): Promise<{ chargeId: string; feeCents: number } | null> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") return null;
  const txn = charge.balance_transaction;
  if (!txn || typeof txn === "string") return null;
  return { chargeId: charge.id, feeCents: txn.fee };
}
