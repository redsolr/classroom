import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  learners,
  students,
  studyReviews,
  studyVocab,
  tutorBookings,
} from "@/db";

/**
 * WHAT THE TUTOR IS ACTUALLY FOR.
 *
 * The founder's read, and it reframes the whole tutor pilot: "the tutor
 * is more of a motivation and person who will push and really check up
 * whether the student really progressed their work, not just teaching —
 * because AI is already able to teach and explain well, but it makes
 * learners lazy."
 *
 * That is correct and it is worth being precise about why. A model will
 * explain the same grammar point for the ninth time, patiently, at 2am,
 * and never once ask why you are asking again. It never notices you have
 * not opened the app in eleven days. It cannot be disappointed. Those
 * are not defects of the model — they are the parts of teaching that
 * only work when a person is on the other end.
 *
 * So the thing the tutor needs before a lesson is not a lesson plan. It
 * is the answer to "did they actually do the work", and it has to be
 * ANSWERED FOR THEM rather than asked of the learner, because asking is
 * exactly the moment a learner starts managing their tutor's impression
 * instead of studying.
 *
 * Everything below is drawn from the review log. It is the same evidence
 * the learner sees on their own `/progress` page — deliberately, so a
 * lesson can start from a shared set of facts rather than two accounts
 * of the same fortnight.
 */

export type AccountabilityWindow = {
  /** Days with at least one review, in the window. */
  activeDays: number;
  windowDays: number;
  reviews: number;
  /** Correct answers as a share of graded ones. Null under 10 answers. */
  retentionPercent: number | null;
  /** Cards that reached "known" during the window. */
  newlyKnown: number;
  /** Words added but never once reviewed — the shape of "collecting". */
  neverReviewed: number;
  lastStudiedAt: Date | null;
  /** Whole days since the last review, null if they never have. Computed
   * HERE rather than in the card: a component that reads the clock is
   * impure, and the server already knows what "now" was for this render. */
  daysSinceLastStudy: number | null;
  /** The most-missed words, worth a minute of the lesson. */
  struggling: { term: string; meaning: string | null; misses: number }[];
};

const WINDOW_DAYS = 14;

/**
 * Read a learner's last fortnight, for their tutor.
 *
 * Takes the LEARNER id, resolved from the roster row's email — the
 * bridge between the two halves of the app. A tutor sees this only for
 * someone who booked them, which the caller enforces by looking the
 * student up under their own teacher id first.
 */
export async function accountabilityFor(
  learnerId: string,
  now = new Date(),
): Promise<AccountabilityWindow> {
  const since = new Date(now);
  since.setDate(since.getDate() - WINDOW_DAYS);

  const [reviews, words, misses] = await Promise.all([
    db
      .select({
        grade: studyReviews.grade,
        reviewedAt: studyReviews.reviewedAt,
      })
      .from(studyReviews)
      .where(
        and(
          eq(studyReviews.learnerId, learnerId),
          gte(studyReviews.reviewedAt, since),
        ),
      )
      .orderBy(desc(studyReviews.reviewedAt)),
    db
      .select({
        status: studyVocab.status,
        lastReviewedAt: studyVocab.lastReviewedAt,
        srsReps: studyVocab.srsReps,
      })
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learnerId)),
    // The words they get wrong most — one join, because "what should we
    // spend the lesson on" is the question this whole read exists for.
    db
      .select({
        term: studyVocab.term,
        meaning: studyVocab.meaning,
        misses: sql<number>`count(*)::int`,
      })
      .from(studyReviews)
      .innerJoin(studyVocab, eq(studyVocab.id, studyReviews.vocabId))
      .where(
        and(
          eq(studyReviews.learnerId, learnerId),
          eq(studyReviews.grade, "again"),
          gte(studyReviews.reviewedAt, since),
        ),
      )
      .groupBy(studyVocab.term, studyVocab.meaning)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
  ]);

  const days = new Set(
    reviews.map((r) => r.reviewedAt.toISOString().slice(0, 10)),
  );
  const correct = reviews.filter((r) => r.grade !== "again").length;

  return {
    activeDays: days.size,
    windowDays: WINDOW_DAYS,
    reviews: reviews.length,
    // Same floor as the learner's own page: under ten answers a single
    // miss swings the number ten points, and a tutor acting on that is
    // acting on noise.
    retentionPercent:
      reviews.length >= 10
        ? Math.round((correct / reviews.length) * 100)
        : null,
    newlyKnown: words.filter(
      (w) =>
        (w.status === "reviewing" || w.status === "mastered") &&
        w.lastReviewedAt &&
        w.lastReviewedAt >= since,
    ).length,
    // Saving words and never reviewing them is the single most common
    // way self-study fails, and it is invisible from inside: the shelf
    // looks like progress.
    neverReviewed: words.filter((w) => w.srsReps === 0).length,
    lastStudiedAt: reviews[0]?.reviewedAt ?? null,
    daysSinceLastStudy: reviews[0]
      ? Math.floor((now.getTime() - reviews[0].reviewedAt.getTime()) / 86_400_000)
      : null,
    struggling: misses,
  };
}

/**
 * The learner behind a roster row, if there is one.
 *
 * A student the tutor typed in by hand has no learner account and no
 * study evidence — which is a normal state, not an error, so this
 * returns null rather than throwing and the caller simply shows nothing.
 */
export async function learnerForStudent(
  studentId: string,
  teacherId: string,
): Promise<string | null> {
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.teacherId, teacherId)),
    columns: { email: true },
  });
  if (!student?.email) return null;

  const learner = await db.query.learners.findFirst({
    where: eq(learners.email, student.email),
    columns: { id: true },
  });
  return learner?.id ?? null;
}

/** Learners this tutor has upcoming lessons with — who to check on. */
export async function upcomingLearners(teacherId: string, now = new Date()) {
  return db
    .select({
      learnerId: tutorBookings.learnerId,
      studentId: tutorBookings.studentId,
      startsAt: tutorBookings.startsAt,
      name: students.name,
    })
    .from(tutorBookings)
    .innerJoin(students, eq(students.id, tutorBookings.studentId))
    .where(
      and(
        eq(tutorBookings.teacherId, teacherId),
        eq(tutorBookings.status, "confirmed"),
        gte(tutorBookings.startsAt, now),
      ),
    )
    .orderBy(tutorBookings.startsAt);
}
