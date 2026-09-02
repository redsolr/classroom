import { sql } from "drizzle-orm";
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

/** Whether a tutor is visible in the learner-facing directory. */
export const tutorListingStatusEnum = pgEnum("tutor_listing_status", [
  "draft",
  "listed",
  "paused",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  /** Held, not paid. Expires — see BOOKING_HOLD_MINUTES. */
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
]);

/** One lesson, or a standing weekly slot billed monthly at a discount. */
export const bookingPlanEnum = pgEnum("booking_plan", ["single", "recurring"]);

export const tutorPaymentStatusEnum = pgEnum("tutor_payment_status", [
  "pending",
  "succeeded",
  "refunded",
  "failed",
]);

export const tutorSubscriptionStatusEnum = pgEnum(
  "tutor_subscription_status",
  ["active", "past_due", "canceled"],
);

/** What a path step asks the learner to do. */
export const pathStepKindEnum = pgEnum("path_step_kind", [
  /** Learn an official book's words. */
  "pack",
  /** Drill the sentence cards built from a book. */
  "sentences",
  /** Have a conversation with the tutor about something. */
  "chat",
  /** Book a lesson with a human tutor. */
  "lesson",
]);

/** Which card a review or a run was over. */
export const studyCardKindEnum = pgEnum("study_card_kind", [
  "word",
  "sentence",
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
// first visit to /chat, whether or not it also owns a teacher account or
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
// BOOKS — the container, and the app's one meaning of the word.
//
// This table used to be the READING LIST only, while `study_vocab_lists`
// was separately shown to learners as "Books". Two tables, one word, in
// a product whose stated rule is one word one meaning — and the 2026-08-29
// naming pass killed "Dictionary" and "Curated lists" while walking past
// this one.
//
// They are merged here (2026-08-30, founder decision). A book is a
// container that holds:
//
//   decks   — the word lists you drill (study_decks, below)
//   notes   — atomic Notion-style notes (study_notes, unchanged)
//   reading — whether you have read it, which is now a FLAG on the
//             container rather than a separate kind of thing
//
// The tell that this was the right merge: `study_notes.book_id` already
// pointed here and did not have to move. Notes were hanging off the
// right table the whole time; there just wasn't a deck beside them.
//
// Covers stay generated from the title (no stored artwork, no uploads —
// the standing "organize MEANING, not files" cut).
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
    /** What this book is about — one short paragraph. */
    summary: text("summary"),
    /** Pinned books surface in the sidebar for one-tap open. */
    pinned: boolean("pinned").notNull().default(false),
    /**
     * Set = the learner has READ this. The reading list is now a filter
     * over books rather than its own table, which is what lets a book
     * you read carry the words you took out of it.
     */
    readAt: timestamp("read_at", { withTimezone: true }),
    /**
     * Presence of a token means the book has a live public link; null
     * disables it, and regenerating revokes the old one. Same shape as
     * the student portal's `students.portal_token`, deliberately: a
     * revocable capability URL is a pattern this codebase already has,
     * already tests, and already knows the failure modes of.
     *
     * Read-only by design. Collaborative editing needs the realtime
     * transport decision that is still open (docs/realtime-collab.md),
     * and shipping a share link does not require answering it.
     */
    shareToken: text("share_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_books_learner_id_idx").on(t.learnerId),
    uniqueIndex("study_books_share_token_idx").on(t.shareToken),
  ],
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
// DECKS — an ordered list of the learner's own words, and the thing you
// actually drill.
//
// This was `study_vocab_lists`, shown to learners as "Books". The rename
// is the founder's own sentence: "books is a container, decks is just a
// vocab list that you can Anki through". A deck is the small unit — the
// forty words from chapter one — and a book is what holds several of
// them next to your notes.
//
// `bookId` is NULLABLE: a loose deck is still legal, because the fastest
// way to start is a pile of words with nowhere to put them yet, and
// forcing a container first is exactly the friction that stops people
// saving the word.
//
// Position is the learner's manual order; deleting a word cascades it
// out of every deck.
// ---------------------------------------------------------------------------

export const studyDecks = pgTable(
  "study_decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    /** The book this deck sits in. SET NULL, never cascade: deleting a
     * book must not destroy the words inside it — the deck comes loose
     * and keeps every card's review history. */
    bookId: uuid("book_id").references(() => studyBooks.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    /** Pinned decks surface in the sidebar for one-tap open/quick-add. */
    pinned: boolean("pinned").notNull().default(false),
    /** The deck a one-tap save files into, on top of the word joining the
     * vocabulary (the "liked" layer). At most one per learner — the
     * partial unique index below is the enforcement, not app code. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_decks_learner_id_idx").on(t.learnerId),
    index("study_decks_book_id_idx").on(t.bookId),
    uniqueIndex("study_decks_one_default_idx")
      .on(t.learnerId)
      .where(sql`${t.isDefault}`),
  ],
);

export const studyDeckItems = pgTable(
  "study_deck_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => studyDecks.id, { onDelete: "cascade" }),
    vocabId: uuid("vocab_id")
      .notNull()
      .references(() => studyVocab.id, { onDelete: "cascade" }),
    /** Manual order within the deck — contiguous from 0 per deck. */
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("study_deck_items_deck_vocab_idx").on(t.deckId, t.vocabId),
    index("study_deck_items_deck_position_idx").on(t.deckId, t.position),
  ],
);

// ---------------------------------------------------------------------------
// DECK RUNS — one row per finished drill, so a session can end with
// something to say.
//
// The drill used to finish on a blank "nothing due" screen, which is the
// least interesting moment in the app to say nothing: the learner has
// just done the work and is deciding whether to do it again tomorrow.
// A run row is what lets the last card show how THIS session went and
// how it compares to the best one.
//
// Only COMPLETED runs are written. A session abandoned halfway is not a
// record anyone should be measured against, and counting it would make
// the "best" number depend on how often you got interrupted.
//
// Cram rounds are excluded for the same reason they are excluded from
// scheduling (Anki convention, `loadStudyPracticeDeck`): they are
// schedule-neutral practice, and letting them set records would mean the
// way to a perfect score is to drill the easy deck repeatedly.
// ---------------------------------------------------------------------------

export const studyDeckRuns = pgTable(
  "study_deck_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    /** Null = a run over "All words" or all sentences, which have no
     * deck row of their own. SET NULL so deleting a deck doesn't erase
     * the fact that you did the work. */
    deckId: uuid("deck_id").references(() => studyDecks.id, {
      onDelete: "set null",
    }),
    kind: studyCardKindEnum("kind").notNull(),
    /** Cards answered in this run. */
    cards: integer("cards").notNull(),
    /** Answered anything but "again" — the same definition the retention
     * figure uses, so two numbers in one product can't disagree. */
    correct: integer("correct").notNull(),
    /** Longest unbroken correct streak within the run. */
    bestStreak: integer("best_streak").notNull().default(0),
    /** Wall-clock, for "you did 20 cards in four minutes". */
    durationMs: integer("duration_ms"),
    finishedAt: timestamp("finished_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_deck_runs_learner_deck_idx").on(t.learnerId, t.deckId),
    index("study_deck_runs_learner_time_idx").on(t.learnerId, t.finishedAt),
  ],
);

