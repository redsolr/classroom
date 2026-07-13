import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  max,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import {
  corrections,
  db,
  goals,
  homework,
  insights,
  lessons,
  lessonTopics,
  students,
  vocabularyItems,
  type Lesson,
  type Student,
} from "@/db";

/**
 * Lessons that actually happened (or are being written up) — scheduled
 * plans and cancellations never count toward "last lesson" / trends.
 */
function happenedLesson() {
  return notInArray(lessons.status, ["scheduled", "cancelled"]);
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export type StudentListRow = Student & {
  lessonCount: number;
  lastLessonAt: Date | null;
  openHomeworkCount: number;
};

export async function listStudents(teacherId: string): Promise<StudentListRow[]> {
  const lessonAgg = db
    .select({
      studentId: lessons.studentId,
      lessonCount: count(lessons.id).as("lesson_count"),
      lastLessonAt: max(lessons.startedAt).as("last_lesson_at"),
    })
    .from(lessons)
    .where(and(eq(lessons.teacherId, teacherId), happenedLesson()))
    .groupBy(lessons.studentId)
    .as("lesson_agg");

  const homeworkAgg = db
    .select({
      studentId: homework.studentId,
      openHomeworkCount: count(homework.id).as("open_homework_count"),
    })
    .from(homework)
    .where(
      and(
        eq(homework.teacherId, teacherId),
        inArray(homework.status, ["assigned", "submitted"]),
      ),
    )
    .groupBy(homework.studentId)
    .as("homework_agg");

  const rows = await db
    .select({
      student: students,
      lessonCount: lessonAgg.lessonCount,
      lastLessonAt: lessonAgg.lastLessonAt,
      openHomeworkCount: homeworkAgg.openHomeworkCount,
    })
    .from(students)
    .leftJoin(lessonAgg, eq(lessonAgg.studentId, students.id))
    .leftJoin(homeworkAgg, eq(homeworkAgg.studentId, students.id))
    .where(eq(students.teacherId, teacherId))
    .orderBy(desc(students.updatedAt));

  return rows.map((r) => ({
    ...r.student,
    lessonCount: r.lessonCount ?? 0,
    lastLessonAt: r.lastLessonAt ?? null,
    openHomeworkCount: r.openHomeworkCount ?? 0,
  }));
}

export async function getStudent(
  teacherId: string,
  studentId: string,
): Promise<Student | null> {
  const row = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.teacherId, teacherId)),
  });
  return row ?? null;
}

/** Everything the student profile needs, in one round of scoped queries. */
export async function getStudentProfile(teacherId: string, studentId: string) {
  const student = await getStudent(teacherId, studentId);
  if (!student) return null;

  const scoped = and(
    eq(lessons.teacherId, teacherId),
    eq(lessons.studentId, studentId),
  );

  const [
    studentLessons,
    studentGoals,
    studentCorrections,
    studentVocabulary,
    studentHomework,
    studentInsights,
  ] = await Promise.all([
    db.select().from(lessons).where(scoped).orderBy(desc(lessons.startedAt)),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.teacherId, teacherId), eq(goals.studentId, studentId)))
      .orderBy(desc(goals.createdAt)),
    db
      .select()
      .from(corrections)
      .where(
        and(
          eq(corrections.teacherId, teacherId),
          eq(corrections.studentId, studentId),
        ),
      )
      .orderBy(desc(corrections.createdAt)),
    db
      .select()
      .from(vocabularyItems)
      .where(
        and(
          eq(vocabularyItems.teacherId, teacherId),
          eq(vocabularyItems.studentId, studentId),
        ),
      )
      .orderBy(desc(vocabularyItems.createdAt)),
    db
      .select()
      .from(homework)
      .where(
        and(eq(homework.teacherId, teacherId), eq(homework.studentId, studentId)),
      )
      .orderBy(desc(homework.createdAt)),
    db
      .select()
      .from(insights)
      .where(
        and(eq(insights.teacherId, teacherId), eq(insights.studentId, studentId)),
      )
      .orderBy(desc(insights.updatedAt)),
  ]);

  return {
    student,
    lessons: studentLessons,
    goals: studentGoals,
    corrections: studentCorrections,
    vocabulary: studentVocabulary,
    homework: studentHomework,
    insights: studentInsights,
  };
}

