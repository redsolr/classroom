import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { format } from "date-fns";
import {
  BadgeCheck,
  Brain,
  CreditCard,
  Gauge,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { db, studyMemories } from "@/db";
import {
  deleteAllStudyMemories,
  deleteStudyMemory,
  setStudyMemoryEnabled,
  updateStudyInstructions,
} from "@/lib/actions/study";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Textarea } from "@/components/ui/field";
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
import { countTutorMessagesLast24h } from "@/lib/study-usage";
import { SubmitButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

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

  const usedToday = await countTutorMessagesLast24h(learner.id);

  const memories = await db
    .select({
      id: studyMemories.id,
      content: studyMemories.content,
      createdAt: studyMemories.createdAt,
    })
    .from(studyMemories)
    .where(eq(studyMemories.learnerId, learner.id))
    .orderBy(asc(studyMemories.createdAt));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <PageHeader title="Account" subtitle={learner.name ?? learner.email} />

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

      <section className="mb-5 rounded-lg bg-surface p-5 shadow-card">
        <h2 className="mb-1 flex items-center gap-2 text-[1.0625rem] font-semibold">
          <UserRound className="size-4 text-fg-tertiary" />
          About you
        </h2>
        <p className="text-[0.9375rem] leading-relaxed text-fg-secondary">
          Standing instructions the tutor follows in every chat — level,
          goals, how you like to be taught.
        </p>
        <form action={updateStudyInstructions} className="mt-3">
          <Field label="Standing instructions">
            <Textarea
              name="instructions"
              rows={3}
              maxLength={4000}
              defaultValue={learner.instructions ?? ""}
              placeholder="e.g. I'm an upper-beginner aiming for JLPT N3 — correct every mistake, keep replies short."
            />
          </Field>
          <div className="mt-2 flex justify-end">
            <SubmitButton>Save instructions</SubmitButton>
          </div>
        </form>
      </section>

      <section className="mb-5 rounded-lg bg-surface p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <h2 className="mb-1 flex items-center gap-2 text-[1.0625rem] font-semibold">
            <Brain className="size-4 text-fg-tertiary" />
            Memory
          </h2>
          <form
            action={setStudyMemoryEnabled.bind(null, !learner.memoryEnabled)}
          >
            <SubmitButton>
              {learner.memoryEnabled ? "Pause memory" : "Resume memory"}
            </SubmitButton>
          </form>
        </div>
        <p className="text-[0.9375rem] leading-relaxed text-fg-secondary">
          The tutor remembers durable facts you share in chat — goals, exam
          dates, how you like to learn — and uses them in every
          conversation. Tell it to remember or forget things in chat, or
          delete saved memories here.
        </p>
        {!learner.memoryEnabled && (
          <p className="mt-2 text-[0.875rem] font-medium text-fg-tertiary">
            Memory is paused — nothing new is saved and saved memories are
            not used until you resume.
          </p>
        )}
        {memories.length === 0 ? (
          <p className="mt-3 text-[0.875rem] text-fg-tertiary">
            Nothing saved yet. Try telling the tutor something worth
            remembering.
          </p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-border">
              {memories.map((memory) => (
                <li
                  key={memory.id}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <div>
                    <p className="text-[0.9375rem]">{memory.content}</p>
                    <p className="mt-0.5 text-[0.78rem] text-fg-tertiary">
                      Saved {format(memory.createdAt, "d MMM yyyy")}
                    </p>
                  </div>
                  <ConfirmButton
                    title="Delete memory"
                    action={deleteStudyMemory.bind(null, memory.id)}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end border-t border-border pt-3">
              <ConfirmButton
                title="Delete all memories"
                action={deleteAllStudyMemories}
              />
            </div>
          </>
        )}
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