// ---------------------------------------------------------------------------
// Sentence cards — a SECOND card type, not a second app.
//
// A word card asks "what does this mean". A sentence card asks whether you
// can still supply the word when it's load-bearing inside real language —
// which is the thing knowing a word actually means. Anki calls this a cloze
// deletion; almost nobody writes them by hand, which is exactly why the
// tutor generates them from words the learner already owns.
//
// Its own table, not a `kind` column on study_vocab: the two share a
// scheduler (src/lib/srs.ts) and nothing else. A sentence has no reading, no
// word class, no book membership rows, and its own text shape.
// ---------------------------------------------------------------------------

export const studySentences = pgTable(
  "study_sentences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    /** The sentence, with EXACTLY ONE `{{…}}` span marking what's tested
     * (Anki's own convention — human-editable, and a model can emit it
     * reliably, which character offsets are not). */
    text: text("text").notNull(),
    /** What the whole sentence means — the context check's answer key. */
    translation: text("translation"),
    /** Optional grammar/usage aside shown with the answer. */
    note: text("note"),
    /** The word this was built around, when it came from one. SET NULL,
     * not cascade: deleting a word must not silently destroy sentences
     * the learner has been reviewing for weeks. */
    vocabId: uuid("vocab_id").references(() => studyVocab.id, {
      onDelete: "set null",
    }),
    /** The deck it was generated from, so a deck can have its own
     * sentence deck. SET NULL for the same reason. */
    deckId: uuid("deck_id").references(() => studyDecks.id, {
      onDelete: "set null",
    }),
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
    index("study_sentences_learner_due_idx").on(t.learnerId, t.srsDueAt),
    index("study_sentences_learner_deck_idx").on(t.learnerId, t.deckId),
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
    /** Editorial shelf ("anime" | "games" | "everyday"), authored in
     * `src/content/study-packs.ts` and synced by the seeder. Plain text
     * rather than an enum: adding a shelf is a content decision, and it
     * should not need a migration to make one. */
    theme: text("theme"),
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
// STUDY REVIEWS — the learner's practice log, and the evidence every
// progress number is derived from.
//
// The roster side has had `vocabulary_reviews` since the teaching loop
// shipped; the learner side never did, because the card row itself
// carried enough state to schedule the next repetition. Scheduling is
// not the same question as PROGRESS: the card knows when it is next due,
// and nothing knew whether the learner showed up on Tuesday, or whether
// they are getting more of them right than they were a month ago.
//
// So: one row per graded answer, written by the single grading funnel
// (`lib/srs-review.ts`) so a card type cannot be added that forgets to
// log. Retention, streaks and the activity trend all read from here and
// from nowhere else — which is what lets every one of them be traced
// back to something the learner actually did.
//
// Both card FKs are nullable and SET NULL: deleting a word must not
// erase the fact that you practised that day. `kind` is stored so the
// row still says what it was after its card is gone.
// ---------------------------------------------------------------------------

export const studyReviews = pgTable(
  "study_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    kind: studyCardKindEnum("kind").notNull(),
    vocabId: uuid("vocab_id").references(() => studyVocab.id, {
      onDelete: "set null",
    }),
    sentenceId: uuid("sentence_id").references(() => studySentences.id, {
      onDelete: "set null",
    }),
    grade: reviewGradeEnum("grade").notNull(),
    /** The interval the answer earned — the shape of the learning curve. */
    intervalDays: real("interval_days").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("study_reviews_learner_time_idx").on(t.learnerId, t.reviewedAt),
  ],
);

