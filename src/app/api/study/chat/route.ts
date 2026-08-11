import type { NextRequest } from "next/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studyMemories,
  studyMessages,
  studyProjects,
  studyThreads,
  studyVocab,
} from "@/db";
import { getLearner } from "@/lib/auth";
import { dailyCapFor, learnerHasPro } from "@/lib/billing";
import { countTutorMessagesLast24h } from "@/lib/study-usage";
import {
  resolveStudyModel,
  streamTutorReply,
  type TutorContext,
  type TutorTurn,
} from "@/lib/ai/study-tutor";
import { createStudyToolExecutor } from "@/lib/ai/study-tools";

const HISTORY_TURNS = 20;
const VOCAB_CONTEXT_ITEMS = 30;
const MEMORY_CONTEXT_ITEMS = 50;

const bodySchema = z.object({
  threadId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
  /** Roster-validated server-side; unknown values fall to the default. */
  model: z.string().max(80).optional(),
});

/**
 * The study tutor endpoint — streams the reply as plain-text chunks.
 * getLearner() (not the redirecting guard) is the auth line: anonymous
 * callers get a 401, never a redirect into HTML.
 */
export async function POST(req: NextRequest) {
  const learner = await getLearner();
  if (!learner) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { threadId, message } = parsed.data;
  const model = resolveStudyModel(parsed.data.model);

  const thread = await db.query.studyThreads.findFirst({
    where: and(
      eq(studyThreads.id, threadId),
      eq(studyThreads.learnerId, learner.id),
    ),
  });
  if (!thread) {
    return Response.json({ error: "thread_not_found" }, { status: 404 });
  }

  // The plan gate: rolling-24h user-message count across all threads.
  const cap = dailyCapFor(learner);
  const messagesToday = await countTutorMessagesLast24h(learner.id);
  if (messagesToday >= cap) {
    return Response.json(
      { error: "daily_cap", cap, pro: learnerHasPro(learner) },
      { status: 429 },
    );
  }

  const [inserted] = await db
    .insert(studyMessages)
    .values({
      learnerId: learner.id,
      threadId: thread.id,
      role: "user",
      content: message,
    })
    .returning({ id: studyMessages.id });

  await db
    .update(studyThreads)
    .set({
      title: thread.title ?? message.slice(0, 60),
      updatedAt: new Date(),
    })
    .where(eq(studyThreads.id, thread.id));

  // Project (if any) supplies language mode + standing instructions.
  const project = thread.projectId
    ? await db.query.studyProjects.findFirst({
        where: and(
          eq(studyProjects.id, thread.projectId),
          eq(studyProjects.learnerId, learner.id),
        ),
      })
    : null;
  const language = project?.language ?? thread.language ?? null;

  const [vocab, historyRows, memoryRows] = await Promise.all([
    language
      ? db
          .select({
            term: studyVocab.term,
            reading: studyVocab.reading,
            meaning: studyVocab.meaning,
            status: studyVocab.status,
          })
          .from(studyVocab)
          .where(
            and(
              eq(studyVocab.learnerId, learner.id),
              eq(studyVocab.language, language),
            ),
          )
          .orderBy(sql`${studyVocab.srsDueAt} asc nulls first`)
          .limit(VOCAB_CONTEXT_ITEMS)
      : Promise.resolve([]),
    db
      .select({ role: studyMessages.role, content: studyMessages.content })
      .from(studyMessages)
      .where(
        and(
          eq(studyMessages.threadId, thread.id),
          // The just-inserted user turn is passed separately.
          ne(studyMessages.id, inserted.id),
        ),
      )
      .orderBy(asc(studyMessages.createdAt)),
    // Memories ride into EVERY chat (generic and tutor alike) — that's
    // the whole point of remembering.
    db
      .select({ content: studyMemories.content })
      .from(studyMemories)
      .where(eq(studyMemories.learnerId, learner.id))
      .orderBy(asc(studyMemories.createdAt))
      .limit(MEMORY_CONTEXT_ITEMS),
  ]);

  const context: TutorContext = {
    learnerName: learner.name,
    language,
    vocab,
    projectName: project?.name ?? null,
    projectInstructions: project?.instructions ?? null,
    memories: memoryRows.map((m) => m.content),
  };
  const turns: TutorTurn[] = historyRows.slice(-HISTORY_TURNS);
  // The tutor's hands: vocabulary CRUD scoped to THIS learner, with the
  // chat's language as the default filing target.
  const executeTool = createStudyToolExecutor({
    learnerId: learner.id,
    language,
  });

  const encoder = new TextEncoder();
  let full = "";
  // Flips when the client stops the reply (composer Stop button or a
  // dropped connection) — cancel() then owns persistence of the partial.
  let cancelled = false;
  let persisted = false;
  const persistReply = async () => {
    // The sync check-and-set makes start()/cancel() racing on the same
    // turn insert at most one assistant row.
    if (persisted) return;
    persisted = true;
    try {
      await db.insert(studyMessages).values({
        learnerId: learner.id,
        threadId: thread.id,
        role: "assistant",
        content: full,
        model,
      });
    } catch (error) {
      console.error("study chat: failed to persist assistant reply", error);
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamTutorReply(context, turns, message, {
          model,
          executeTool,
        })) {
          // Breaking out also returns the provider iterator — the model
          // stops generating instead of burning tokens nobody reads.
          if (cancelled) break;
          full += delta;
          controller.enqueue(encoder.encode(delta));
        }
        if (!cancelled && !full.trim())
          throw new Error("Tutor returned no text");
      } catch (error) {
        if (cancelled) return;
        console.error("study chat: tutor stream failed", error);
        const fallback = full
          ? "\n\n(The reply was cut off — please ask again.)"
          : "Sorry — I had trouble thinking just now. Please try again in a moment.";
        full += fallback;
        try {
          controller.enqueue(encoder.encode(fallback));
        } catch (enqueueError) {
          // The client went away between the failure and the fallback.
          console.error(
            "study chat: could not deliver fallback text",
            enqueueError,
          );
        }
      }
      if (cancelled) return;
      await persistReply();
      controller.close();
    },
    async cancel() {
      cancelled = true;
      // Keep what already streamed — the turn survives a refresh the
      // same way ChatGPT keeps a stopped reply.
      if (full.trim()) await persistReply();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Study-Model": model,
    },
  });
}
