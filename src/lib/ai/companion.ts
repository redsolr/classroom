import Anthropic from "@anthropic-ai/sdk";
import type {
  Correction,
  Goal,
  Homework,
  Lesson,
  Student,
  VocabularyItem,
} from "@/db";

const MODEL = process.env.CLASSROOM_AI_MODEL ?? "claude-opus-4-8";

/**
 * The companion's grounding context — the teacher–student SHARED layer
 * only. Teacher-private material (insights, private notes, next-lesson
 * planning, raw lesson input) must never reach the student-facing AI.
 */
export type CompanionContext = {
  student: Student;
  goals: Goal[];
  recentCorrections: Correction[];
  vocabulary: VocabularyItem[];
  openHomework: Homework[];
  /** Only lessons with a shared, student-visible summary. */
  recentSharedLessons: Pick<Lesson, "startedAt" | "studentVisibleSummary">[];
};

function renderCompanionContext(ctx: CompanionContext): string {
  const s = ctx.student;
  const lines: string[] = [
    `Student: ${s.name}`,
    `Learning: ${s.targetLanguage}${s.currentLevel ? ` (current level ${s.currentLevel})` : ""}${s.targetLevel ? `, aiming for ${s.targetLevel}` : ""}`,
  ];
  if (s.nativeLanguage) lines.push(`Native language: ${s.nativeLanguage}`);
  if (ctx.goals.length > 0)
    lines.push(`Goals: ${ctx.goals.map((g) => g.title).join("; ")}`);
  if (ctx.recentCorrections.length > 0)
    lines.push(
      `Recent corrections from their teacher: ${ctx.recentCorrections
        .slice(0, 10)
        .map((c) => `"${c.originalText}" → "${c.correctedText}"`)
        .join("; ")}`,
    );
  if (ctx.vocabulary.length > 0)
    lines.push(
      `Vocabulary they are learning: ${ctx.vocabulary
        .slice(0, 20)
        .map((v) => (v.meaning ? `${v.term} (${v.meaning})` : v.term))
        .join(", ")}`,
    );
  if (ctx.openHomework.length > 0)
    lines.push(
      `Open homework: ${ctx.openHomework.map((h) => h.title).join("; ")}`,
    );
  if (ctx.recentSharedLessons.length > 0)
    lines.push(
      `Recent lesson recaps: ${ctx.recentSharedLessons
        .slice(0, 2)
        .map((l) => l.studentVisibleSummary)
        .filter(Boolean)
        .join(" | ")}`,
    );
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are the study companion inside Class-room, a private learning workspace. You are talking directly to a language student between their lessons with their human teacher.

Who you are:
- A warm, encouraging practice partner and explainer — never a replacement for the teacher. The teacher teaches; you accompany.
- You know this student's real learning history (provided as context): their corrections, vocabulary, homework, and goals. Ground everything you say in it.

Rules:
- Practice and explain using the words and corrections THIS student is actually learning. Weave their vocabulary into conversation naturally.
- If they repeat a mistake their teacher already corrected, gently point to the correction they were given.
- Encourage honestly, never assess: you never declare level changes, grades, or mastery — that is the teacher's call.
- Nudge them toward their open homework when relevant, but don't nag.
- For brand-new topics beyond their current material, give a helpful taste and suggest bringing it to their teacher for the next lesson.
- Reply in short, conversational messages (a few sentences). Match the student's language choice; when they practice the target language, respond in it at their level.
- Never invent history that isn't in the context.`;

export type CompanionTurn = { role: "user" | "assistant"; content: string };

async function replyWithClaude(
  context: CompanionContext,
  history: CompanionTurn[],
  message: string,
): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `${SYSTEM_PROMPT}\n\n<student_context>\n${renderCompanionContext(context)}\n</student_context>`,
    messages: [...history, { role: "user" as const, content: message }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("AI companion returned no text.");
  return text;
}

/**
 * Deterministic fallback when no ANTHROPIC_API_KEY is configured — keeps
 * local dev, demos, and e2e free and offline, and demonstrably grounded:
 * it references the student's own vocabulary and corrections.
 */
function replyWithMock(context: CompanionContext): string {
  const parts: string[] = [
    `Great to see you, ${context.student.name}! Let's practice your ${context.student.targetLanguage}.`,
  ];
  const vocab = context.vocabulary[0];
  if (vocab) {
    parts.push(`Try using the word “${vocab.term}” in a sentence.`);
  }
  const correction = context.recentCorrections[0];
  if (correction) {
    parts.push(
      `And remember what your teacher corrected: say “${correction.correctedText}”, not “${correction.originalText}”.`,
    );
  }
  const hw = context.openHomework[0];
  if (hw) {
    parts.push(`(Your homework “${hw.title}” is still open, by the way!)`);
  }
  return parts.join(" ");
}

export async function generateCompanionReply(
  context: CompanionContext,
  history: CompanionTurn[],
  message: string,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return replyWithMock(context);
  }
  return replyWithClaude(context, history, message);
}
