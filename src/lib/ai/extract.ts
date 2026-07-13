import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  Correction,
  Goal,
  Homework,
  Insight,
  Student,
  VocabularyItem,
} from "@/db";
import { lessonDraftSchema, type LessonDraft } from "./draft-schema";

const MODEL = process.env.CLASSROOM_AI_MODEL ?? "claude-opus-4-8";

export type StudentContext = {
  student: Student;
  goals: Goal[];
  recentCorrections: Correction[];
  recentVocabulary: VocabularyItem[];
  openHomework: Homework[];
  recentInsights: Insight[];
};

/**
 * Concise student context for the extraction prompt — recent, relevant
 * records only; never the student's entire lifetime history.
 */
function renderStudentContext(ctx: StudentContext): string {
  const s = ctx.student;
  const lines: string[] = [
    `Name: ${s.name}`,
    `Target language: ${s.targetLanguage}${s.currentLevel ? ` (current level: ${s.currentLevel})` : ""}${s.targetLevel ? `, target level ${s.targetLevel}` : ""}`,
  ];
  if (s.nativeLanguage) lines.push(`Native language: ${s.nativeLanguage}`);
  if (ctx.goals.length > 0) {
    lines.push(`Goals: ${ctx.goals.map((g) => g.title).join("; ")}`);
  }
  if (ctx.recentInsights.length > 0) {
    lines.push(
      `Known observations: ${ctx.recentInsights
        .slice(0, 8)
        .map((i) => `${i.title} (${i.type})`)
        .join("; ")}`,
    );
  }
  if (ctx.recentCorrections.length > 0) {
    lines.push(
      `Recent corrections: ${ctx.recentCorrections
        .slice(0, 10)
        .map((c) => `"${c.originalText}" → "${c.correctedText}"`)
        .join("; ")}`,
    );
  }
  if (ctx.recentVocabulary.length > 0) {
    lines.push(
      `Recently introduced vocabulary: ${ctx.recentVocabulary
        .slice(0, 15)
        .map((v) => v.term)
        .join(", ")}`,
    );
  }
  if (ctx.openHomework.length > 0) {
    lines.push(
      `Outstanding homework: ${ctx.openHomework.map((h) => h.title).join("; ")}`,
    );
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are the lesson-notes assistant inside Class-room, a private workspace for independent language tutors. The teacher pastes rough notes, chat logs, or a transcript from a lesson; you extract a structured draft the teacher will review, edit, and approve.

Rules:
- Extract only what the input supports. Never invent mistakes, vocabulary, or homework that the input does not evidence.
- When speaker labels exist, distinguish teacher speech from student speech; only the student's own errors become corrections. Example sentences the teacher gave for illustration are NOT student errors.
- Preserve the target language exactly — accents, particles, spelling.
- Mark a correction with "uncertain": true when you cannot tell whether it was a real student error.
- "insights" are longer-term observations that may span lessons (recurring mistakes, learning preferences, interests, strengths, weaknesses, teaching strategies) — internal to the teacher, never shown to the student.
- "studentRecapDraft" is a warm, professional summary written TO the student ("you"/their name), covering what was worked on and what to review. It must contain no internal teacher observations.
- "nextLessonSuggestion" is 1-3 sentences for the teacher about what to focus on next, informed by the student context.
- "summary" is 2-4 sentences for the teacher's records, third person.
- If the input is too thin to support a section, return an empty array (or a brief honest summary) rather than padding.`;

async function extractWithClaude(
  rawInput: string,
  context: StudentContext,
): Promise<LessonDraft> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<student_context>\n${renderStudentContext(context)}\n</student_context>\n\n<lesson_input>\n${rawInput}\n</lesson_input>\n\nExtract the structured lesson draft.`,
      },
    ],
    output_config: {
      format: zodOutputFormat(lessonDraftSchema),
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to process this input.");
  }
  if (!response.parsed_output) {
    throw new Error("AI extraction returned no parseable output.");
  }
  return response.parsed_output;
}

/**
 * Deterministic fallback used when no ANTHROPIC_API_KEY is configured —
 * keeps local dev and demos free and offline. Parses common note
 * conventions: "wrong -> right" corrections, "vocab:"/"hw:" prefixes.
 */
function extractWithMock(rawInput: string, context: StudentContext): LessonDraft {
  const lines = rawInput
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const corrections: LessonDraft["corrections"] = [];
  const vocabulary: LessonDraft["vocabulary"] = [];
  const homework: LessonDraft["homework"] = [];
  const topics: LessonDraft["topics"] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const arrow = line.split(/->|→/);
    if (arrow.length === 2 && arrow[0].trim() && arrow[1].trim()) {
      corrections.push({
        category: "grammar",
        originalText: arrow[0].trim().replace(/^[-*•]\s*/, ""),
        correctedText: arrow[1].trim(),
        explanation: null,
        uncertain: false,
      });
    } else if (lower.startsWith("vocab:") || lower.startsWith("word:")) {
      const term = line.slice(line.indexOf(":") + 1).trim();
      if (term) {
        vocabulary.push({
          term,
          meaning: null,
          translation: null,
          example: null,
          language: context.student.targetLanguage,
        });
      }
    } else if (lower.startsWith("hw:") || lower.startsWith("homework:")) {
      const title = line.slice(line.indexOf(":") + 1).trim();
      if (title) homework.push({ title, description: null });
    } else if (lower.startsWith("topic:")) {
      const title = line.slice(line.indexOf(":") + 1).trim();
      if (title) topics.push({ title, description: null });
    }
  }

  const firstLine = lines[0] ?? "Lesson notes";
  return {
    summary: `Lesson with ${context.student.name}. Notes: ${firstLine.slice(0, 140)}${corrections.length > 0 ? ` ${corrections.length} correction(s) captured.` : ""}`,
    topics,
    corrections,
    vocabulary,
    homework,
    insights: [],
    nextLessonSuggestion:
      corrections.length > 0
        ? `Review the ${corrections.length} correction(s) from this lesson before introducing new material.`
        : "Review this lesson's notes and continue with the current goal.",
    studentRecapDraft: `Great work today, ${context.student.name}! We covered ${topics.length > 0 ? topics.map((t) => t.title).join(", ") : "several useful points"}.${corrections.length > 0 ? " Take a look at the corrections below and try using the right forms this week." : ""}${homework.length > 0 ? ` Your homework: ${homework.map((h) => h.title).join("; ")}.` : ""}`,
  };
}

export async function extractLessonDraft(
  rawInput: string,
  context: StudentContext,
): Promise<LessonDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return extractWithMock(rawInput, context);
  }
  return extractWithClaude(rawInput, context);
}

export function aiModeLabel(): "claude" | "mock" {
  return process.env.ANTHROPIC_API_KEY ? "claude" : "mock";
}
