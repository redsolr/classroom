import type { Metadata } from "next";
import Link from "next/link";
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import {
  ArrowRight,
  BookOpenText,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Compass,
  MessageSquareQuote,
  NotebookPen,
  Target,
} from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import {
  getLessonWithRecords,
  getPrepSheet,
  getScheduleData,
  listStudents,
} from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import { Badge, homeworkStatusTone, lessonStatusTone } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";
import { ScheduledLessonPanel } from "@/components/lessons/scheduled-lesson-panel";

export const metadata: Metadata = { title: "Schedule" };

type ScheduleRow = Awaited<ReturnType<typeof getScheduleData>>["upcoming"][number];

function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEEE, MMM d");
}

function LessonRow({
  row,
  selected,
  showDistance,
}: {
  row: ScheduleRow;
  selected: boolean;
  showDistance?: boolean;
}) {
  return (
    <Link
      href={`/schedule?lesson=${row.id}`}
      className={`flex items-center gap-2.5 px-3 py-2 transition-colors ${
        selected ? "bg-accent-soft" : "hover:bg-surface-hover"
      }`}
    >
      <Avatar name={row.studentName} size="sm" />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[0.9375rem] font-medium ${selected ? "text-accent-text" : ""}`}
        >
          {row.studentName}
        </span>
        <span className="block truncate text-[0.78rem] text-fg-tertiary">
          {showDistance
            ? `${row.title ?? "Lesson"} · ${formatDistanceToNow(new Date(row.startedAt), { addSuffix: true })}`
            : `${format(new Date(row.startedAt), "HH:mm")}${row.durationMinutes ? ` · ${row.durationMinutes} min` : ""}${row.title ? ` · ${row.title}` : ""}`}
        </span>
      </span>
      <Badge tone={lessonStatusTone[row.status]}>{row.status}</Badge>
    </Link>
  );
}

async function DetailPanel({
  teacherId,
  lessonId,
}: {
  teacherId: string;
  lessonId: string;
}) {
  const detail = await getLessonWithRecords(teacherId, lessonId);
  if (!detail) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Lesson not found"
        description="It may have been deleted — pick another from the list."
      />
    );
  }
  const sheet = await getPrepSheet(teacherId, detail.student.id);
  const { lesson, student } = detail;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={student.name} size="lg" />
          <div>
            <Link
              href={`/students/${student.id}`}
              className="text-[1.25rem] font-semibold tracking-tight hover:underline"
            >
              {student.name}
            </Link>
            <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
              {student.targetLanguage}
              {student.currentLevel ? ` · ${student.currentLevel}` : ""}
              {student.platform ? ` · ${student.platform}` : ""}
              {` · ${format(new Date(lesson.startedAt), "EEE, MMM d · HH:mm")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/students/${student.id}/prep`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[0.875rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
          >
            <ClipboardList className="size-3.5 text-fg-tertiary" />
            Full prep sheet
          </Link>
          <Link
            href={`/lessons/${lesson.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-[0.875rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
          >
            <BookOpenText className="size-3.5 text-fg-tertiary" />
            Open lesson
          </Link>
        </div>
      </div>

      {lesson.status === "scheduled" ? (
        <ScheduledLessonPanel detail={detail} />
      ) : (
        <Card>
          <div className="flex items-start gap-3 px-4 py-3.5">
            <NotebookPen className="mt-0.5 size-4.5 shrink-0 text-accent" />
            <div>
              <p className="text-[0.9375rem] font-medium">
                This lesson is in <em>{lesson.status}</em> — finish the
                write-up so {student.name} gets their recap.
              </p>
              <Link
                href={`/lessons/${lesson.id}`}
                className="mt-1 inline-flex items-center gap-1 text-[0.875rem] text-accent-text hover:underline"
              >
                Continue write-up
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-start gap-3 px-4 py-3.5">
          <Compass className="mt-0.5 size-4.5 shrink-0 text-accent" />
          <div>
            <p className="text-[0.875rem] font-semibold text-fg-secondary">
              Suggested focus
            </p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed">
              {sheet?.nextFocus ??
                "No suggestion yet — process a lesson and one will appear here."}
            </p>
          </div>
        </div>
      </Card>

      {sheet?.lastLesson && (
        <Card>
          <CardHeader
            title="Last lesson — where you left off"
            actions={
              <Link
                href={`/lessons/${sheet.lastLesson.id}`}
                className="inline-flex items-center gap-1 text-[0.8125rem] text-accent-text hover:underline"
              >
                Open
                <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="px-4 py-3">
            <p className="text-[0.9375rem] font-medium">
              {sheet.lastLesson.title ?? "Untitled lesson"}
              <span className="ml-2 text-[0.8125rem] font-normal text-fg-tertiary">
                {formatDistanceToNow(new Date(sheet.lastLesson.startedAt), {
                  addSuffix: true,
                })}
              </span>
            </p>
            {sheet.lastLesson.summary && (
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-fg-secondary">
                {sheet.lastLesson.summary}
              </p>
            )}
            {sheet.lastLessonTopics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sheet.lastLessonTopics.map((t) => (
                  <Badge key={t.id} tone="accent">
                    {t.title}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-fg-tertiary" />
                Homework to check ({sheet?.openHomework.length ?? 0})
              </span>
            }
          />
          <div className="px-4 py-3">
            {!sheet || sheet.openHomework.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                Nothing outstanding.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {sheet.openHomework.slice(0, 4).map((h) => (
                  <li key={h.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
                      {h.title}
                    </span>
                    <Badge tone={homeworkStatusTone[h.status]}>{h.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <MessageSquareQuote className="size-4 text-fg-tertiary" />
                Mistakes to re-drill
              </span>
            }
          />
          <div className="px-4 py-3">
            {!sheet || sheet.recentCorrections.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                No corrections on record yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {sheet.recentCorrections.slice(0, 4).map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-[0.9375rem]"
                  >
                    <span className="text-danger line-through decoration-danger/40">
                      {c.originalText}
                    </span>
                    <span aria-hidden className="text-fg-tertiary">
                      →
                    </span>
                    <span className="font-medium text-success">
                      {c.correctedText}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <BookOpenText className="size-4 text-fg-tertiary" />
                Vocabulary to review
              </span>
            }
          />
          <div className="px-4 py-3">
            {!sheet || sheet.reviewVocabulary.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                Nothing waiting for review.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sheet.reviewVocabulary.slice(0, 10).map((v) => (
                  <Badge key={v.id} tone="accent">
                    {v.term}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Target className="size-4 text-fg-tertiary" />
                Active goals
              </span>
            }
          />
          <div className="px-4 py-3">
            {!sheet || sheet.activeGoals.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                No active goals.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {sheet.activeGoals.slice(0, 4).map((g) => (
                  <li key={g.id} className="text-[0.9375rem]">
                    {g.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

    </div>
  );
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  const { lesson: selectedId } = await searchParams;
  const teacher = await requireTeacher();
  const [{ upcoming, awaitingWriteUp }, students] = await Promise.all([
    getScheduleData(teacher.id),
    listStudents(teacher.id),
  ]);
  const studentOptions = students.map((s) => ({ id: s.id, name: s.name }));

  // Group upcoming appointments by day, preserving chronological order.
  const days: { label: string; rows: typeof upcoming }[] = [];
  for (const row of upcoming) {
    const label = dayLabel(new Date(row.startedAt));
    const day = days[days.length - 1];
    if (day && day.label === label) day.rows.push(row);
    else days.push({ label, rows: [row] });
  }

  const selected =
    selectedId ??
    upcoming[0]?.id ??
    awaitingWriteUp[0]?.id ??
    null;

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle={
          upcoming.length === 0
            ? "Nothing scheduled — pick a future time in “New lesson” to plan ahead."
            : `${upcoming.length} upcoming lesson${upcoming.length === 1 ? "" : "s"}`
        }
        actions={
          studentOptions.length > 0 ? (
            <NewLessonDialog
              students={studentOptions}
              triggerLabel="Schedule lesson"
            />
          ) : undefined
        }
      />

      {upcoming.length === 0 && awaitingWriteUp.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Your schedule is clear"
          description="Schedule a lesson with a future date & time and it will appear here, with the student's prep context one click away."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
          <div className="space-y-5">
            {days.map((day) => (
              <div key={day.label}>
                <p className="mb-1.5 px-2 text-[0.8125rem] font-medium text-fg-tertiary">
                  {day.label}
                </p>
                <Card className="overflow-hidden">
                  <div className="divide-y divide-border">
                    {day.rows.map((row) => (
                      <LessonRow
                        key={row.id}
                        row={row}
                        selected={row.id === selected}
                      />
                    ))}
                  </div>
                </Card>
              </div>
            ))}

            {awaitingWriteUp.length > 0 && (
              <div>
                <p className="mb-1.5 px-2 text-[0.8125rem] font-medium text-fg-tertiary">
                  Awaiting write-up
                </p>
                <Card className="overflow-hidden">
                  <div className="divide-y divide-border">
                    {awaitingWriteUp.map((row) => (
                      <LessonRow
                        key={row.id}
                        row={row}
                        selected={row.id === selected}
                        showDistance
                      />
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>

          <div className="min-w-0">
            {selected ? (
              <DetailPanel teacherId={teacher.id} lessonId={selected} />
            ) : (
              <EmptyState
                icon={<CalendarClock />}
                title="Pick a lesson"
                description="Select an appointment to see the student, their context, and what this lesson should cover."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