// ---------------------------------------------------------------------------
// LEARNING PATHS — the guided foundation.
//
// The product could already answer "what is due" and "what could I
// start", and had no answer at all for "what should I learn FIRST".
// Every self-directed learner hits the same wall: they can add words
// forever and never know whether they are building anything. A path is
// the curated order — first these 60 words, then their sentences, then
// a conversation that uses them, then a lesson with a human.
//
// Product-shipped content like packs, not learner-authored: no learner
// FK on the path or its steps. The learner's relationship to it is the
// ENROLMENT below.
//
// Steps do NOT gate each other. "They can jump around but we guide the
// foundation" — every step is open from day one, and the path's job is
// to say which one is next, not to lock the others.
// ---------------------------------------------------------------------------

export const studyPaths = pgTable(
  "study_paths",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    /** One sentence: who this is for and where it ends. */
    description: text("description"),
    /** Curated order in the catalog. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("study_paths_slug_idx").on(t.slug)],
);

export const studyPathSteps = pgTable(
  "study_path_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pathId: uuid("path_id")
      .notNull()
      .references(() => studyPaths.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: pathStepKindEnum("kind").notNull(),
    title: text("title").notNull(),
    /** Why this step is here — shown under the title. */
    detail: text("detail"),
    /** The official book a `pack`/`sentences` step is about. */
    packSlug: text("pack_slug"),
    /**
     * How much counts as done, in the step's own unit: words at
     * `reviewing` or better for a pack step, cards reviewed for a
     * sentence step, messages for a chat step, lessons for a lesson
     * step. Completion is DERIVED from that evidence and never
     * asserted — the same rule the vocabulary pipeline follows.
     */
    target: integer("target").notNull().default(1),
  },
  (t) => [
    uniqueIndex("study_path_steps_path_position_idx").on(t.pathId, t.position),
  ],
);

