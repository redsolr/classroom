import { TrendingUp } from "lucide-react";
import type { StudentProfile } from "@/lib/queries";
import { buildProgress } from "@/lib/progress";
import { correctionCategoryLabel } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

const pipelineSegments = [
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

function VocabularyPipelineCard({
  pipeline,
}: {
  pipeline: ReturnType<typeof buildProgress>["vocabulary"];
}) {
  return (
    <Card>
      <CardHeader title="Vocabulary pipeline" />
      <div className="px-4 py-4">
        {pipeline.total === 0 ? (
          <p className="text-[0.875rem] text-fg-tertiary">
            No vocabulary on record yet.
          </p>
        ) : (
          <>
            <div className="flex h-3 gap-[2px]">
              {pipelineSegments
                .filter((s) => pipeline[s.key] > 0)
                .map((s) => (
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
              {pipelineSegments.map((s) => (
                <span
                  key={s.key}
                  className="flex items-center gap-1.5 text-[0.8125rem] text-fg-secondary"
                >
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${s.fill}`}
                  />
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

function CorrectionsPerLessonCard({
  rows,
  topCategories,
}: {
  rows: ReturnType<typeof buildProgress>["correctionsPerLesson"];
  topCategories: ReturnType<typeof buildProgress>["topCategories"];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader title="Corrections per lesson" />
      <div className="px-4 py-4">
        {rows.length === 0 ? (
          <p className="text-[0.875rem] text-fg-tertiary">
            No lessons on record yet.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.lessonId} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-[0.8125rem] text-fg-tertiary">
                    {r.label}
                  </span>
                  <span className="h-2.5 flex-1">
                    <span
                      className="block h-full rounded-r-[4px] bg-viz-accent"
                      style={{ width: `${(r.count / max) * 100}%` }}
                      title={`${r.count} correction${r.count === 1 ? "" : "s"}`}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-[0.8125rem] font-medium tabular-nums">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
            {topCategories.length > 0 && (
              <p className="mt-3.5 border-t border-border pt-3 text-[0.8125rem] text-fg-tertiary">
                Most corrected:{" "}
                {topCategories
                  .map(
                    (c) =>
                      `${correctionCategoryLabel[c.category]} (${c.count})`,
                  )
                  .join(" · ")}
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export function ProgressSection({ profile }: { profile: StudentProfile }) {
  const progress = buildProgress(profile);
  const hasAnything =
    profile.lessons.length > 0 ||
    progress.vocabulary.total > 0 ||
    progress.homework.total > 0 ||
    progress.goals.total > 0;

  if (!hasAnything) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="No progress to show yet"
        description={`Once ${profile.student.name} has lessons and records, their vocabulary pipeline, correction trend, and homework completion appear here.`}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Vocabulary mastered"
          value={`${progress.vocabulary.mastered} of ${progress.vocabulary.total}`}
          detail={
            progress.vocabulary.total > 0
              ? `${progress.vocabulary.learning + progress.vocabulary.reviewing} in review`
              : undefined
          }
        />
        <StatTile
          label="Homework completed"
          value={`${progress.homework.done} of ${progress.homework.total}`}
          detail={
            progress.homework.total - progress.homework.done > 0
              ? `${progress.homework.total - progress.homework.done} still open`
              : "all closed out"
          }
        />
        <StatTile
          label="Goals completed"
          value={`${progress.goals.completed} of ${progress.goals.total}`}
          detail={
            progress.goals.total - progress.goals.completed > 0
              ? `${progress.goals.total - progress.goals.completed} in progress`
              : undefined
          }
        />
      </div>

      <VocabularyPipelineCard pipeline={progress.vocabulary} />
      <CorrectionsPerLessonCard
        rows={progress.correctionsPerLesson}
        topCategories={progress.topCategories}
      />
    </div>
  );
}
