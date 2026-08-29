import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { getWeekLessons, listStudents } from "@/lib/queries";
import { nowIso, resolveWeekStart } from "@/lib/week";
import { PageHeader } from "@/components/ui/page-header";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";
import { WeekCalendar } from "@/components/schedule/week-calendar";
import { WeekNav } from "@/components/schedule/week-nav";

export const metadata: Metadata = { title: "Calendar" };

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
        icon={CalendarDays}
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

      <WeekNav baseHref="/calendar" weekStart={weekStart} />

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
