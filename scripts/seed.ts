/**
 * Seed the local DB with a demo teacher + students + lessons so the app
 * is explorable immediately under `npm run dev:mock`.
 *
 *   npm run db:seed
 *
 * The teacher row uses the same workos_user_id the MOCK_AUTH session
 * resolves to, so mock login lands directly in this data.
 */
import { eq } from "drizzle-orm";
import {
  aiMessages,
  corrections,
  db,
  goals,
  homework,
  insights,
  lessons,
  lessonTopics,
  students,
  teachers,
  vocabularyItems,
  vocabularyReviews,
} from "../src/db";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  const existing = await db.query.teachers.findFirst({
    where: eq(teachers.workosUserId, "mock_teacher_dev"),
  });
  if (existing) {
    console.log("Demo teacher already exists — wiping their data first.");
    await db.delete(students).where(eq(students.teacherId, existing.id));
    await db.delete(teachers).where(eq(teachers.id, existing.id));
  }

  const [teacher] = await db
    .insert(teachers)
    .values({
      workosUserId: "mock_teacher_dev",
      email: "teacher@class-room.dev",
      name: "Demo Teacher",
      nativeLanguage: "English",
      languagesTaught: ["English", "French"],
      timezone: "Asia/Bangkok",
    })
    .returning();

  // --- Marie: active French→English student with rich history ------------
  const [marie] = await db
    .insert(students)
    .values({
      teacherId: teacher.id,
      name: "Marie Dubois",
      email: "marie@example.com",
      nativeLanguage: "French",
      targetLanguage: "English",
      currentLevel: "B1",
      targetLevel: "C1",
      status: "active",
      platform: "italki",
      lessonFrequency: "2x per week",
      timezone: "Europe/Paris",
      generalNotes:
        "Works in finance; wants business English for a London transfer. Responds well to role-play, dislikes drilling.",
      // Fixed demo token so the portal is reachable at a known URL:
      //   /p/demo-marie-portal-token
      portalToken: "demo-marie-portal-token",
    })
    .returning();

  await db.insert(goals).values([
    {
      teacherId: teacher.id,
      studentId: marie.id,
      title: "Business English for London transfer",
      description: "Meetings, presentations, small talk with colleagues.",
      priority: "high",
      status: "active",
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      title: "Reduce article mistakes (a/the)",
      priority: "medium",
      status: "active",
    },
  ]);

  const [marieLesson1] = await db
    .insert(lessons)
    .values({
      teacherId: teacher.id,
      studentId: marie.id,
      title: "Presenting quarterly numbers",
      startedAt: daysAgo(5),
      durationMinutes: 60,
      status: "shared",
      attendanceOutcome: "attended",
      studentVisibleSummary:
        "Great session, Marie! You presented your Q3 numbers clearly and your business vocabulary is really growing. This week, watch out for the third-person -s (she goes) and remember that 'information' never takes an s. Review the new words below and have fun with the recording homework!",
      recapMessage: "You're getting noticeably more confident — keep it up! 🎉",
      recapToken: "demo-marie-recap-1",
      recapSharedAt: daysAgo(5),
      sourceType: "notes",
      rawInput:
        "practiced presenting Q3 numbers\nshe go -> she goes\nthe informations -> the information\nvocab: revenue forecast\nvocab: stakeholder\nhw: record a 2-min summary of a report\ntopic: quarterly presentations",
      summary:
        "Marie presented her Q3 numbers in English. Strong vocabulary recall; recurring third-person -s and uncountable-noun slips under pressure.",
      nextLessonFocus:
        "Warm up with third-person -s drill disguised as Q&A, then move to handling questions after a presentation.",
      teacherPrivateNotes: "Gets nervous when interrupted — build interruption practice gradually.",
    })
    .returning();

  await db.insert(lessonTopics).values([
    { teacherId: teacher.id, lessonId: marieLesson1.id, title: "Quarterly presentations" },
    { teacherId: teacher.id, lessonId: marieLesson1.id, title: "Numbers and trends vocabulary" },
  ]);

  await db.insert(corrections).values([
    {
      teacherId: teacher.id,
      studentId: marie.id,
      lessonId: marieLesson1.id,
      category: "grammar",
      originalText: "she go",
      correctedText: "she goes",
      explanation: "Third-person singular -s.",
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      lessonId: marieLesson1.id,
      category: "grammar",
      originalText: "the informations",
      correctedText: "the information",
      explanation: "'Information' is uncountable in English.",
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      lessonId: marieLesson1.id,
      category: "naturalExpression",
      originalText: "I am agree",
      correctedText: "I agree",
    },
  ]);

  // Vocabulary across the whole SRS pipeline: one card due NOW (practice
  // demo), one learning, one reviewing, one mastered, one never touched.
  const marieVocab = await db
    .insert(vocabularyItems)
    .values([
      {
        teacherId: teacher.id,
        studentId: marie.id,
        lessonId: marieLesson1.id,
        term: "revenue forecast",
        meaning: "a prediction of future income",
        language: "English",
        status: "learning",
        srsReps: 1,
        srsEaseFactor: 2.5,
        srsIntervalDays: 1,
        srsDueAt: daysAgo(0.5), // overdue — shows up in practice
        lastReviewedAt: daysAgo(1.5),
      },
      {
        teacherId: teacher.id,
        studentId: marie.id,
        lessonId: marieLesson1.id,
        term: "stakeholder",
        meaning: "a person with an interest in a business",
        language: "English",
        status: "new",
      },
      {
        teacherId: teacher.id,
        studentId: marie.id,
        term: "to break even",
        meaning: "to make neither profit nor loss",
        language: "English",
        status: "reviewing",
        srsReps: 3,
        srsEaseFactor: 2.5,
        srsIntervalDays: 8,
        srsDueAt: daysAhead(3),
        lastReviewedAt: daysAgo(5),
      },
      {
        teacherId: teacher.id,
        studentId: marie.id,
        term: "to touch base",
        meaning: "to make brief contact",
        example: "Let's touch base on Friday about the report.",
        language: "English",
        status: "mastered",
        srsReps: 6,
        srsEaseFactor: 2.7,
        srsIntervalDays: 32,
        srsDueAt: daysAhead(20),
        lastReviewedAt: daysAgo(12),
      },
    ])
    .returning();

  // Practice log backing the SRS states above.
  const vocabByTerm = new Map(marieVocab.map((v) => [v.term, v]));
  await db.insert(vocabularyReviews).values([
    {
      teacherId: teacher.id,
      studentId: marie.id,
      vocabularyItemId: vocabByTerm.get("revenue forecast")!.id,
      grade: "good",
      intervalDays: 1,
      reviewedAt: daysAgo(1.5),
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      vocabularyItemId: vocabByTerm.get("to break even")!.id,
      grade: "good",
      intervalDays: 3,
      reviewedAt: daysAgo(13),
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      vocabularyItemId: vocabByTerm.get("to break even")!.id,
      grade: "good",
      intervalDays: 8,
      reviewedAt: daysAgo(5),
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      vocabularyItemId: vocabByTerm.get("to touch base")!.id,
      grade: "easy",
      intervalDays: 32,
      reviewedAt: daysAgo(12),
    },
  ]);

  await db.insert(homework).values([
    {
      teacherId: teacher.id,
      studentId: marie.id,
      lessonId: marieLesson1.id,
      title: "Record a 2-minute summary of a financial report",
      dueAt: daysAhead(2),
      status: "assigned",
    },
    // Submitted through the student portal — waiting for teacher review.
    {
      teacherId: teacher.id,
      studentId: marie.id,
      title: "Watch a TED talk and note 5 useful phrases",
      dueAt: daysAgo(1),
      status: "submitted",
      submissionText:
        "I watched “How great leaders inspire action”. My phrases: to challenge the status quo, to stand out, a sense of purpose, to buy into an idea, from the inside out.",
      submittedAt: daysAgo(1),
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      title: "Write 5 sentences using articles correctly",
      status: "completed",
      teacherFeedback: "All five correct — the/an distinction is clicking!",
    },
  ]);

  await db.insert(insights).values([
    {
      teacherId: teacher.id,
      studentId: marie.id,
      sourceLessonId: marieLesson1.id,
      type: "recurringMistake",
      title: "Drops third-person -s under time pressure",
      description: "Accurate in writing, slips in fast speech.",
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      type: "learningPreference",
      title: "Learns best through role-play",
      description: "Textbook drills lose her attention within minutes.",
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      type: "interest",
      title: "Interested in watches and financial markets",
    },
  ]);

  // A second, unprocessed lesson with raw notes ready to demo AI processing.
  await db.insert(lessons).values({
    teacherId: teacher.id,
    studentId: marie.id,
    title: "Handling meeting interruptions",
    startedAt: daysAgo(1),
    durationMinutes: 60,
    status: "draft",
    attendanceOutcome: "attended",
    sourceType: "notes",
    rawInput:
      "role-played being interrupted in a meeting\nI am agree -> I agree\nhe don't know -> he doesn't know\nvocab: to circle back\nvocab: to table a discussion\nhw: watch one episode of a business podcast and note 5 new phrases\ntopic: meeting interruptions",
  });

  // Upcoming scheduled lesson — feeds the dashboard "Up next" card.
  await db.insert(lessons).values({
    teacherId: teacher.id,
    studentId: marie.id,
    title: "Q&A after presentations",
    startedAt: daysAhead(1),
    durationMinutes: 60,
    status: "scheduled",
    sourceType: "notes",
  });

  // The student's study-companion conversation so far.
  await db.insert(aiMessages).values([
    {
      teacherId: teacher.id,
      studentId: marie.id,
      role: "user",
      content: "Can you help me practice before my next lesson?",
      createdAt: daysAgo(2),
    },
    {
      teacherId: teacher.id,
      studentId: marie.id,
      role: "assistant",
      content:
        "Of course, Marie! Your next lesson is about handling Q&A after presentations. Let's warm up: imagine I'm a stakeholder asking about your revenue forecast — answer in two sentences, and remember: she goes, not she go. 😉",
      createdAt: daysAgo(2),
    },
  ]);

  // --- Kenji: trial student, minimal history ------------------------------
  const [kenji] = await db
    .insert(students)
    .values({
      teacherId: teacher.id,
      name: "Kenji Tanaka",
      nativeLanguage: "Japanese",
      targetLanguage: "English",
      currentLevel: "A2",
      status: "trial",
      platform: "Preply",
      lessonFrequency: "1x per week",
      timezone: "Asia/Tokyo",
    })
    .returning();

  await db.insert(goals).values({
    teacherId: teacher.id,
    studentId: kenji.id,
    title: "Conversational English for travel",
    priority: "medium",
    status: "active",
  });

  await db.insert(lessons).values([
    {
      teacherId: teacher.id,
      studentId: kenji.id,
      title: "Trial lesson — introductions",
      startedAt: daysAgo(3),
      durationMinutes: 30,
      status: "reviewed",
      attendanceOutcome: "attended",
      sourceType: "notes",
      summary:
        "Friendly trial; Kenji understands more than he produces. Needs confidence with basic question forms.",
      nextLessonFocus: "Question word order (Do you…? / Where is…?).",
    },
    {
      teacherId: teacher.id,
      studentId: kenji.id,
      title: "Question forms",
      startedAt: daysAhead(3),
      durationMinutes: 60,
      status: "scheduled",
      sourceType: "notes",
    },
  ]);

  // --- Ana: paused student, hasn't been seen in a while --------------------
  const [ana] = await db
    .insert(students)
    .values({
      teacherId: teacher.id,
      name: "Ana Silva",
      nativeLanguage: "Portuguese",
      targetLanguage: "French",
      currentLevel: "B2",
      targetLevel: "C1",
      status: "active",
      platform: "Zoom (private)",
      lessonFrequency: "1x per week",
    })
    .returning();

  await db.insert(lessons).values([
    {
      teacherId: teacher.id,
      studentId: ana.id,
      title: "Subjonctif review",
      startedAt: daysAgo(21),
      durationMinutes: 45,
      status: "reviewed",
      attendanceOutcome: "attended",
      sourceType: "notes",
      summary: "Reviewed subjunctive triggers; Ana is solid on regular forms.",
      nextLessonFocus: "Irregular subjunctive forms (être, avoir, faire).",
    },
    // A no-show last week — Ana surfaces in "not seen recently" honestly.
    {
      teacherId: teacher.id,
      studentId: ana.id,
      title: "Irregular subjunctive",
      startedAt: daysAgo(7),
      durationMinutes: 45,
      status: "cancelled",
      attendanceOutcome: "student_no_show",
      sourceType: "notes",
    },
  ]);

  // --- Two more students: the cross-platform roster ------------------------
  const [somchai] = await db
    .insert(students)
    .values({
      teacherId: teacher.id,
      name: "Somchai Prasert",
      nativeLanguage: "Thai",
      targetLanguage: "English",
      currentLevel: "B1",
      status: "active",
      platform: "in person",
      lessonFrequency: "1x per week",
      timezone: "Asia/Bangkok",
    })
    .returning();

  await db.insert(lessons).values({
    teacherId: teacher.id,
    studentId: somchai.id,
    title: "Restaurant roleplay",
    startedAt: daysAgo(4),
    durationMinutes: 60,
    status: "reviewed",
    attendanceOutcome: "attended",
    sourceType: "notes",
    summary: "Ordering, complaints, and paying politely. Good energy.",
    nextLessonFocus: "Phone conversations — booking a table.",
  });

  await db.insert(students).values({
    teacherId: teacher.id,
    name: "David Cohen",
    nativeLanguage: "Hebrew",
    targetLanguage: "French",
    currentLevel: "A1",
    status: "inactive",
    platform: "referral",
    lessonFrequency: "paused since May",
  });

  console.log("Seeded:");
  console.log(`  teacher  ${teacher.email}`);
  console.log(
    "  students Marie (italki, portal+SRS+AI chat), Kenji (Preply, trial), Ana (Zoom, no-show), Somchai (in person), David (referral, inactive)",
  );
  console.log("  portal   /p/demo-marie-portal-token");
  console.log("Run `npm run dev:mock` and you'll land in this data.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