export type StudentProfile = NonNullable<
  Awaited<ReturnType<typeof getStudentProfile>>
>;

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export type LessonListRow = Lesson & { studentName: string };

export async function listLessons(teacherId: string): Promise<LessonListRow[]> {
  const rows = await db
    .select({ lesson: lessons, studentName: students.name })
    .from(lessons)
    .innerJoin(students, eq(students.id, lessons.studentId))
    .where(eq(lessons.teacherId, teacherId))
    .orderBy(desc(lessons.startedAt));
  return rows.map((r) => ({ ...r.lesson, studentName: r.studentName }));
}

export async function getLessonWithRecords(
  teacherId: string,
  lessonId: string,
) {
  const row = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacherId)),
  });
  if (!row) return null;

  const [student, topics, lessonCorrections, lessonVocabulary, lessonHomework, lessonInsights] =
    await Promise.all([
      getStudent(teacherId, row.studentId),
      db
        .select()
        .from(lessonTopics)
        .where(eq(lessonTopics.lessonId, lessonId))
        .orderBy(lessonTopics.createdAt),
      db
        .select()
        .from(corrections)
        .where(eq(corrections.lessonId, lessonId))
        .orderBy(corrections.createdAt),
      db
        .select()
        .from(vocabularyItems)
        .where(eq(vocabularyItems.lessonId, lessonId))
        .orderBy(vocabularyItems.createdAt),
      db
        .select()
        .from(homework)
        .where(eq(homework.lessonId, lessonId))
        .orderBy(homework.createdAt),
      db
        .select()
        .from(insights)
        .where(eq(insights.sourceLessonId, lessonId))
        .orderBy(insights.createdAt),
    ]);

  if (!student) return null;

  return {
    lesson: row,
    student,
    topics,
    corrections: lessonCorrections,
    vocabulary: lessonVocabulary,
    homework: lessonHomework,
    insights: lessonInsights,
  };
}

export type LessonDetail = NonNullable<
  Awaited<ReturnType<typeof getLessonWithRecords>>
>;

// ---------------------------------------------------------------------------
// Prep sheet — everything the teacher should glance at before the next
// lesson with a student, assembled from the permanent record.
// ---------------------------------------------------------------------------

export async function getPrepSheet(teacherId: string, studentId: string) {
  const student = await getStudent(teacherId, studentId);
  if (!student) return null;

  const [
    recentLessons,
    openHomework,
    reviewVocabulary,
    recentCorrections,
    activeGoals,
    prepInsights,
  ] = await Promise.all([
    db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.teacherId, teacherId),
          eq(lessons.studentId, studentId),
          happenedLesson(),
        ),
      )
      .orderBy(desc(lessons.startedAt))
      .limit(3),
    db
      .select()
      .from(homework)
      .where(
        and(
          eq(homework.teacherId, teacherId),
          eq(homework.studentId, studentId),
          inArray(homework.status, ["assigned", "submitted"]),
        ),
      )
      .orderBy(sql`${homework.dueAt} ASC NULLS LAST`),
    db
      .select()
      .from(vocabularyItems)
      .where(
        and(
          eq(vocabularyItems.teacherId, teacherId),
          eq(vocabularyItems.studentId, studentId),
          inArray(vocabularyItems.status, ["new", "learning", "reviewing"]),
        ),
      )
      .orderBy(desc(vocabularyItems.createdAt))
      .limit(15),
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
      .from(goals)
      .where(
        and(
          eq(goals.teacherId, teacherId),
          eq(goals.studentId, studentId),
          eq(goals.status, "active"),
        ),
      )
      .orderBy(desc(goals.updatedAt)),
    db
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.teacherId, teacherId),
          eq(insights.studentId, studentId),
          inArray(insights.type, [
            "recurringMistake",
            "weakness",
            "teachingStrategy",
            "learningPreference",
          ]),
        ),
      )
      .orderBy(desc(insights.updatedAt))
      .limit(8),
  ]);

  const lastLesson = recentLessons[0] ?? null;
  const [lastLessonTopics, nextScheduled] = await Promise.all([
    lastLesson
      ? db
          .select()
          .from(lessonTopics)
          .where(eq(lessonTopics.lessonId, lastLesson.id))
          .orderBy(lessonTopics.createdAt)
      : Promise.resolve([]),
    db.query.lessons.findFirst({
      where: and(
        eq(lessons.teacherId, teacherId),
        eq(lessons.studentId, studentId),
        eq(lessons.status, "scheduled"),
      ),
      orderBy: asc(lessons.startedAt),
    }),
  ]);

  return {
    student,
    lastLesson,
    nextScheduled: nextScheduled ?? null,
    lastLessonTopics,
    nextFocus:
      recentLessons.find((l) => l.nextLessonFocus)?.nextLessonFocus ?? null,
    openHomework,
    reviewVocabulary,
    recentCorrections,
    activeGoals,
    insights: prepInsights,
  };
}

