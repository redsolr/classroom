import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { requireTeacher } from "@/lib/auth";
import { getWeekLessons, listStudents } from "@/lib/queries";
import { nowIso, resolveWeekStart } from "@/lib/week";
import { PageHeader } from "@/components/ui/page-header";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";
import { WeekCalendar } from "@/components/schedule/week-calendar";

export const metadata: Metadata = { title: "Calendar" };

const DAY_MS = 24 * 60 * 60 * 1000;

function navButton(href: string, label: string) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border-strong bg-surface px-2.5 py-1 text-[0.8125rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
    >
      {label}
    </Link>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; created?: string }>;
}) {
  const { week, created } = await searchParams;
  const teacher = await requireTeacher();
  const weekStart = resolveWeekStart(week);

  const [weekLessons, students] = await Promise.all([
    getWeekLessons(teacher.id, weekStart),
    listStudents(teacher.id),
  ]);
  const studentOptions = students.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Click an empty slot to book a lesson right there."
        actions={
          studentOptions.length > 0 ? (
            <NewLessonDialog
              students={studentOptions}
              triggerLabel="Schedule lesson"
              stay="calendar"
            />
          ) : undefined
        }
      />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-[0.9375rem] font-medium">
          {format(weekStart, "MMM d")} –{" "}
          {format(new Date(weekStart.getTime() + 6 * DAY_MS), "MMM d, yyyy")}
        </p>
        <div className="flex items-center gap-1.5">
          {navButton(
            `/calendar?week=${format(new Date(weekStart.getTime() - 7 * DAY_MS), "yyyy-MM-dd")}`,
            "← Prev",
          )}
          {navButton("/calendar", "This week")}
          {navButton(
            `/calendar?week=${format(new Date(weekStart.getTime() + 7 * DAY_MS), "yyyy-MM-dd")}`,
            "Next →",
          )}
        </div>
      </div>

      <WeekCalendar
        lessons={weekLessons.map((l) => ({
          id: l.id,
          title: l.title,
          studentName: l.studentName,
          startedAt: l.startedAt.toISOString(),
          durationMinutes: l.durationMinutes,
          status: l.status,
        }))}
        students={studentOptions}
        weekStartIso={weekStart.toISOString()}
        todayIso={nowIso()}
        createdId={created}
      />
    </div>
  );
}