export const studyPathEnrollments = pgTable(
  "study_path_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    pathId: uuid("path_id")
      .notNull()
      .references(() => studyPaths.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("study_path_enrollments_learner_path_idx").on(
      t.learnerId,
      t.pathId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// TUTOR PILOT — the first bridge between the two halves of the app.
//
// The teacher workspace has had the schedule, the lesson loop and the
// student record since day one; the study surface has had a learner with
// no way to reach a human. This is that door, opened for a HAND-PICKED
// few tutors: a listing they opt into, the hours they will take, and a
// booking that lands as a real lesson on the teacher's own agenda.
//
// Deliberately not a marketplace (FEATURES.md cuts that until teacher
// density exists): no ratings, no search ranking, no payouts league
// table. A pilot is a directory of people we chose, and the shape stays
// honest about that.
// ---------------------------------------------------------------------------

export const tutorProfiles = pgTable(
  "tutor_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    /** One line under the name — what they actually teach. */
    headline: text("headline").notNull(),
    bio: text("bio"),
    languages: text("languages").array().notNull(),
    /** Where they are, for the learner's "who teaches from where". */
    country: text("country"),
    timezone: text("timezone"),
    /** The price of ONE lesson, in the smallest currency unit. */
    rateCents: integer("rate_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    lessonMinutes: integer("lesson_minutes").notNull().default(50),
    status: tutorListingStatusEnum("status").notNull().default("draft"),
    /**
     * The tutor's own Stripe CONNECTED account (Express). Money moves
     * tutor-first: the learner's charge is created ON this account with
     * our cut taken as an application fee, so funds never sit in our
     * balance pretending to be ours.
     */
    stripeAccountId: text("stripe_account_id"),
    /** Stripe's answer, mirrored from the account.updated webhook — never
     * our own guess. A tutor with payouts disabled cannot be booked. */
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tutor_profiles_teacher_id_idx").on(t.teacherId),
    uniqueIndex("tutor_profiles_stripe_account_idx").on(t.stripeAccountId),
    index("tutor_profiles_status_idx").on(t.status),
  ],
);

/**
 * The hours a tutor will take, as a weekly pattern in THEIR timezone.
 * Minutes-from-midnight rather than a time column: slot maths is
 * arithmetic, and a `time` value drags a date into every comparison.
 */
export const tutorAvailability = pgTable(
  "tutor_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    /** 0 = Sunday, matching JS `getDay()`. */
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [index("tutor_availability_teacher_idx").on(t.teacherId, t.weekday)],
);

/**
 * A standing weekly slot, billed monthly at a discount. The discount is
 * not generosity: a booked recurring hour is a tutor's scarcest asset,
 * and the learner is paying for the certainty as much as the lesson.
 */
export const tutorSubscriptions = pgTable(
  "tutor_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: tutorSubscriptionStatusEnum("status").notNull().default("active"),
    /** The standing slot, in the TUTOR's timezone (see availability). */
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    lessonsPerMonth: integer("lessons_per_month").notNull().default(4),
    /** Stamped at signup so a later repricing never rewrites history. */
    discountPercent: integer("discount_percent").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tutor_subscriptions_learner_idx").on(t.learnerId),
    index("tutor_subscriptions_teacher_idx").on(t.teacherId),
    uniqueIndex("tutor_subscriptions_stripe_id_idx").on(t.stripeSubscriptionId),
  ],
);

export const tutorBookings = pgTable(
  "tutor_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    /**
     * The roster row this learner occupies in the tutor's own workspace.
     * The first booking creates it, and from then on the whole existing
     * teacher loop — agenda, prep sheet, records, homework, the student
     * portal — works on this booking with no special-casing, because it
     * is just another student.
     */
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** The teacher-side lesson. Written when the booking is CONFIRMED —
     * an unpaid hold must never appear on someone's agenda. */
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscription_id").references(
      () => tutorSubscriptions.id,
      { onDelete: "set null" },
    ),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    plan: bookingPlanEnum("plan").notNull().default("single"),
    status: bookingStatusEnum("status").notNull().default("pending_payment"),
    /** What the learner wants out of it — grammar, conversation, … The
     * answers prefill the next booking, so the second one is one tap. */
    focus: text("focus").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    /** Price agreed at BOOKING time. A tutor raising their rate must not
     * silently reprice an hour someone already holds. */
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    /** When an unpaid hold stops holding the slot. */
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tutor_bookings_teacher_start_idx").on(t.teacherId, t.startsAt),
    index("tutor_bookings_learner_start_idx").on(t.learnerId, t.startsAt),
    index("tutor_bookings_student_idx").on(t.studentId),
  ],
);

