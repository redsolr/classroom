import type { Metadata } from "next";
import Link from "next/link";
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import { CalendarClock } from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { getScheduleData, listStudents } from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import { Badge, lessonStatusTone } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";
import { DetailPanel } from "@/components/schedule/detail-panel";

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
