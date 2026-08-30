/**
 * WHAT EVERY PARTY GETS — the one place a lesson's money is divided.
 *
 * Pure arithmetic, no Stripe import, no env reads at module scope beyond
 * the configured rates: it is imported by server actions, by the webhook
 * and by client components that show the breakdown before anyone pays,
 * and all three must agree to the cent. A split computed twice is a
 * split that eventually disagrees with itself.
 *
 * ── The money model ────────────────────────────────────────────────
 *
 * A lesson is a Stripe DESTINATION CHARGE: the payment is created on our
 * platform account with `transfer_data.destination` pointing at the
 * tutor's connected (Express) account, and our commission taken as
 * `application_fee_amount`.
 *
 * Which means the three shares are:
 *
 *   learner pays    gross
 *   tutor receives  gross − platformFee          ← EXACT, known now
 *   we receive      platformFee − stripeFee      ← exact once Stripe says
 *
 * Stripe's processing fee comes out of OUR side, not the tutor's. That
 * is a deliberate choice and it costs us real money: `on_behalf_of`
 * would have made the tutor the merchant of record and pushed card fees
 * onto them, the way most marketplaces do it. But Stripe's fee is not
 * knowable when the charge is created — it lands on the balance
 * transaction afterwards — so shifting it to the tutor would mean every
 * tutor's earnings line was an ESTIMATE until settlement. A tutor
 * should never have to wonder what they earned. We take the variable
 * number; they get an exact one.
 *
 * So `stripeFeeCents` is nullable in the ledger, and it is OUR number
 * that is provisional, never theirs.
 *
 * ── Why a recurring lesson is cheaper ──────────────────────────────
 *
 * Not generosity, and not a growth lever. A standing weekly hour is the
 * scarcest thing a tutor sells: it is the slot they can no longer offer
 * anyone else. The learner buying it is paying for certainty as much as
 * for teaching, and both sides are better off when that trade is priced.
 */

/** Read a percentage from env with a loud failure, never a silent default. */
function percentFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${name} must be a percentage 0-100, got "${raw}"`);
  }
  return parsed;
}

/**
 * Our commission, as a percentage of what the learner pays.
 *
 * 15% is the pilot number and it is deliberately below the 18-33% the
 * incumbents charge: during a pilot the tutors are doing us the favour,
 * not the other way round. It is env-tunable because repricing a pilot
 * must not be a deploy — and stamped onto every payment row at the time
 * it is taken, so changing it never rewrites history.
 */
export const PLATFORM_FEE_PERCENT = percentFromEnv(
  "TUTOR_PLATFORM_FEE_PERCENT",
  15,
);

/** What a standing weekly slot saves against booking the same lessons one
 * at a time. Stamped onto the subscription at signup for the same reason. */
export const RECURRING_DISCOUNT_PERCENT = percentFromEnv(
  "TUTOR_RECURRING_DISCOUNT_PERCENT",
  10,
);

/**
 * Stripe's published rate, used ONLY to estimate our own take before
 * settlement. It is never stored as though it were the real fee, and it
 * is never used to compute what the tutor receives — see the header.
 * Cards from other countries and currency conversion both push the real
 * number above this, which is exactly why it stays labelled an estimate.
 */
const STRIPE_FEE_PERCENT = percentFromEnv("STRIPE_FEE_PERCENT", 2.9);
const STRIPE_FEE_FIXED_CENTS = (() => {
  const raw = process.env.STRIPE_FEE_FIXED_CENTS;
  if (raw === undefined || raw === "") return 30;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `STRIPE_FEE_FIXED_CENTS must be a non-negative integer, got "${raw}"`,
    );
  }
  return parsed;
})();

export type LessonSplit = {
  /** What the learner is charged. */
  grossCents: number;
  /** Our commission — an exact number, taken as the application fee. */
  platformFeeCents: number;
  /** What reaches the tutor. Exact: gross minus our fee, nothing else. */
  tutorNetCents: number;
  /** Stripe's cut, ESTIMATED. Null-equivalent until the webhook knows. */
  estimatedStripeFeeCents: number;
  /** What we keep after Stripe, estimated for the same reason. */
  estimatedPlatformNetCents: number;
};

/** Round half-up on a positive amount — `Math.round` is enough here, and
 * being explicit about it matters when the number is somebody's pay. */
function cents(value: number): number {
  return Math.round(value);
}

/**
 * Divide one lesson's price between the three parties.
 *
 * The tutor's share is computed by SUBTRACTION, never by its own
 * percentage: `gross − fee` can never disagree with `fee`, whereas two
 * independent roundings can leave or invent a cent.
 */
export function splitLesson(grossCents: number): LessonSplit {
  if (!Number.isInteger(grossCents) || grossCents <= 0) {
    throw new Error(
      `splitLesson needs a positive integer amount, got ${grossCents}`,
    );
  }
  const platformFeeCents = cents((grossCents * PLATFORM_FEE_PERCENT) / 100);
  const estimatedStripeFeeCents = cents(
    (grossCents * STRIPE_FEE_PERCENT) / 100 + STRIPE_FEE_FIXED_CENTS,
  );
  return {
    grossCents,
    platformFeeCents,
    tutorNetCents: grossCents - platformFeeCents,
    estimatedStripeFeeCents,
    estimatedPlatformNetCents: platformFeeCents - estimatedStripeFeeCents,
  };
}

/** The per-lesson price of a standing weekly slot. */
export function recurringLessonPrice(rateCents: number): number {
  return cents((rateCents * (100 - RECURRING_DISCOUNT_PERCENT)) / 100);
}

/** What a month of a standing slot costs, at the discounted rate. */
export function recurringMonthlyPrice(
  rateCents: number,
  lessonsPerMonth: number,
): number {
  return recurringLessonPrice(rateCents) * lessonsPerMonth;
}

/**
 * Money for humans. Intl over a hand-rolled `$${n / 100}` because the
 * pilot already spans currencies with different minor units, and a
 * hard-coded two decimal places is wrong in yen before it is wrong
 * anywhere interesting.
 */
export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
