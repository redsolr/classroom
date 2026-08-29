import type { Metadata } from "next";
import { and, asc, count, eq, inArray, max, min, notInArray } from "drizzle-orm";
import { format, formatDistanceToNow } from "date-fns";
import { db, homework, lessons, teachers } from "@/db";
import { requireStudent } from "@/lib/auth";
import { NOT_HAPPENED_STATUSES } from "@/lib/lesson-status";
import { Avatar } from "@/components/ui/avatar";
import { UserRound } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "My teacher" };

export default async function StudentTeacherPage() {
  const student = await requireStudent();

  const [teacher, lessonAgg, nextScheduled, openHomeworkCount] =
    await Promise.all([
      db.query.teachers.findFirst({
        where: eq(teachers.id, student.teacherId),
      }),
      db
        .select({
          total: count(lessons.id),
          firstAt: min(lessons.startedAt),
          lastAt: max(lessons.startedAt),
        })
        .from(lessons)
        .where(
          and(
            eq(lessons.studentId, student.id),
            notInArray(lessons.status, [...NOT_HAPPENED_STATUSES]),
          ),
        ),
      db.query.lessons.findFirst({
        where: and(
          eq(lessons.studentId, student.id),
          eq(lessons.status, "scheduled"),
        ),
        orderBy: asc(lessons.startedAt),
      }),
      db
        .select({ value: count() })
        .from(homework)
        .where(
          and(
            eq(homework.studentId, student.id),
            inArray(homework.status, ["assigned", "submitted"]),
          ),
        ),
    ]);

  const agg = lessonAgg[0];
  const firstAt = agg?.firstAt ? new Date(agg.firstAt) : null;
  const lastAt = agg?.lastAt ? new Date(agg.lastAt) : null;

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Teacher",
      value: (
        <span className="flex items-center gap-2.5">
          <Avatar name={teacher?.name ?? "Teacher"} size="sm" />
          <span className="font-medium">{teacher?.name ?? "Your teacher"}</span>
        </span>
      ),
    },
    {
      label: "Email",
      value: teacher?.email ? (
        <a
          href={`mailto:${teacher.email}`}
          className="text-accent-text hover:underline"
        >
          {teacher.email}
        </a>
      ) : (
        "—"
      ),
    },
    {
      label: "Teaches",
      value:
        teacher?.languagesTaught && teacher.languagesTaught.length > 0
          ? teacher.languagesTaught.join(", ")
          : "—",
    },
    {
      label: "You're learning",
      value: `${student.targetLanguage}${student.currentLevel ? ` · ${student.currentLevel}` : ""}${student.targetLevel ? ` → ${student.targetLevel}` : ""}`,
    },
    {
      label: "Lesson rhythm",
      value: student.lessonFrequency ?? "—",
    },
    {
      label: "Lessons together",
      value: String(agg?.total ?? 0),
    },
    {
      label: "Learning together since",
      value: firstAt
        ? `${format(firstAt, "MMMM d, yyyy")} · ${formatDistanceToNow(firstAt, { addSuffix: true })}`
        : "No lessons yet",
    },
    {
      label: "Last lesson",
      value: lastAt
        ? `${format(lastAt, "EEE, MMM d")} · ${formatDistanceToNow(lastAt, { addSuffix: true })}`
        : "—",
    },
    {
      label: "Next lesson",
      value: nextScheduled
        ? `${format(new Date(nextScheduled.startedAt), "EEE, MMM d · HH:mm")} · ${formatDistanceToNow(new Date(nextScheduled.startedAt), { addSuffix: true })}`
        : "Nothing booked yet",
    },
    {
      label: "Open homework",
      value: String(openHomeworkCount[0]?.value ?? 0),
    },
    ...(teacher?.timezone
      ? [{ label: "Teacher's timezone", value: teacher.timezone }]
      : []),
  ];

  return (
    <div className="max-w-xl">
      <PageHeader
        icon={UserRound}
        title="My teacher"
        subtitle="You and your teacher, at a glance."
      />

      <Card>
        <table className="w-full text-[0.9375rem]">
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border last:border-0"
              >
                <td className="w-44 px-4 py-2.5 align-top text-[0.875rem] text-fg-tertiary">
                  {row.label}
                </td>
                <td className="px-4 py-2.5">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-4 text-center text-[0.8125rem] text-fg-tertiary">
        Lessons are booked with your teacher directly — new sessions appear in
        your schedule as soon as they&rsquo;re planned.
      </p>
    </div>
  );
}
