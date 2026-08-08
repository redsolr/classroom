import Stripe from "stripe";
import type { Learner } from "@/db";

/**
 * Stripe wiring for the study subscription — the only billed surface in
 * the app (the teacher workspace stays free; the 2026-07-14 "no billing"
 * lock was reversed BY THE FOUNDER on 2026-08-09 for the self-study arc).
 *
 * Billing has no fallbacks: either Stripe is fully configured and the
 * subscribe flow works, or the account page says plainly that billing is
 * not configured and the free-tier caps apply. Checkout with missing
 * config throws — it never quietly no-ops.
 */

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRICE_ID = process.env.STRIPE_STUDY_PRICE_ID;

export function billingConfigured(): boolean {
  return Boolean(SECRET_KEY && WEBHOOK_SECRET && PRICE_ID);
}

export function getStripe(): Stripe {
  if (!SECRET_KEY) {
    throw new Error(
      "Stripe is not configured (STRIPE_SECRET_KEY missing). Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_STUDY_PRICE_ID.",
    );
  }
  return new Stripe(SECRET_KEY);
}

export function studyPriceId(): string {
  if (!PRICE_ID) {
    throw new Error(
      "Stripe is not configured (STRIPE_STUDY_PRICE_ID missing).",
    );
  }
  return PRICE_ID;
}

export function stripeWebhookSecret(): string {
  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Stripe is not configured (STRIPE_WEBHOOK_SECRET missing).",
    );
  }
  return WEBHOOK_SECRET;
}

/** Entitlement is exactly "Stripe says the subscription is active". */
export function learnerHasPro(learner: Pick<Learner, "planStatus">): boolean {
  return learner.planStatus === "active";
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

/**
 * Rolling-24h caps on tutor messages. The free cap is the product line
 * (try it, then subscribe); the pro cap is an abuse brake so one leaked
 * session can never run an unbounded LLM bill.
 */
export const FREE_DAILY_CAP = intFromEnv("STUDY_FREE_DAILY_CAP", 10);
export const PRO_DAILY_CAP = intFromEnv("STUDY_PRO_DAILY_CAP", 500);

export function dailyCapFor(learner: Pick<Learner, "planStatus">): number {
  return learnerHasPro(learner) ? PRO_DAILY_CAP : FREE_DAILY_CAP;
}

/** Map a Stripe subscription status onto the learner plan enum. */
export function planStatusFromStripe(
  status: Stripe.Subscription.Status,
): "active" | "past_due" | "canceled" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}
