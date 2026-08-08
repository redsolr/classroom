"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, learners, studyThreads, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import {
  billingConfigured,
  getStripe,
  studyPriceId,
} from "@/lib/billing";
import { srsReviewPatch } from "@/lib/srs";

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

const languageSchema = z.string().trim().min(2).max(40);

export async function createStudyThread(formData: FormData) {
  const learner = await requireLearner();
  const language = languageSchema.parse(formData.get("language"));

  const [thread] = await db
    .insert(studyThreads)
    .values({ learnerId: learner.id, language })
    .returning({ id: studyThreads.id });

  redirect(`/study?t=${thread.id}`);
}

export async function toggleStudyThreadPin(threadId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);

  const thread = await db.query.studyThreads.findFirst({
    where: and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    columns: { pinned: true },
  });
  if (!thread) throw new Error("Thread not found");

  await db
    .update(studyThreads)
    .set({ pinned: !thread.pinned })
    .where(
      and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    );

  revalidatePath("/study");
}

export async function deleteStudyThread(threadId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);

  await db
    .delete(studyThreads)
    .where(
      and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    );

  revalidatePath("/study");
  redirect("/study");
}

// ---------------------------------------------------------------------------
// Personal vocabulary
// ---------------------------------------------------------------------------

const vocabSchema = z.object({
  language: languageSchema,
  term: z.string().trim().min(1).max(200),
  reading: z.string().trim().max(200).optional(),
  meaning: z.string().trim().max(500).optional(),
  example: z.string().trim().max(1000).optional(),
});

export async function addStudyVocab(formData: FormData) {
  const learner = await requireLearner();
  const parsed = vocabSchema.parse({
    language: formData.get("language"),
    term: formData.get("term"),
    reading: formData.get("reading") || undefined,
    meaning: formData.get("meaning") || undefined,
    example: formData.get("example") || undefined,
  });

  await db.insert(studyVocab).values({
    learnerId: learner.id,
    language: parsed.language,
    term: parsed.term,
    reading: parsed.reading || null,
    meaning: parsed.meaning || null,
    example: parsed.example || null,
  });

  revalidatePath("/study/vocab");
}

export async function deleteStudyVocab(vocabId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(vocabId);

  await db
    .delete(studyVocab)
    .where(and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)));

  revalidatePath("/study/vocab");
}

const gradeSchema = z.enum(["again", "hard", "good", "easy"]);

/**
 * Flashcard review — same SM-2-lite engine and evidence-derived status
 * pipeline as the roster vocabulary (src/lib/srs.ts).
 */
export async function reviewStudyVocab(
  vocabId: string,
  grade: "again" | "hard" | "good" | "easy",
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(vocabId);
  const parsedGrade = gradeSchema.parse(grade);

  const item = await db.query.studyVocab.findFirst({
    where: and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)),
  });
  if (!item) throw new Error("Vocabulary item not found");

  const now = new Date();
  const patch = srsReviewPatch(
    {
      reps: item.srsReps,
      easeFactor: item.srsEaseFactor,
      intervalDays: item.srsIntervalDays,
    },
    parsedGrade,
    now,
  );

  await db
    .update(studyVocab)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)));

  // Deliberately NOT revalidating /study/vocab/review: the review page
  // hands the client a session snapshot of the due deck, and refreshing
  // it mid-session yanks cards out from under the learner (and re-queues
  // "again" cards early). A fresh visit re-queries anyway.
  revalidatePath("/study/vocab");
}

// ---------------------------------------------------------------------------
// Billing — Stripe Checkout + customer portal. Throws loudly when Stripe
// is not configured; the account page only renders these buttons when
// billingConfigured() is true.
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3020";

export async function startStudyCheckout() {
  const learner = await requireLearner();
  if (!billingConfigured()) {
    throw new Error(
      "Billing is not configured — set the STRIPE_* environment variables.",
    );
  }
  const stripe = getStripe();

  let customerId = learner.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: learner.email,
      name: learner.name ?? undefined,
      metadata: { learnerId: learner.id },
    });
    customerId = customer.id;
    await db
      .update(learners)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(learners.id, learner.id));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: studyPriceId(), quantity: 1 }],
    success_url: `${APP_URL}/study/account?checkout=success`,
    cancel_url: `${APP_URL}/study/account?checkout=canceled`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");

  redirect(session.url);
}

export async function openStudyBillingPortal() {
  const learner = await requireLearner();
  if (!billingConfigured()) {
    throw new Error(
      "Billing is not configured — set the STRIPE_* environment variables.",
    );
  }
  if (!learner.stripeCustomerId) {
    throw new Error("No Stripe customer for this learner yet.");
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: learner.stripeCustomerId,
    return_url: `${APP_URL}/study/account`,
  });

  redirect(session.url);
}
