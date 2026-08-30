import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import type { ConversationArea } from "@/lib/study-grading";
import { Card, CardHeader } from "@/components/ui/page-header";

/**
 * WHAT YOU CAN TALK ABOUT — and the exact line this does not cross.
 *
 * The founder asked for something that can "tell more which area
 * learners can now have a conversation in". This says:
 *
 *     "You know 38 of the 45 words in Café survival French — enough to
 *      order food and drink, ask for the bill, and follow the answer."
 *
 * The first clause is a COUNT of cards the learner got right on a later
 * day. The second is a fixed description we wrote for that topic. What
 * it never says is "you can hold a conversation", because that is a
 * claim about a person we have never heard speak — and the first time it
 * is wrong they stop believing everything else on the page.
 *
 * Coverage of a topic is checkable. Proficiency is a guess. The wording
 * here is load-bearing, not decorative: "you have the words for" is the
 * true version of the sentence the founder asked for.
 */
export function ConversationAreas({ areas }: { areas: ConversationArea[] }) {
  const ready = areas.filter((a) => a.ready);
  const building = areas.filter((a) => !a.ready).slice(0, 4);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <MessagesSquare className="size-4 text-fg-tertiary" />
            What you have the words for
          </span>
        }
      />
      <div className="space-y-4 px-4 py-4">
        {ready.length === 0 && (
          <p className="text-[0.875rem] text-fg-tertiary">
            Nothing over the line yet — keep going on a topic and it shows
            up here once you know most of it.
          </p>
        )}

        {ready.map((area) => (
          <div key={area.slug}>
            <p className="text-[0.9375rem]">
              <Link
                href={`/official/${area.slug}`}
                className="font-semibold underline-offset-2 hover:underline"
              >
                {area.name}
              </Link>{" "}
              <span className="text-fg-secondary">
                — you know {area.known} of its {area.total} words
                {area.ability && `, enough to ${area.ability}`}.
              </span>
            </p>
            <Bar percent={area.percent} strong />
          </div>
        ))}

        {building.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-[0.8125rem] text-fg-tertiary">
              Getting there
            </p>
            <ul className="space-y-2.5">
              {building.map((area) => (
                <li key={area.slug}>
                  <p className="flex items-baseline justify-between gap-3 text-[0.875rem]">
                    <Link
                      href={`/official/${area.slug}`}
                      className="truncate underline-offset-2 hover:underline"
                    >
                      {area.name}
                    </Link>
                    <span className="shrink-0 text-fg-tertiary tabular-nums">
                      {area.known}/{area.total}
                    </span>
                  </p>
                  <Bar percent={area.percent} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Bar({ percent, strong }: { percent: number; strong?: boolean }) {
  return (
    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
      <span
        className={`block h-full rounded-full ${strong ? "bg-viz-success" : "bg-viz-accent"}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}
