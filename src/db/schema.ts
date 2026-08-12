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

export const reviewGradeEnum = pgEnum("review_grade", [
  "again",
  "hard",
  "good",
  "easy",
]);

export const aiMessageRoleEnum = pgEnum("ai_message_role", [
  "user",
  "assistant",
]);

export const studyPlanStatusEnum = pgEnum("study_plan_status", [
  "free",
  "active",
  "past_due",
  "canceled",
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
    // Set when the learner claims their account: a WorkOS login whose
    // email matches `email` links here and gets the student experience.
    workosUserId: text("workos_user_id"),
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
    index("students_workos_user_id_idx").on(t.workosUserId),
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

/**
 * Teacher-curated vocab BOOKS per student ("JLPT N4 prep", "Restaurant
 * unit") — a live shared surface: the teacher CRUDs the books, the
 * student sees them grouped in the portal and progresses through the
 * same SRS pipeline. Deleting a book frees its words (FK set null).
 */
export const vocabularyBooks = pgTable(
  "vocabulary_books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("vocabulary_books_student_id_idx").on(t.studentId)],
);

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
    /** Null = loose (not filed in a teacher book). */
    bookId: uuid("book_id").references(() => vocabularyBooks.id, {
      onDelete: "set null",
    }),
    term: text("term").notNull(),
    meaning: text("meaning"),
    translation: text("translation"),
    example: text("example"),
    language: text("language"),
    status: vocabularyStatusEnum("status").notNull().default("new"),
    // Spaced-repetition state (SM-2-lite). A null srsDueAt means the card
    // has never been reviewed — it is always due.
    srsReps: integer("srs_reps").notNull().default(0),
    srsEaseFactor: real("srs_ease_factor").notNull().default(2.5),
    srsIntervalDays: real("srs_interval_days").notNull().default(0),
    srsDueAt: timestamp("srs_due_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
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
// Vocabulary reviews — the student's practice log (evidence for the
// pipeline; one row per graded card).
// ---------------------------------------------------------------------------

export const vocabularyReviews = pgTable(
  "vocabulary_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    vocabularyItemId: uuid("vocabulary_item_id")
      .notNull()
      .references(() => vocabularyItems.id, { onDelete: "cascade" }),
    grade: reviewGradeEnum("grade").notNull(),
    intervalDays: real("interval_days").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("vocabulary_reviews_student_id_idx").on(t.studentId),
    index("vocabulary_reviews_item_id_idx").on(t.vocabularyItemId),
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
// AI companion messages — the student's practice conversations. Part of
// the learner's accumulating context (student-owned layer); grounded in
// SHARED records only, never teacher-private content.
// ---------------------------------------------------------------------------

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    role: aiMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_messages_student_created_idx").on(t.studentId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Learners — the self-serve study account (2026-08-09 self-study arc).
// Orthogonal to teacher/student: ANY WorkOS login gets a learner row on
// first visit to /study, whether or not it also owns a teacher account or
// a claimed roster row. Carries the Stripe subscription state for the
// study surface — the only billed surface in the app.
// ---------------------------------------------------------------------------

export const learners = pgTable(
  "learners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workosUserId: text("workos_user_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    /** Standing "About you" instructions — injected into EVERY chat
     * (ChatGPT Custom Instructions shape; learner-written, unlike the
     * tutor-written study_memories). */
    instructions: text("instructions"),
    /** Paused memory = stop saving AND stop injecting; rows are kept. */
    memoryEnabled: boolean("memory_enabled").notNull().default(true),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planStatus: studyPlanStatusEnum("plan_status").notNull().default("free"),
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("learners_workos_user_id_idx").on(t.workosUserId),
    uniqueIndex("learners_stripe_customer_id_idx").on(t.stripeCustomerId),
  ],
);

// ---------------------------------------------------------------------------
// Reading library — one entry per book/article the learner reads (HBR
// pieces count), holding a short summary + their atomic NOTES (below).
// Not the vocab "books" (study_vocab_lists): this is the general-learning
// shelf — what I read, what I took from it, discussable in a chat.
// Covers are generated from the title (src/lib/library-cover.ts) — no
// stored artwork.
// ---------------------------------------------------------------------------

export const studyBooks = pgTable(
  "study_books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    author: text("author"),
    /** What this book/article was about — one short paragraph. */
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("study_books_learner_id_idx").on(t.learnerId)],
);

// ---------------------------------------------------------------------------
// Study notes — atomic "what I learned" entries. One idea per row, not a
// growing blob: that's what makes recall and chat-injection work. Null
// bookId = a loose note (the standalone Notes tab); deleting a book
// frees its notes rather than destroying them (learner owns context).
// ---------------------------------------------------------------------------

export const studyNotes = pgTable(
  "study_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    bookId: uuid("book_id").references(() => studyBooks.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_notes_learner_created_idx").on(t.learnerId, t.createdAt),
    index("study_notes_book_id_idx").on(t.bookId),
  ],
);

// ---------------------------------------------------------------------------
// Study projects — ChatGPT-Projects-shaped containers: a name, optional
// language (language projects get tutor behavior + vocab grounding),
// and optional CUSTOM INSTRUCTIONS injected into every chat inside.
// ---------------------------------------------------------------------------