/**
 * THE MONEY LEDGER — one row per payment, and the same row is what both
 * sides read as their history.
 *
 * Every party's share is stored, not derived at render time: what the
 * learner paid, what Stripe took, what we took, what the tutor nets.
 * Fees change, and a history that recomputes itself from today's rates
 * is a history that lies about last month.
 *
 * `stripeFeeCents` is NULLABLE on purpose. Stripe's actual fee lives on
 * the balance transaction, which does not exist at the moment the charge
 * succeeds; the webhook fills it in when it does. Until then the UI says
 * "estimated" and means it, rather than storing a guess as though it
 * were the number.
 */
export const tutorPayments = pgTable(
  "tutor_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => tutorBookings.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscription_id").references(
      () => tutorSubscriptions.id,
      { onDelete: "set null" },
    ),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    currency: text("currency").notNull().default("usd"),
    /** What the learner was charged. */
    grossCents: integer("gross_cents").notNull(),
    /** Stripe's processing fee — null until the balance transaction lands. */
    stripeFeeCents: integer("stripe_fee_cents"),
    /** Our application fee. */
    platformFeeCents: integer("platform_fee_cents").notNull(),
    /** What reaches the tutor's Stripe balance. */
    tutorNetCents: integer("tutor_net_cents").notNull(),
    status: tutorPaymentStatusEnum("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tutor_payments_teacher_idx").on(t.teacherId, t.createdAt),
    index("tutor_payments_learner_idx").on(t.learnerId, t.createdAt),
    uniqueIndex("tutor_payments_intent_idx").on(t.stripePaymentIntentId),
  ],
);

// ---------------------------------------------------------------------------
// Study memories — durable facts the tutor saves about the learner from
// conversations (ChatGPT-memory shape): goals, level, exam dates, interests,
// how they like to learn. Injected into every chat's context; the learner
// sees and deletes them on /account. The learner owns this context —
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
// LIVE LESSONS — the call, and the recording it produces.
//
// The call is the input; the learning context is the product. We rent the
// pipes (Cloudflare RealtimeKit) and own the artifact.
//
// Two tables, not one, because they have different lifetimes: a booking has
// exactly one room that outlives any single connection (a dropped call must
// rejoin the SAME room, not create a second lesson), while one room can
// produce several recordings — the spike produced two before anyone
// intended it to. Collapsing them would make "the recording" ambiguous the
// first time a call is stopped and restarted.
// ---------------------------------------------------------------------------

/**
 * The recording pipeline's states, explicit rather than inferred from which
 * nullable columns happen to be filled in.
 *
 * `ingesting`/`ingested` sit between the provider finishing and any
 * transcription starting, and they are the reason this enum is not simply
 * the provider's own status. RealtimeKit keeps track files in ITS bucket
 * behind presigned URLs that expire after seven days; until we have copied
 * them into our own R2 and checked the bytes, the artifact is not ours and
 * the lesson is one outage away from being lost. Nothing downstream may
 * start before `ingested`.
 */
export const lessonRecordingStateEnum = pgEnum("lesson_recording_state", [
  "awaiting_consent",
  "recording",
  "recording_complete",
  "ingesting",
  "ingested",
  "transcription_queued",
  "transcribing",
  "transcribed",
  "extracting",
  "awaiting_teacher_review",
  "completed",
  "failed",
  "deleted",
]);

/** Which side of the lesson a track or a consent belongs to. */
export const lessonCallRoleEnum = pgEnum("lesson_call_role", [
  "teacher",
  "student",
]);

/**
 * One room per booking. `bookingId` is UNIQUE: a reconnect must land back
 * in the room it left, and "the call for this lesson" must never be a
 * question with two answers.
 */
