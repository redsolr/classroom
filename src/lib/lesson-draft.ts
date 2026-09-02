import { and, desc, eq, inArray } from "drizzle-orm";
import {
  corrections,
  db,
  goals,
  homework,
  insights,
  lessons,
  vocabularyItems,
} from "@/db";
import { extractLessonDraft, type StudentContext } from "@/lib/ai/extract";
import { loadLessonTranscript } from "@/lib/lesson-transcript-queries";
import { getStudent } from "@/lib/queries";
import { composeExtractionInput, renderTranscript } from "@/lib/transcript";

/**
 * ONE EXTRACTION LOOP, two callers.
 *
 * The teacher's "Process with AI" button and the recording pipeline both
 * arrive here. Before the pipeline existed this lived inside the server
 * action, behind `requireTeacher()` — which is right for a button and
 * impossible for a webhook. Moving the work out, and leaving the
 * authentication where it was, is what lets a transcript feed the SAME
 * draft → review → approve loop the teacher has used for typed notes
 * since day one, rather than a second pipeline with its own review UI.
 *
 * The caller has already established that `teacherId` owns `lessonId`.
 * Every query here is still narrowed to that teacher, so a mistake
 * upstream cannot read another roster.
 */

export type DraftOutcome =
  | { ok: true; hadTranscript: boolean }
  | { ok: false; error: string };

/**
 * The student's recent, relevant record — what the extractor is told
 * about the person before it reads the lesson. Bounded on purpose:
 * never the whole lifetime history.
 */
export async function loadStudentContext(
  teacherId: string,
  studentId: string,
): Promise<StudentContext | null> {
  const student = await getStudent(teacherId, studentId);
  if (!student) return null;

  const [
    studentGoals,
    recentCorrections,
    recentVocabulary,
    openHomework,
    recentInsights,
  ] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.teacherId, teacherId),
          eq(goals.studentId, studentId),
          eq(goals.status, "active"),
        ),
      ),
    db
      .select()
      .from(corrections)
      .where(
        and(
          eq(corrections.teacherId, teacherId),
          eq(corrections.studentId, studentId),
        ),
      )
      .orderBy(desc(corrections.createdAt))
      .limit(10),
    db
      .select()
      .from(vocabularyItems)
      .where(
        and(
          eq(vocabularyItems.teacherId, teacherId),
          eq(vocabularyItems.studentId, studentId),
        ),
      )
      .orderBy(desc(vocabularyItems.createdAt))
      .limit(15),
    db
      .select()
      .from(homework)
      .where(
        and(
          eq(homework.teacherId, teacherId),
          eq(homework.studentId, studentId),
          inArray(homework.status, ["assigned", "submitted"]),
        ),
      ),
    db
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.teacherId, teacherId),
          eq(insights.studentId, studentId),
        ),
      )
      .orderBy(desc(insights.updatedAt))
      .limit(8),
  ]);

  return {
    student,
    goals: studentGoals,
    recentCorrections,
    recentVocabulary,
    openHomework,
    recentInsights,
  };
}

/**
 * Draft the lesson's records from everything we hold about the hour.
 *
 * The input is the teacher's typed notes (if any) plus the transcript
 * rendered fresh from its rows (if any). The transcript is never copied
 * into `raw_input`: that column stays the teacher's own words, and a
 * transcript that lived there would be appended a second time by the
 * first re-run. The draft lands on `ai_draft` for review — nothing here
 * writes a correction, a word or an insight; only the teacher's approval
 * does, exactly as before.
 *
 * Throws when the model call fails (the caller decides whether that is
 * a message to a person or a retry on a sweep's clock); returns
 * `ok: false` only when there is nothing to extract from.
 */
export async function draftLessonFromEvidence(args: {
  lessonId: string;
  teacherId: string;
}): Promise<DraftOutcome> {
  const lesson = await db.query.lessons.findFirst({
    where: and(
      eq(lessons.id, args.lessonId),
      eq(lessons.teacherId, args.teacherId),
    ),
  });
  if (!lesson) return { ok: false, error: "Lesson not found." };

  const context = await loadStudentContext(args.teacherId, lesson.studentId);
  if (!context) return { ok: false, error: "Student not found." };

  const { placed } = await loadLessonTranscript(lesson.id);
  const transcript = renderTranscript(placed, {
    teacher: "Teacher",
    student: context.student.name,
  });
  const input = composeExtractionInput(lesson.rawInput, transcript);
  if (!input) {
    return {
      ok: false,
      error: "Nothing to extract yet — add some notes, or record the lesson.",
    };
  }

  const draft = await extractLessonDraft(input, context);

  const hadTranscript = transcript.length > 0;
  await db
    .update(lessons)
    .set({
      aiDraft: draft,
      aiProcessedAt: new Date(),
      // A lesson someone has already reviewed or shared keeps that
      // status; the draft still lands for review. Anything earlier — a
      // scheduled call that was recorded, a draft, a previous
      // processing — is now "processed": it happened, and there is a
      // draft waiting.
      ...(["scheduled", "draft", "processed"].includes(lesson.status)
        ? { status: "processed" as const }
        : {}),
      // Where the evidence came from. A recorded call outranks pasted
      // notes as the source, even when both are present.
      ...(hadTranscript ? { sourceType: "audio" as const } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(lessons.id, args.lessonId), eq(lessons.teacherId, args.teacherId)),
    );

  return { ok: true, hadTranscript };
}
