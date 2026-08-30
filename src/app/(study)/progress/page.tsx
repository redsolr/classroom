import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { TrendingUp } from "lucide-react";
import { db, studyReviews, studySentences, studyVocab } from "@/db";
import { requireLearner } from "@/lib/auth";
import { buildStudyProgress } from "@/lib/study-progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardHeader, PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Progress" };

/**
 * PROGRESS — whether any of this is working.
 *
 * The one question the app could not answer. It could say what was due
 * and what existed; it could not say whether four weeks had moved
 * anything, which is the question that decides whether someone keeps
 * going. Streaks and word counts are not decoration here — they are the
 * only evidence a self-directed learner has that the effort is
 * compounding.
 *
 * ── Every number is traceable ──────────────────────────────────────
 *
 * There is no level, no grade, no model-written assessment. Each figure
 * is a fact about something the learner did, derived from the review log
 * (`study_reviews`), and each one is phrased so they could check it
 * themselves. That is the standing doctrine and it is also the only
 * version that survives being doubted: the first time a "B1" disagrees
 * with how someone feels, they stop believing every number on the page.
 * "31 words you have got right on a later day" does not have that
 * failure mode.
 *
 * The charts reuse the teacher-side idiom exactly (`viz-*` tokens,
 * segmented pipeline bar, labelled horizontal bars) rather than
 * introducing a second chart language for the same product.
 */

const PIPELINE_SEGMENTS = [
  { key: "new", label: "New", fill: "bg-viz-info" },
  { key: "learning", label: "Learning", fill: "bg-viz-warning" },
  { key: "reviewing", label: "Reviewing", fill: "bg-viz-accent" },
  { key: "mastered", label: "Mastered", fill: "bg-viz-success" },
] as const;

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[0.8125rem] font-medium text-fg-tertiary">{label}</p>
      <p className="mt-1 text-[1.5rem] leading-none font-semibold tracking-tight">
        {value}
      </p>
      {detail && (
        <p className="mt-1.5 text-[0.8125rem] text-fg-tertiary">{detail}</p>
      )}
    </Card>
  );
}