export const lessonCalls = pgTable(
  "lesson_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The room belongs to a LESSON, not to a paid booking.
     *
     * Binding it to `tutor_bookings` made the room unreachable wherever
     * Stripe is not configured — which is every environment we run,
     * production included: no Stripe means a tutor cannot be listed and
     * a booking can never reach `confirmed`. It also excluded the case
     * the teacher workspace has served since day one, a tutor teaching
     * a student they scheduled themselves with no money involved.
     *
     * Nothing is lost from the tutor pilot: a confirmed booking already
     * writes a `lessons` row (`tutor_bookings.lesson_id`), so a paid
     * lesson reaches its room through the same door as any other.
     */
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    /** Denormalised from the lesson so authorization is one read, and so
     * a call still names its people if the lesson is ever reshaped. */
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** RealtimeKit's meeting id. */
    providerMeetingId: text("provider_meeting_id").notNull(),
    /**
     * Consent is per person and time-stamped, because "both agreed" is a
     * claim we may have to stand behind later. Recording may not start
     * while either is null — enforced in the action, not by a boolean
     * someone can flip.
     */
    teacherConsentAt: timestamp("teacher_consent_at", { withTimezone: true }),
    studentConsentAt: timestamp("student_consent_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lesson_calls_lesson_idx").on(t.lessonId),
    index("lesson_calls_teacher_idx").on(t.teacherId),
    index("lesson_calls_student_idx").on(t.studentId),
  ],
);

/**
 * One row per provider recording.
 *
 * `expectedTrackCount` exists because of the most dangerous thing the
 * provider spike found: a track recording whose participant allowlist
 * matches nobody still reports `UPLOADED`, with a real duration and no
 * error — and zero files. Status is not evidence that a lesson was
 * captured. Comparing files received against tracks expected is.
 */
export const lessonRecordings = pgTable(
  "lesson_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id")
      .notNull()
      .references(() => lessonCalls.id, { onDelete: "cascade" }),
    /** RealtimeKit's recording id — the webhook's only join key. */
    providerRecordingId: text("provider_recording_id").notNull(),
    state: lessonRecordingStateEnum("state").notNull().default("recording"),
    expectedTrackCount: integer("expected_track_count").notNull().default(2),
    /** When the provider's own copy stops being fetchable. Stored so the
     * reconciler can find recordings running out of time, rather than
     * discovering it after they have. */
    providerExpiresAt: timestamp("provider_expires_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    failureReason: text("failure_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lesson_recordings_provider_idx").on(t.providerRecordingId),
    index("lesson_recordings_call_idx").on(t.callId),
    index("lesson_recordings_state_idx").on(t.state),
  ],
);

/**
 * One row per participant audio track. Separate tracks are the entire
 * reason to own the call: speaker identity that does not depend on a model
 * guessing who was talking.
 *
 * `sha256` is recorded on ingest and re-checked, so "we copied it" means
 * the bytes arrived, not that a request returned 200.
 */
export const lessonRecordingTracks = pgTable(
  "lesson_recording_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => lessonRecordings.id, { onDelete: "cascade" }),
    role: lessonCallRoleEnum("role").notNull(),
    /** RealtimeKit's participant id — what `user_ids` actually keys on
     * (NOT our own participant id, which the docs' example resembles). */
    providerParticipantId: text("provider_participant_id").notNull(),
    providerFileName: text("provider_file_name").notNull(),
    /** Key in OUR bucket. Null until ingest succeeds. */
    storageKey: text("storage_key"),
    bytes: integer("bytes"),
    sha256: text("sha256"),
    /**
     * When this person's file began, read out of the provider's file name
     * on ingest. Two people's tracks do not start on the same millisecond
     * — a reconnect starts a fresh file minutes in — so this is what lets
     * two separately transcribed voices be laid on ONE timeline. Null when
     * the name did not carry it; the recording's own start stands in.
     */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** Set once every utterance of this track is stored. The per-track
     * marker is what makes a re-run transcribe only what is missing. */
    transcribedAt: timestamp("transcribed_at", { withTimezone: true }),
    transcriptModel: text("transcript_model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lesson_recording_tracks_file_idx").on(
      t.recordingId,
      t.providerFileName,
    ),
    index("lesson_recording_tracks_recording_idx").on(t.recordingId),
  ],
);

