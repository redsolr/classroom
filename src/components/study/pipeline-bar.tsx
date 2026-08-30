/**
 * THE PIPELINE BAR — how many cards sit at each stage of learning.
 *
 * One segmented bar plus its legend, shared by the teacher's per-student
 * progress section and the learner's own `/progress` page. It existed
 * twice, including the `viz-*` fill mapping, which is the copy that
 * mattered: those tokens are validated for lightness band, chroma, CVD
 * separation and contrast against both surfaces (see globals.css), and a
 * second copy is exactly where someone eventually substitutes a colour
 * that reads fine in dark mode and vanishes in light.
 *
 * The stage ORDER is the pipeline's meaning and is not configurable —
 * new → learning → reviewing → mastered reads left to right as progress,
 * and a caller sorting it differently would be telling a different story
 * with the same picture.
 */

export type Pipeline = {
  new: number;
  learning: number;
  reviewing: number;
  mastered: number;
  total: number;
};

const SEGMENTS = [
  { key: "new", label: "New", fill: "bg-viz-info" },
  { key: "learning", label: "Learning", fill: "bg-viz-warning" },
  { key: "reviewing", label: "Reviewing", fill: "bg-viz-accent" },
  { key: "mastered", label: "Mastered", fill: "bg-viz-success" },
] as const;

export function PipelineBar({
  pipeline,
  /** What the counts are OF, for the empty state ("no words saved yet"). */
  unit,
}: {
  pipeline: Pipeline;
  unit: string;
}) {
  if (pipeline.total === 0) {
    return <p className="text-[0.875rem] text-fg-tertiary">No {unit} yet.</p>;
  }

  return (
    <div className="pipeline-bar">
      {/* Zero-width segments are filtered out rather than rendered at 0%:
          a 2px gap between two bars that aren't there reads as a
          rendering fault. */}
      <div className="flex h-3 gap-[2px]">
        {SEGMENTS.filter((s) => pipeline[s.key] > 0).map((s) => (
          <div
            key={s.key}
            className={`${s.fill} first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${(pipeline[s.key] / pipeline.total) * 100}%` }}
            title={`${s.label}: ${pipeline[s.key]} of ${pipeline.total}`}
          />
        ))}
      </div>
      {/* The legend lists EVERY stage, including the empty ones — the bar
          shows proportions, and the legend is where you read the actual
          numbers, so a missing zero is a missing answer. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {SEGMENTS.map((s) => (
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
    </div>
  );
}