export type PrepSheet = NonNullable<Awaited<ReturnType<typeof getPrepSheet>>>;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardData(teacherId: string) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    upcomingLessons,
    recentLessons,
    pendingReview,
    openHomework,
    staleStudents,
    studentCount,
  ] = await Promise.all([
      db
        .select({ lesson: lessons, studentName: students.name })
        .from(lessons)
        .innerJoin(students, eq(students.id, lessons.studentId))
        .where(
          and(eq(lessons.teacherId, teacherId), eq(lessons.status, "scheduled")),
        )
        .orderBy(asc(lessons.startedAt))
        .limit(8),
      db
        .select({ lesson: lessons, studentName: students.name })
        .from(lessons)
        .innerJoin(students, eq(students.id, lessons.studentId))
        .where(and(eq(lessons.teacherId, teacherId), happenedLesson()))
        .orderBy(desc(lessons.startedAt))
        .limit(6),
      db
        .select({ lesson: lessons, studentName: students.name })
        .from(lessons)
        .innerJoin(students, eq(students.id, lessons.studentId))
        .where(
          and(
            eq(lessons.teacherId, teacherId),
            inArray(lessons.status, ["draft", "processed"]),
          ),
        )
        .orderBy(desc(lessons.startedAt))
        .limit(8),
      db
        .select({ hw: homework, studentName: students.name })
        .from(homework)
        .innerJoin(students, eq(students.id, homework.studentId))
        .where(
          and(
            eq(homework.teacherId, teacherId),
            inArray(homework.status, ["assigned", "submitted"]),
          ),
        )
        .orderBy(sql`${homework.dueAt} ASC NULLS LAST`)
        .limit(8),
      db
        .select({
          student: students,
          lastLessonAt: max(lessons.startedAt).as("last_lesson_at"),
        })
        .from(students)
        .leftJoin(
          lessons,
          and(
            eq(lessons.studentId, students.id),
            eq(lessons.teacherId, teacherId),
            happenedLesson(),
          ),
        )
        .where(
          and(eq(students.teacherId, teacherId), eq(students.status, "active")),
        )
        .groupBy(students.id)
        .having(
          or(
            isNull(max(lessons.startedAt)),
            // max() loses the column's Date mapping, so compare against an
            // ISO string — postgres-js can't serialize a Date param here.
            lt(
              max(lessons.startedAt),
              sql`${fourteenDaysAgo.toISOString()}::timestamptz`,
            ),
          ),
        )
        .limit(6),
      db
        .select({ value: count(students.id) })
        .from(students)
        .where(eq(students.teacherId, teacherId)),
    ]);

  return {
    upcomingLessons: upcomingLessons.map((r) => ({
      ...r.lesson,
      studentName: r.studentName,
    })),
    recentLessons: recentLessons.map((r) => ({ ...r.lesson, studentName: r.studentName })),
    pendingReview: pendingReview.map((r) => ({ ...r.lesson, studentName: r.studentName })),
    openHomework: openHomework.map((r) => ({ ...r.hw, studentName: r.studentName })),
    staleStudents: staleStudents.map((r) => ({
      ...r.student,
      lastLessonAt: r.lastLessonAt ?? null,
    })),
    studentCount: studentCount[0]?.value ?? 0,
  };
}