/**
 * One row per thing one person said, in one track.
 *
 * THE UNIT OF EVIDENCE. Everything a lesson later claims about a learner
 * — this correction, that word — should be able to point at the row it
 * came from, and a row is something that can be pointed at: it has an id
 * that does not move, a speaker that is a FACT (the track it came from,
 * never a model's guess about who was talking), and a time within a
 * file we hold. A timestamp a model wrote into prose is none of those.
 *
 * `sequence` is the order within the track; the timeline across tracks
 * is derived from each track's `started_at` plus `start_ms`.
 */
export const lessonUtterances = pgTable(
  "lesson_utterances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => lessonRecordings.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => lessonRecordingTracks.id, { onDelete: "cascade" }),
    role: lessonCallRoleEnum("role").notNull(),
    sequence: integer("sequence").notNull(),
    /** Offsets within the TRACK's file, in milliseconds. */
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lesson_utterances_track_sequence_idx").on(
      t.trackId,
      t.sequence,
    ),
    index("lesson_utterances_recording_idx").on(t.recordingId),
  ],
);

/**
 * Provider webhook deliveries, keyed on the provider's own delivery id.
 *
 * The unique index IS the idempotency: RealtimeKit retries, and a retried
 * `UPLOADED` must not start a second ingest or create a second transcript.
 * Insert-first, act-only-if-inserted.
 */
export const lessonCallWebhooks = pgTable(
  "lesson_call_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    providerRecordingId: text("provider_recording_id"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("lesson_call_webhooks_delivery_idx").on(t.deliveryId)],
);

// ---------------------------------------------------------------------------
// MESSAGES — the thread between a teacher and their student.
//
// The gap this closes: the app had a teacher, a student, a lesson, a
// recap, homework and an accountability card, and no way for the two
// people to say a sentence to each other. Everything they had was
// one-way publishing — the teacher approves a record, the learner reads
// it — which is a relationship modelled as a broadcast.
//
// It matters more than "chat is table stakes" because of what the tutor
// is FOR here (2026-08-30): "more of a motivation and person who will
// push and really check up whether the student really progressed". That
// work happens BETWEEN lessons, and the accountability card already
// knows the uncomfortable facts to raise. It was a diagnosis with no
// mouth.
//
// WHY THIS IS NOT AN INBOX. A plain DM list loses to LINE, WhatsApp and
// Preply's own messenger — nobody adopts a worse chat app. The only
// version worth building is the one that carries the app's own
// artifacts: a homework submission, a shared recap, a booking, and the
// words the learner keeps getting wrong. That is the reason to open this
// thread instead of the one already on their phone.
//
// It is deliberately called MESSAGES and never "chat". `/chat` is the AI
// tutor. This repo has already paid once for two things sharing a word
// (`study_books` vs `study_vocab_lists`, both surfaced as "Books", which
// took migration 0019 to unwind) in a product whose stated rule is one
// word, one meaning.
// ---------------------------------------------------------------------------

export const messageAuthorEnum = pgEnum("message_author", [
  "teacher",
  "student",
  // Not a person: something the app did that both sides should see in
  // the same place they say things to each other.
  "system",
]);

/**
 * What a system message is ABOUT. Only events that already happen in
 * this codebase are listed — an enum full of aspirational values is a
 * lie about what the product does.
 */
export const messageEventEnum = pgEnum("message_event", [
  "homework_assigned",
  "homework_submitted",
  "homework_closed",
  "recap_shared",
  "booking_confirmed",
  "booking_cancelled",
]);

/**
 * One thread per teacher–student RELATIONSHIP, which is exactly what a
 * `students` row already is — hence the unique index on it rather than a
 * participants table. Two people, one history, however many lessons.
 *
 * Read state is per SIDE and stored as a timestamp rather than a count:
 * a count has to be maintained by every writer and drifts the first time
 * one forgets, while "everything after this instant is unread" is
 * derivable from the messages themselves and cannot go stale.
 */
