import { Card } from "@/components/ui/page-header";

/**
 * One headline number with its label and a line of context.
 *
 * Extracted because it existed twice, verbatim: the teacher's per-student
 * progress section and the learner's own `/progress` page. Two copies of
 * a stat tile is how one of them quietly grows a different type scale,
 * and then two surfaces of the same product disagree about what a number
 * looks like.
 *
 * `detail` earns its place: a figure with no denominator or timeframe is
 * something nobody can act on, so the tile makes the qualifier a
 * first-class slot rather than an optional afterthought.
 */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="stat-tile px-4 py-3.5">
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