export const studyProjects = pgTable(
  "study_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Set → chats in this project run in language-tutor mode. */
    language: text("language"),
    /** Standing instructions injected into every chat in this project. */
    instructions: text("instructions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("study_projects_learner_id_idx").on(t.learnerId)],
);

// ---------------------------------------------------------------------------
// Study threads — one AI conversation; generic by default, tutor-flavored
// when it lives in a language project.
// ---------------------------------------------------------------------------

export const studyThreads = pgTable(
  "study_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    /** Null = a loose chat (sidebar "Chats"); deleting a project frees its chats. */
    projectId: uuid("project_id").references(() => studyProjects.id, {
      onDelete: "set null",
    }),
    /** Set = a discussion attached to a library book — the book's
     * summary + notes ride into the chat's context, and save_note files
     * there by default. Deleting the book frees the chat. */
    bookId: uuid("book_id").references(() => studyBooks.id, {
      onDelete: "set null",
    }),
    /** Copied from the project at creation; null = generic chat. */
    language: text("language"),
    title: text("title"),
    /** Pinned chats float to the top of the sidebar tree (ChatGPT-style). */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("study_threads_learner_id_idx").on(t.learnerId, t.updatedAt)],
);

export const studyMessages = pgTable(
  "study_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => studyThreads.id, { onDelete: "cascade" }),
    role: aiMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    /** Which model produced an assistant turn (null on user turns). */
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_messages_thread_created_idx").on(t.threadId, t.createdAt),
    // The daily-cap query counts a learner's user turns across all threads.
    index("study_messages_learner_created_idx").on(t.learnerId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Personal vocabulary — learner-owned, independent of any teacher roster.
// Same SM-2-lite state machine as the roster vocabulary (src/lib/srs.ts);
// status is DERIVED from review evidence, never asserted.
// ---------------------------------------------------------------------------

export const studyVocab = pgTable(
  "study_vocab",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    term: text("term").notNull(),
    /** Pronunciation aid — furigana/romaji for Japanese, IPA, etc. */
    reading: text("reading"),
    meaning: text("meaning"),
    example: text("example"),
    notes: text("notes"),
    /** Word class (Verb, Noun, Phrase, … — lib/study-vocab-categories.ts).
     * Null = uncategorized; filterable/sortable in the vocab table. */
    category: text("category"),
    status: vocabularyStatusEnum("status").notNull().default("new"),
    srsReps: integer("srs_reps").notNull().default(0),
    srsEaseFactor: real("srs_ease_factor").notNull().default(2.5),
    srsIntervalDays: real("srs_interval_days").notNull().default(0),
    srsDueAt: timestamp("srs_due_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_vocab_learner_language_idx").on(t.learnerId, t.language),
    index("study_vocab_learner_due_idx").on(t.learnerId, t.srsDueAt),
  ],
);

// ---------------------------------------------------------------------------
// Vocabulary lists — learner-curated, ORDERED collections of their own
// vocab ("Common French verbs", "Restaurant phrases", …). Position is the
// learner's manual order; deleting a word cascades it out of every list.
// ---------------------------------------------------------------------------

export const studyVocabLists = pgTable(
  "study_vocab_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Pinned books surface in the sidebar for one-tap open/quick-add. */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("study_vocab_lists_learner_id_idx").on(t.learnerId)],
);

export const studyVocabListItems = pgTable(
  "study_vocab_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => studyVocabLists.id, { onDelete: "cascade" }),
    vocabId: uuid("vocab_id")
      .notNull()
      .references(() => studyVocab.id, { onDelete: "cascade" }),
    /** Manual order within the list — contiguous from 0 per list. */
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("study_vocab_list_items_list_vocab_idx").on(t.listId, t.vocabId),
    index("study_vocab_list_items_list_position_idx").on(t.listId, t.position),
  ],
);

// ---------------------------------------------------------------------------
// Curated packs — product-shipped, read-only vocab collections ("Persona 5
// kanji", "Anime essentials"). No learner FK: global content, seeded by
// scripts/seed-packs.ts from src/content/study-packs.ts. Learners copy
// items (or whole packs) into their own vocab/lists.
// ---------------------------------------------------------------------------

export const studyPacks = pgTable(
  "study_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("study_packs_slug_idx").on(t.slug)],
);

export const studyPackItems = pgTable(
  "study_pack_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packId: uuid("pack_id")
      .notNull()
      .references(() => studyPacks.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    reading: text("reading"),
    meaning: text("meaning"),
    example: text("example"),
    category: text("category"),
    /** Curated order within the pack. */
    position: integer("position").notNull(),
  },
  (t) => [
    uniqueIndex("study_pack_items_pack_term_idx").on(t.packId, t.term),
    index("study_pack_items_pack_position_idx").on(t.packId, t.position),
  ],
);

// ---------------------------------------------------------------------------
// Study memories — durable facts the tutor saves about the learner from
// conversations (ChatGPT-memory shape): goals, level, exam dates, interests,
// how they like to learn. Injected into every chat's context; the learner
// sees and deletes them on /study/account. The learner owns this context —
// the tutor writes it via the remember/forget tools, never silently.
// ---------------------------------------------------------------------------

export const studyMemories = pgTable(
  "study_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    /** One durable fact, phrased as a short third-person sentence. */
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_memories_learner_created_idx").on(t.learnerId, t.createdAt),
  ],
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
export type VocabularyReview = typeof vocabularyReviews.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
export type Homework = typeof homework.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type Learner = typeof learners.$inferSelect;
export type StudyBook = typeof studyBooks.$inferSelect;
export type StudyNote = typeof studyNotes.$inferSelect;
export type StudyProject = typeof studyProjects.$inferSelect;
export type StudyThread = typeof studyThreads.$inferSelect;
export type StudyMessage = typeof studyMessages.$inferSelect;
export type StudyVocabItem = typeof studyVocab.$inferSelect;
export type StudyVocabList = typeof studyVocabLists.$inferSelect;
export type StudyVocabListItem = typeof studyVocabListItems.$inferSelect;
export type VocabularyBook = typeof vocabularyBooks.$inferSelect;
export type StudyPack = typeof studyPacks.$inferSelect;
export type StudyPackItem = typeof studyPackItems.$inferSelect;
export type StudyMemory = typeof studyMemories.$inferSelect;