export const messageThreads = pgTable(
  "message_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Denormalised for the inbox's ordering — the one query that would
     * otherwise join every thread to its newest message on every render. */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    teacherReadAt: timestamp("teacher_read_at", { withTimezone: true }),
    studentReadAt: timestamp("student_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("message_threads_student_idx").on(t.studentId),
    index("message_threads_teacher_idx").on(t.teacherId),
  ],
);

/**
 * `body` is ALWAYS the human sentence, for events too.
 *
 * The alternative — store the event type plus a foreign key and render
 * the sentence from today's row — produces a history that rewrites
 * itself: delete the homework and the thread says a blank happened. Same
 * reasoning the payments ledger already runs on ("every party's share is
 * stored, not derived"). The FKs are here so a live target can still be
 * OPENED, never so the text can be recomputed; each is `set null`, which
 * degrades the message to exactly what it said at the time.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    author: messageAuthorEnum("author").notNull(),
    body: text("body").notNull(),
    /** Null on a typed message; set on every `system` one. */
    event: messageEventEnum("event"),
    homeworkId: uuid("homework_id").references(() => homework.id, {
      onDelete: "set null",
    }),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => tutorBookings.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt)],
);

/**
 * Words carried by a message — the nudge the accountability card sends.
 *
 * A stamped SNAPSHOT (term + meaning), not a join to `study_vocab`. The
 * message said what it said; a word the learner later deletes must not
 * silently empty a sentence their tutor wrote a fortnight ago. It is a
 * child table rather than a jsonb column because a repeating group with
 * a stable shape is a table — the repo's own modelling rule.
 */
export const messageTerms = pgTable(
  "message_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    meaning: text("meaning"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("message_terms_message_idx").on(t.messageId, t.position)],
);

// ---------------------------------------------------------------------------
// Web-push subscriptions.
//
// A message nobody sees is worse than no message: it teaches both people
// that the thread is not where things reach them, and then they go back
// to LINE for good. The in-app unread badge is the floor; this is what
// makes a nudge arrive on a phone that isn't currently open.
//
// Ported from the CRM's ambient-digest arc (`crm/src/server/push.ts`),
// with the one change this app forces: the CRM is single-user and fans
// out to EVERY subscription. Here a subscription belongs to a WorkOS
// user and delivery is targeted — sending one person's message to
// another person's browser is a privacy incident, not noise.
// ---------------------------------------------------------------------------

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The push service's URL for this browser installation — the
     * natural key, and what a 404/410 from the service identifies. */
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** Keyed on the WorkOS id rather than a teacher/student/learner row:
     * one person is often several of those (the founder is all three),
     * and what we actually have to reach is the human's browser. */
    workosUserId: text("workos_user_id").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.workosUserId),
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
export type StudyDeck = typeof studyDecks.$inferSelect;
export type StudyDeckItem = typeof studyDeckItems.$inferSelect;
export type StudyDeckRun = typeof studyDeckRuns.$inferSelect;
export type StudySentence = typeof studySentences.$inferSelect;
export type VocabularyBook = typeof vocabularyBooks.$inferSelect;
export type StudyPack = typeof studyPacks.$inferSelect;
export type StudyPackItem = typeof studyPackItems.$inferSelect;
export type StudyMemory = typeof studyMemories.$inferSelect;
export type StudyReview = typeof studyReviews.$inferSelect;
export type StudyPath = typeof studyPaths.$inferSelect;
export type StudyPathStep = typeof studyPathSteps.$inferSelect;
export type StudyPathEnrollment = typeof studyPathEnrollments.$inferSelect;
export type TutorProfile = typeof tutorProfiles.$inferSelect;
export type TutorAvailability = typeof tutorAvailability.$inferSelect;
export type TutorBooking = typeof tutorBookings.$inferSelect;
export type TutorSubscription = typeof tutorSubscriptions.$inferSelect;
export type TutorPayment = typeof tutorPayments.$inferSelect;
export type LessonCall = typeof lessonCalls.$inferSelect;
export type LessonRecording = typeof lessonRecordings.$inferSelect;
export type LessonRecordingTrack = typeof lessonRecordingTracks.$inferSelect;
export type LessonUtterance = typeof lessonUtterances.$inferSelect;
export type MessageThread = typeof messageThreads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageTerm = typeof messageTerms.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
