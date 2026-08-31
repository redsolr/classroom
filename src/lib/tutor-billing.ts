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
 *
 * ACCOUNTS V2, and not for fashion. Stripe refuses v1 account creation
 * for new Connect integrations outright — "Stripe no longer recommends
 * Accounts v1 for new Connect integrations. Create connected accounts
 * with POST /v2/core/accounts instead" — and only restores it behind a
 * compatibility switch. Building on the path a provider is walking away
 * from buys a forced migration later, which is why this repo's rule is
 * to take the provider's current recommendation.
 *
 * WHY THIS EXACT SHAPE, WHICH IS NOT THE ONE THE DOCS LEAD WITH.
 *
 * The obvious translation of the old `type: "express"` is
 * `dashboard: "express"`, and it cannot be used here. Express requires
 * the PLATFORM to be loss-liable, and Stripe blocks that for Thai
 * platforms outright:
 *
 *   "Platforms in TH cannot create accounts where the platform is
 *    loss-liable, due to risk control measures."
 *
 * Probing every combination against a Thai platform leaves exactly one
 * that Stripe accepts:
 *
 *   dashboard: none · fees_collector: application · losses_collector: stripe
 *
 * So this is not a v1-vs-v2 choice. Express was never available to us —
 * the old `type: "express"` call would have failed the same way the
 * moment it ran, and the failure would have looked like a Stripe outage
 * rather than a country rule.
 *
 * What it costs and what it does not: we still collect our commission
 * (`fees_collector: application` is what keeps `application_fee_amount`
 * working on destination charges), and Stripe carries dispute losses
 * instead of us, which for a pilot is a better trade than the one we
 * thought we were making. What we lose is the Express DASHBOARD —
 * `dashboard: "none"` means Stripe hosts no payouts UI for the tutor,
 * so `payoutDashboardLink` sends them to Stripe's hosted account form
 * instead, and their earnings live on our own page.
 *
 * The account still reads back through the v1 endpoints — `fetchAccount`
 * and `accountIsReady` are unchanged, because Stripe returns a v2
 * account in v1 shape when a v1 endpoint asks for it.
 */
export async function createConnectedAccount(input: {
  email: string;
  country?: string;
}): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.create({
    contact_email: input.email,
    // Two-letter ISO country, lowercase for v2. Stripe needs it at
    // creation and it cannot be changed afterwards, which is why the
    // listing form asks for it before anything else.
    identity: {
      country: (input.country ?? "th").toLowerCase(),
      entity_type: "individual",
    },
    configuration: {
      // `recipient` is what lets the account be paid by a destination
      // charge; `merchant` is not optional alongside it — Stripe refuses
      // stripe_transfers without card_payments.
      merchant: { capabilities: { card_payments: { requested: true } } },
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    defaults: {
      responsibilities: {
        fees_collector: "application",
        losses_collector: "stripe",
      },
    },
    dashboard: "none",
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

/**
 * Where a tutor manages their own payout details.
 *
 * NOT a login link: `createLoginLink` needs an Express dashboard, and a
 * Thai platform cannot create Express accounts (see
 * `createConnectedAccount`). Stripe's hosted account form is the
 * equivalent that exists — it is where they change a bank account or
 * clear a new requirement. What they EARNED is on our own page, from
 * `tutor_payments`, which is the more honest source anyway: it is the
 * ledger we bill from.
 */
export async function payoutDashboardLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_update",
    refresh_url: `${appUrl()}/teaching/payouts?refresh=1`,
    return_url: `${appUrl()}/teaching/payouts?done=1`,
  });
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
