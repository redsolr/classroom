"use server";

import { revalidatePath } from "next/cache";

/**
 * The sidebar chat tree is layout data (all three authed layouts fetch
 * it) — every thread/project mutation must revalidate the LAYOUT tree,
 * or action redirects (soft navigations) leave the sidebar stale.
 * Learned from e2e: a fresh project was invisible until a hard reload.
 */
function revalidateStudyTree() {
  revalidatePath("/", "layout");
}
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, learners, studyProjects, studyThreads, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import {
  billingConfigured,
  getStripe,
  studyPriceId,
} from "@/lib/billing";
import { srsReviewPatch } from "@/lib/srs";

// ---------------------------------------------------------------------------
// Projects — ChatGPT-Projects-shaped: name + optional language (tutor
// mode) + optional standing instructions injected into every chat.
// ---------------------------------------------------------------------------

const languageSchema = z.string().trim().min(2).max(40);

const projectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  language: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  instructions: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

function parseProjectForm(formData: FormData) {
  return projectSchema.parse({
    name: formData.get("name"),
    language: formData.get("language") || undefined,
    instructions: formData.get("instructions") || undefined,
  });
}

export async function createStudyProject(formData: FormData) {
  const learner = await requireLearner();
  const parsed = parseProjectForm(formData);

  const [project] = await db
    .insert(studyProjects)
    .values({
      learnerId: learner.id,
      name: parsed.name,
      language: parsed.language ?? null,
      instructions: parsed.instructions ?? null,
    })
    .returning({ id: studyProjects.id });

  revalidateStudyTree();
  redirect(`/study/project/${project.id}`);
}

export async function updateStudyProject(
  projectId: string,
  formData: FormData,
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(projectId);
  const parsed = parseProjectForm(formData);

  const updated = await db
    .update(studyProjects)
    .set({
      name: parsed.name,
      language: parsed.language ?? null,
      instructions: parsed.instructions ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(studyProjects.id, id), eq(studyProjects.learnerId, learner.id)),
    )
    .returning({ id: studyProjects.id });
  if (updated.length === 0) throw new Error("Project not found");

  revalidatePath(`/study/project/${id}`);
  revalidateStudyTree();
}

/** Chats survive project deletion (FK sets project_id null → "Chats"). */
export async function deleteStudyProject(projectId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(projectId);

  await db
    .delete(studyProjects)
    .where(
      and(eq(studyProjects.id, id), eq(studyProjects.learnerId, learner.id)),
    );

  revalidateStudyTree();
  redirect("/study");
}

// ---------------------------------------------------------------------------
// Threads — generic by default; created inside a project they inherit
// its language (tutor mode).
// ---------------------------------------------------------------------------

export async function createStudyThread(formData: FormData) {
  const learner = await requireLearner();
  const projectId = formData.get("projectId");

  let project: { id: string; language: string | null } | undefined;
  if (projectId) {
    const id = z.string().uuid().parse(projectId);
    project = await db.query.studyProjects.findFirst({
      where: and(
        eq(studyProjects.id, id),
        eq(studyProjects.learnerId, learner.id),
      ),
      columns: { id: true, language: true },
    });
    if (!project) throw new Error("Project not found");
  }

  // Legacy path (pre-projects forms): a bare language creates a loose
  // tutor chat.
  const rawLanguage = formData.get("language");
  const language =
    project?.language ??
    (rawLanguage ? languageSchema.parse(rawLanguage) : null);

  // ChatGPT behavior: reuse an existing EMPTY chat in the same container
  // instead of stacking blank "French chat" rows on every tap.
  const [existingEmpty] = await db
    .select({ id: studyThreads.id })
    .from(studyThreads)
    .where(
      and(
        eq(studyThreads.learnerId, learner.id),
        project
          ? eq(studyThreads.projectId, project.id)
          : isNull(studyThreads.projectId),
        sql`not exists (select 1 from study_messages m where m.thread_id = ${studyThreads.id})`,
      ),
    )
    .limit(1);
  if (existingEmpty) {
    redirect(`/study?t=${existingEmpty.id}`);
  }

  const [thread] = await db
    .insert(studyThreads)
    .values({
      learnerId: learner.id,
      projectId: project?.id ?? null,
      language,
    })
    .returning({ id: studyThreads.id });

  revalidateStudyTree();
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

  revalidateStudyTree();
}

export async function deleteStudyThread(threadId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);

  await db
    .delete(studyThreads)
    .where(
      and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    );

  revalidateStudyTree();
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
