import { z } from "zod";

/**
 * The structured lesson draft — what AI extraction produces and what the
 * teacher reviews/edits before anything is written to permanent records.
 * The same schema validates the (possibly edited) draft on save.
 */

export const draftTopicSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
});

export const draftCorrectionSchema = z.object({
  category: z.enum([
    "grammar",
    "vocabulary",
    "pronunciation",
    "wordChoice",
    "naturalExpression",
    "spelling",
    "other",
  ]),
  originalText: z.string(),
  correctedText: z.string(),
  explanation: z.string().nullable().optional(),
  uncertain: z.boolean().nullable().optional(),
});

export const draftVocabularySchema = z.object({
  term: z.string(),
  meaning: z.string().nullable().optional(),
  translation: z.string().nullable().optional(),
  example: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
});

export const draftHomeworkSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
});

export const draftInsightSchema = z.object({
  type: z.enum([
    "recurringMistake",
    "learningPreference",
    "interest",
    "strength",
    "weakness",
    "teachingStrategy",
    "generalObservation",
  ]),
  title: z.string(),
  description: z.string().nullable().optional(),
});

export const lessonDraftSchema = z.object({
  summary: z.string(),
  topics: z.array(draftTopicSchema),
  corrections: z.array(draftCorrectionSchema),
  vocabulary: z.array(draftVocabularySchema),
  homework: z.array(draftHomeworkSchema),
  insights: z.array(draftInsightSchema),
  nextLessonSuggestion: z.string(),
  studentRecapDraft: z.string(),
});

export type LessonDraft = z.infer<typeof lessonDraftSchema>;
