import { format } from "date-fns";
import type { StudentProfile } from "@/lib/queries";

export type VocabularyPipeline = {
  new: number;
  learning: number;
  reviewing: number;
  mastered: number;
  total: number;
};

export type LessonCorrectionRow = {
  lessonId: string;
  label: string;
  count: number;
};

export type CategoryCount = { category: string; count: number };

export type StudentProgress = {
  vocabulary: VocabularyPipeline;
  homework: { done: number; total: number };
  goals: { completed: number; total: number };
  /** Corrections per lesson, oldest → newest, for the most recent lessons. */
  correctionsPerLesson: LessonCorrectionRow[];
  /** Most frequent correction categories across the whole record. */
  topCategories: CategoryCount[];
};

const LESSON_WINDOW = 8;

/** Deterministic progress read-model — counts and trends only, no judgments. */
export function buildProgress(profile: StudentProfile): StudentProgress {
  const vocabulary: VocabularyPipeline = {
    new: 0,
    learning: 0,
    reviewing: 0,
    mastered: 0,
    total: profile.vocabulary.length,
  };
  for (const item of profile.vocabulary) vocabulary[item.status] += 1;

  const homeworkDone = profile.homework.filter((h) =>
    ["completed", "reviewed"].includes(h.status),
  ).length;

  const goalsCompleted = profile.goals.filter(
    (g) => g.status === "completed",
  ).length;

  const correctionsByLesson = new Map<string, number>();
  for (const c of profile.corrections) {
    if (!c.lessonId) continue;
    correctionsByLesson.set(
      c.lessonId,
      (correctionsByLesson.get(c.lessonId) ?? 0) + 1,
    );
  }
  // profile.lessons is newest-first; window then flip to chronological.
  const correctionsPerLesson = profile.lessons
    .slice(0, LESSON_WINDOW)
    .map((l) => ({
      lessonId: l.id,
      label: format(l.startedAt, "MMM d"),
      count: correctionsByLesson.get(l.id) ?? 0,
    }))
    .reverse();

  const categoryCounts = new Map<string, number>();
  for (const c of profile.corrections) {
    categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1);
  }
  const topCategories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    vocabulary,
    homework: { done: homeworkDone, total: profile.homework.length },
    goals: { completed: goalsCompleted, total: profile.goals.length },
    correctionsPerLesson,
    topCategories,
  };
}
