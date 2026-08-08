import type { Metadata } from "next";
import { format } from "date-fns";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { BadgeCheck, CreditCard, Gauge, TriangleAlert } from "lucide-react";
import { db, studyMessages } from "@/db";
import {
  billingConfigured,
  FREE_DAILY_CAP,
  learnerHasPro,
  PRO_DAILY_CAP,
} from "@/lib/billing";
import {
  openStudyBillingPortal,
  startStudyCheckout,
} from "@/lib/actions/study";
import { STUDY_MODEL, STUDY_MODELS } from "@/lib/ai/study-tutor";
import { requireLearner } from "@/lib/auth";
import { SubmitButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account" };

export default async function StudyAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const learner = await requireLearner();
  const { checkout } = await searchParams;

  const pro = learnerHasPro(learner);
  const cap = pro ? PRO_DAILY_CAP : FREE_DAILY_CAP;

  const [{ value: usedToday }] = await db
    .select({ value: count() })
    .from(studyMessages)
    .where(
      and(
        eq(studyMessages.learnerId, learner.id),
        eq(studyMessages.role, "user"),
        gte(studyMessages.createdAt, sql`now() - interval '24 hours'`),
      ),
    );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-[1.625rem] font-semibold tracking-tight">Account</h1>
      <p className="mt-1 mb-6 text-[0.9375rem] text-fg-secondary">
        {learner.name ?? learner.email}
      </p>

      {checkout === "success" && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-border-strong bg-accent-soft px-4 py-3 text-[0.9375rem]">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent-text" />
          <span>
            Payment received — your plan updates within a few seconds of
            Stripe&rsquo;s confirmation. Refresh if this page still shows
            Free.
          </span>
        </div>
      )}
      {checkout === "canceled" && (
        <div className="mb-5 rounded-lg border border-border-strong bg-surface px-4 py-3 text-[0.9375rem] text-fg-secondary">
          Checkout canceled — no charge was made.
        </div>
      )}

      <section className="mb-5 rounded-lg bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.0625rem] font-semibold">
              {pro ? "Study Pro" : "Free plan"}
            </h2>
            <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
              {pro
                ? learner.planRenewsAt
                  ? `Renews ${format(learner.planRenewsAt, "d MMM yyyy")}`
                  : "Active subscription"
                : `${FREE_DAILY_CAP} tutor messages per day. Vocabulary and review are always free.`}
            </p>
            {learner.planStatus === "past_due" && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[0.875rem] text-danger">
                <TriangleAlert className="size-3.5" />
                Your last payment failed — fix it in the billing portal to
                restore Pro.
              </p>
            )}
          </div>

          {billingConfigured() ? (
            pro || learner.stripeCustomerId ? (
              <form action={openStudyBillingPortal}>
                <SubmitButton>
                  <CreditCard className="size-4" />
                  Manage billing
                </SubmitButton>
              </form>
            ) : (
              <form action={startStudyCheckout}>
                <SubmitButton>Upgrade to Study Pro</SubmitButton>
              </form>
            )
          ) : (
            <p className="max-w-55 text-[0.8125rem] text-fg-tertiary">
              Billing is not configured on this deployment (STRIPE_* env vars
              missing) — the free tier applies.
            </p>
          )}
        </div>
      </section>

      <section className="mb-5 rounded-lg bg-surface p-5 shadow-card">
        <h2 className="mb-1 flex items-center gap-2 text-[1.0625rem] font-semibold">
          <Gauge className="size-4 text-fg-tertiary" />
          Usage
        </h2>
        <p className="text-[0.9375rem] text-fg-secondary">
          {usedToday} of {cap} tutor messages in the last 24 hours.
        </p>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, (usedToday / cap) * 100)}%` }}
          />
        </div>
      </section>

      <section className="rounded-lg bg-surface p-5 shadow-card">
        <h2 className="mb-1 text-[1.0625rem] font-semibold">Models</h2>
        <p className="text-[0.9375rem] leading-relaxed text-fg-secondary">
          Pick the model per message in the chat composer. Available:{" "}
          {STUDY_MODELS.map((m, i) => (
            <span key={m}>
              {i > 0 && " · "}
              <span className="font-medium">{m}</span>
              {m === STUDY_MODEL && " (default)"}
            </span>
          ))}
          . Cheaper models drill vocabulary just fine — save the big one for
          explanations that aren&rsquo;t landing.
        </p>
      </section>
    </div>
  );
}
