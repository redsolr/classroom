import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const studentStatusEnum = pgEnum("student_status", [
  "active",
  "trial",
  "paused",
  "inactive",
]);

export const goalStatusEnum = pgEnum("goal_status", [
  "active",
  "completed",
  "paused",
]);

export const goalPriorityEnum = pgEnum("goal_priority", [
  "high",
  "medium",
  "low",
]);

export const lessonStatusEnum = pgEnum("lesson_status", [
  "draft",
  "processed",
  "reviewed",
  "shared",
  "scheduled",
  "cancelled",
]);

export const attendanceOutcomeEnum = pgEnum("attendance_outcome", [
  "attended",
  "student_no_show",
  "teacher_no_show",
  "late_cancel",
]);

export const lessonSourceTypeEnum = pgEnum("lesson_source_type", [
  "manual",
  "notes",
  "chat",
  "transcript",
  "audio",
]);

export const correctionCategoryEnum = pgEnum("correction_category", [
  "grammar",
  "vocabulary",
  "pronunciation",
  "wordChoice",
  "naturalExpression",
  "spelling",
  "other",
]);

export const vocabularyStatusEnum = pgEnum("vocabulary_status", [
  "new",
  "learning",
  "reviewing",
  "mastered",
]);

export const homeworkStatusEnum = pgEnum("homework_status", [
  "assigned",
  "submitted",
  "reviewed",
  "completed",
  "skipped",
]);

export const insightTypeEnum = pgEnum("insight_type", [
  "recurringMistake",
  "learningPreference",
  "interest",
  "strength",
  "weakness",
  "teachingStrategy",
  "generalObservation",
]);

// ---------------------------------------------------------------------------
// Teachers — the account owner. One account = one independent teacher.
// ---------------------------------------------------------------------------

export const teachers = pgTable(
  "teachers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workosUserId: text("workos_user_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    timezone: text("timezone"),
    nativeLanguage: text("native_language"),
    languagesTaught: text("languages_taught").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("teachers_workos_user_id_idx").on(t.workosUserId)],
);

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    avatarColor: text("avatar_color"),
    nativeLanguage: text("native_language"),
    targetLanguage: text("target_language").notNull(),
    currentLevel: text("current_level"),
    targetLevel: text("target_level"),
    status: studentStatusEnum("status").notNull().default("active"),
    timezone: text("timezone"),
    platform: text("platform"),
    lessonFrequency: text("lesson_frequency"),
    generalNotes: text("general_notes"),
    // Persistent portal access — presence of a token means the portal is
    // live; regenerating revokes the old link, null disables it.
    portalToken: text("portal_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("students_teacher_id_idx").on(t.teacherId),
    uniqueIndex("students_portal_token_idx").on(t.portalToken),
  ],
);

// ---------------------------------------------------------------------------
// Learning goals
// ---------------------------------------------------------------------------

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: goalStatusEnum("status").notNull().default("active"),
    priority: goalPriorityEnum("priority").notNull().default("medium"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("goals_student_id_idx").on(t.studentId)],
);

// ---------------------------------------------------------------------------
// Lessons — the central event. `aiDraft` holds the un-approved structured
// extraction; approved items get their own rows in the record tables below.
// ---------------------------------------------------------------------------

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    title: text("title"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    status: lessonStatusEnum("status").notNull().default("draft"),
    attendanceOutcome: attendanceOutcomeEnum("attendance_outcome"),
    rescheduledFromLessonId: uuid("rescheduled_from_lesson_id").references(
      (): AnyPgColumn => lessons.id,
      { onDelete: "set null" },
    ),
    sourceType: lessonSourceTypeEnum("source_type").notNull().default("notes"),
    rawInput: text("raw_input"),
    teacherPrivateNotes: text("teacher_private_notes"),
    summary: text("summary"),
    studentVisibleSummary: text("student_visible_summary"),
    nextLessonFocus: text("next_lesson_focus"),
    aiDraft: jsonb("ai_draft"),
    aiProcessedAt: timestamp("ai_processed_at", { withTimezone: true }),
    recapToken: text("recap_token"),
    recapMessage: text("recap_message"),
    recapSharedAt: timestamp("recap_shared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lessons_teacher_id_idx").on(t.teacherId),
    index("lessons_student_id_idx").on(t.studentId),
    uniqueIndex("lessons_recap_token_idx").on(t.recapToken),
  ],
);

// ---------------------------------------------------------------------------
// Lesson topics
// ---------------------------------------------------------------------------

export const lessonTopics = pgTable(
  "lesson_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lesson_topics_lesson_id_idx").on(t.lessonId)],
);

// ---------------------------------------------------------------------------
// Corrections — tied to a lesson, part of the student's long-term history.
// ---------------------------------------------------------------------------

export const corrections = pgTable(
  "corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    category: correctionCategoryEnum("category").notNull().default("grammar"),
    originalText: text("original_text").notNull(),
    correctedText: text("corrected_text").notNull(),
    explanation: text("explanation"),
    teacherApproved: boolean("teacher_approved").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("corrections_student_id_idx").on(t.studentId),
    index("corrections_lesson_id_idx").on(t.lessonId),
  ],
);

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const vocabularyItems = pgTable(
  "vocabulary_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    term: text("term").notNull(),
    meaning: text("meaning"),
    translation: text("translation"),
    example: text("example"),
    language: text("language"),
    status: vocabularyStatusEnum("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("vocabulary_items_student_id_idx").on(t.studentId),
    index("vocabulary_items_lesson_id_idx").on(t.lessonId),
  ],
);

// ---------------------------------------------------------------------------
// Homework
// ---------------------------------------------------------------------------

export const homework = pgTable(
  "homework",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: homeworkStatusEnum("status").notNull().default("assigned"),
    teacherFeedback: text("teacher_feedback"),
    submissionText: text("submission_text"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("homework_student_id_idx").on(t.studentId),
    index("homework_lesson_id_idx").on(t.lessonId),
  ],
);

// ---------------------------------------------------------------------------
// Student insights — persistent memory that spans lessons.
// ---------------------------------------------------------------------------

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    type: insightTypeEnum("type").notNull().default("generalObservation"),
    title: text("title").notNull(),
    description: text("description"),
    sourceLessonId: uuid("source_lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    confidence: real("confidence"),
    teacherApproved: boolean("teacher_approved").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("insights_student_id_idx").on(t.studentId)],
);

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type Teacher = typeof teachers.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type LessonTopic = typeof lessonTopics.$inferSelect;
export type Correction = typeof corrections.$inferSelect;
export type VocabularyItem = typeof vocabularyItems.$inferSelect;
export type Homework = typeof homework.$inferSelect;
export type Insight = typeof insights.$inferSelect;
