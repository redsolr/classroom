/**
 * What a learner wants out of a lesson.
 *
 * A closed set rather than free text, for two reasons that both pay off
 * on the tutor's side: the prep sheet can read it, and the learner's
 * NEXT booking arrives prefilled from it — which is most of why the
 * booking modal asks at all.
 *
 * It lives in its own plain module rather than beside the booking action
 * because everything exported from a `"use server"` file has to be an
 * async function; a constant there is a build error, and a constant
 * DUPLICATED into the component would be a validation schema and a set
 * of buttons that drift apart the first time somebody adds an option.
 */
export const LESSON_FOCUS_OPTIONS = [
  "Conversation",
  "Grammar",
  "Pronunciation",
  "Vocabulary",
  "Exam prep",
  "Writing",
  "Business",
] as const;

export type LessonFocus = (typeof LESSON_FOCUS_OPTIONS)[number];