function PipelineCard({
  title,
  pipeline,
  unit,
}: {
  title: string;
  pipeline: { new: number; learning: number; reviewing: number; mastered: number; total: number };
  unit: string;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="px-4 py-4">
        {pipeline.total === 0 ? (
          <p className="text-[0.875rem] text-fg-tertiary">
            No {unit} yet.
          </p>
        ) : (
          <>
            <div className="flex h-3 gap-[2px]">
              {PIPELINE_SEGMENTS.filter((s) => pipeline[s.key] > 0).map((s) => (
                <div
                  key={s.key}
                  className={`${s.fill} first:rounded-l-full last:rounded-r-full`}
                  style={{
                    width: `${(pipeline[s.key] / pipeline.total) * 100}%`,
                  }}
                  title={`${s.label}: ${pipeline[s.key]} of ${pipeline.total}`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {PIPELINE_SEGMENTS.map((s) => (
                <span
                  key={s.key}
                  className="flex items-center gap-1.5 text-[0.8125rem] text-fg-secondary"
                >
                  <span aria-hidden className={`size-2 rounded-full ${s.fill}`} />
                  {s.label}
                  <span className="font-medium text-fg">{pipeline[s.key]}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default async function StudyProgressPage() {
  const learner = await requireLearner();
  const now = new Date();

  const [words, sentences, reviews] = await Promise.all([
    db
      .select({
        status: studyVocab.status,
        srsReps: studyVocab.srsReps,
        srsDueAt: studyVocab.srsDueAt,
        lastReviewedAt: studyVocab.lastReviewedAt,
      })
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learner.id)),
    db
      .select({
        status: studySentences.status,
        srsReps: studySentences.srsReps,
        srsDueAt: studySentences.srsDueAt,
        lastReviewedAt: studySentences.lastReviewedAt,
      })
      .from(studySentences)
      .where(eq(studySentences.learnerId, learner.id)),
    db
      .select({
        grade: studyReviews.grade,
        reviewedAt: studyReviews.reviewedAt,
      })
      .from(studyReviews)
      .where(eq(studyReviews.learnerId, learner.id))
      .orderBy(desc(studyReviews.reviewedAt))
      // A year of daily practice is ~10k rows; the summary reads a
      // window well inside that and the cap keeps one very long-lived
      // account from turning this page into a table scan.
      .limit(5000),
  ]);

  const progress = buildStudyProgress({
    words,
    sentences,
    // "again" is the only grade that means you did not have it. Hard is a
    // struggle you won, and counting it as a failure would make the
    // retention number punish honesty about difficulty.
    reviews: reviews.map((r) => ({
      reviewedAt: r.reviewedAt,
      correct: r.grade !== "again",
    })),
    now,
  });

  if (progress.totalCards === 0) {
    return (
      <PageShell>
        <PageHeader icon={TrendingUp} title="Progress" />
        <EmptyState
          icon={<TrendingUp />}
          title="Nothing to measure yet"
          description="Save some words and review them a few times — every number on this page is derived from reviews you've actually done, so it stays empty until there's something real to show."
          action={
            <Link
              href="/official"
              className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[0.9375rem] font-medium text-white"
            >
              Browse official books
            </Link>
          }
        />
      </PageShell>
    );
  }

  const maxDay = Math.max(1, ...progress.recentActivity.map((d) => d.count));

  return (
    <PageShell>
      <PageHeader
        icon={TrendingUp}
        title="Progress"
        subtitle="Everything here is counted from reviews you actually did — no levels, no estimates."
      />

      <div className="max-w-3xl space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Words and sentences you know"
            value={`${progress.knownCards}`}
            detail={`of ${progress.totalCards} you're carrying`}
          />
          <StatTile
            label="Recall, last 30 days"
            value={
              progress.retentionPercent === null
                ? "—"
                : `${progress.retentionPercent}%`
            }
            detail={
              progress.retentionPercent === null
                ? "needs 10 reviews to be meaningful"
                : "answers you got right"
            }
          />
          <StatTile
            label="Streak"
            value={`${progress.streakDays} day${progress.streakDays === 1 ? "" : "s"}`}
            detail={`${progress.activeDaysLast30} of the last 30 days`}
          />
        </div>

        {/* The one sentence that answers "is this working". Counted, not
            judged — and it names the window, because "31 words" with no
            timeframe is a number nobody can act on. */}
        {progress.newlyKnownLast30 > 0 && (
          <Card className="px-4 py-3.5">
            <p className="text-[0.9375rem]">
              <span className="font-semibold">
                {progress.newlyKnownLast30}
              </span>{" "}
              card{progress.newlyKnownLast30 === 1 ? "" : "s"} moved into
              &ldquo;you know this&rdquo; in the last 30 days — you got
              {progress.newlyKnownLast30 === 1 ? " it" : " them"} right on a
              later day, not just the day you added
              {progress.newlyKnownLast30 === 1 ? " it" : " them"}.
            </p>
          </Card>
        )}

        <Card>
          <CardHeader title="Reviews per day, last 14 days" />
          <div className="px-4 py-4">
            {/* A column strip rather than a line: fourteen daily counts is
                a habit, and a habit reads as presence-or-absence. A line
                chart of the same data invites reading a trend into what
                is really "did you show up". */}
            <div className="flex h-24 items-end gap-1.5">
              {progress.recentActivity.map((day) => (
                <div
                  key={day.date}
                  className="flex h-full flex-1 flex-col justify-end"
                  title={`${day.date}: ${day.count} review${day.count === 1 ? "" : "s"}`}
                >
                  <div
                    className={
                      day.count > 0
                        ? "rounded-t-[3px] bg-viz-accent"
                        : "rounded-t-[3px] bg-surface-hover"
                    }
                    // A zero day keeps a 2px stub so the row still reads
                    // as fourteen days rather than as a gap in the data.
                    style={{
                      height:
                        day.count > 0
                          ? `${Math.max(8, (day.count / maxDay) * 100)}%`
                          : "2px",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[0.75rem] text-fg-tertiary">
              <span>14 days ago</span>
              <span>Today</span>
            </div>
          </div>
        </Card>

        <PipelineCard
          title="Words"
          pipeline={progress.words}
          unit="words saved"
        />
        <PipelineCard
          title="Sentence cards"
          pipeline={progress.sentences}
          unit="sentence cards"
        />

        <p className="px-1 text-[0.8125rem] text-fg-tertiary">
          &ldquo;Known&rdquo; means a card reached <em>reviewing</em> or{" "}
          <em>mastered</em> — it came back on a later day and you still had
          it. Recognising a word ten seconds after reading its meaning
          doesn&rsquo;t count, which is why this number is smaller than your
          word count and worth more.
        </p>
      </div>
    </PageShell>
  );
}
