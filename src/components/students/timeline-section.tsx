import Link from "next/link";
import { format } from "date-fns";
import {
  BookOpenText,
  ClipboardCheck,
  History,
  Lightbulb,
  MessageSquareQuote,
  Share2,
  SpellCheck,
  Target,
} from "lucide-react";
import type { StudentProfile } from "@/lib/queries";
import {
  buildStudentTimeline,
  type TimelineEvent,
  type TimelineKind,
} from "@/lib/timeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

const kindIcons: Record<TimelineKind, React.ReactNode> = {
  lesson: <BookOpenText className="size-4" />,
  recap: <Share2 className="size-4" />,
  corrections: <MessageSquareQuote className="size-4" />,
  vocabulary: <SpellCheck className="size-4" />,
  homework: <ClipboardCheck className="size-4" />,
  goal: <Target className="size-4" />,
  insight: <Lightbulb className="size-4" />,
};

function EventRow({ event }: { event: TimelineEvent }) {
  const body = (
    <>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-fg-tertiary">
        {kindIcons[event.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[0.9375rem] font-medium">{event.title}</span>
          {event.badge && (
            <Badge tone={event.badge.tone}>{event.badge.label}</Badge>
          )}
          <span className="ml-auto text-[0.78rem] text-fg-tertiary">
            {format(event.at, "HH:mm")}
          </span>
        </span>
        {event.detail && (
          <span className="mt-0.5 block text-[0.875rem] text-fg-secondary">
            {event.detail}
          </span>
        )}
      </span>
    </>
  );

  if (event.href) {
    return (
      <Link
        href={event.href}
        className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex items-start gap-3 py-2.5">{body}</div>;
}

export function TimelineSection({ profile }: { profile: StudentProfile }) {
  const days = buildStudentTimeline(profile);

  if (days.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="No history yet"
        description={`Everything that happens with ${profile.student.name} — lessons, corrections, vocabulary, homework, goals — will appear here in one stream.`}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {days.map((day) => (
        <div key={day.key}>
          <p className="mb-2 text-[0.8125rem] font-medium text-fg-tertiary">
            {day.label}
          </p>
          <Card>
            <ul className="divide-y divide-border px-4 py-1">
              {day.events.map((event) => (
                <li key={event.key}>
                  <EventRow event={event} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ))}
    </div>
  );
}
