import type { Metadata } from "next";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ClipboardList } from "lucide-react";
import { requireTeacher } from "@/lib/auth";
import { getDashboardData, listStudents } from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import { Badge, homeworkStatusTone, lessonStatusTone } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/page-header";
import { NewLessonDialog } from "@/components/lessons/new-lesson-dialog";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const teacher = await requireTeacher();
  const [data, students] = await Promise.all([
    getDashboardData(teacher.id),
    listStudents(teacher.id),
  ]);
  const firstName = (teacher.name ?? "there").split(" ")[0];
  const studentOptions = students.map((s) => ({ id: s.id, name: s.name }));
  const prepCandidates = students
    .filter((s) => s.status === "active" || s.status === "trial")
    .sort(
      (a, b) =>
        (b.lastLessonAt?.getTime() ?? 0) - (a.lastLessonAt?.getTime() ?? 0),
    )
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={
          data.studentCount === 0
            ? "Let's set up your class-room."
            : `${data.studentCount} student${data.studentCount === 1 ? "" : "s"} · ${data.pendingReview.length} lesson${data.pendingReview.length === 1 ? "" : "s"} awaiting review`
        }
        actions={
          students.length > 0 ? (
            <NewLessonDialog students={studentOptions} />
          ) : (
            <Link
              href="/students"
              className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-[0.9375rem] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              Add your first student
            </Link>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Prep your next lessons"
            actions={
              <Link
                href="/students"
                className="text-[0.8125rem] text-accent-text hover:underline"
              >
                All students
              </Link>
            }
          />
          <div className="px-4 py-3">
            {prepCandidates.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                Add a student and their prep sheet will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {prepCandidates.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/students/${s.id}/prep`}
                      className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover"
                    >
                      <Avatar name={s.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">
                          {s.name}
                        </span>
                        <span className="block text-[0.78rem] text-fg-tertiary">
                          {s.lastLessonAt
                            ? `last lesson ${formatDistanceToNow(new Date(s.lastLessonAt), { addSuffix: true })}`
                            : "no lessons yet"}
                          {s.openHomeworkCount > 0
                            ? ` · ${s.openHomeworkCount} open homework`
                            : ""}
                        </span>
                      </span>
                      <ClipboardList className="size-4 text-fg-tertiary" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Lessons awaiting review"
            actions={
              <Link
                href="/lessons"
                className="text-[0.8125rem] text-accent-text hover:underline"
              >
                All lessons
              </Link>
            }
          />
          <div className="px-4 py-3">
            {data.pendingReview.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                Nothing waiting — every lesson is finished properly. 🎉
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.pendingReview.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/lessons/${l.id}`}
                      className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover"
                    >
                      <Avatar name={l.studentName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">
                          {l.title ?? `Lesson with ${l.studentName}`}
                        </span>
                        <span className="block text-[0.78rem] text-fg-tertiary">
                          {format(new Date(l.startedAt), "MMM d · HH:mm")}
                        </span>
                      </span>
                      <Badge tone={lessonStatusTone[l.status]}>{l.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Outstanding homework" />
          <div className="px-4 py-3">
            {data.openHomework.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                No open homework across your students.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.openHomework.map((h) => (
                  <li key={h.id} className="flex items-center gap-2.5 py-2">
                    <Avatar name={h.studentName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem]">
                        {h.title}
                      </span>
                      <span className="block text-[0.78rem] text-fg-tertiary">
                        {h.studentName}
                        {h.dueAt
                          ? ` · due ${format(new Date(h.dueAt), "MMM d")}`
                          : ""}
                      </span>
                    </span>
                    <Badge tone={homeworkStatusTone[h.status]}>{h.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent lessons" />
          <div className="px-4 py-3">
            {data.recentLessons.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                No lessons yet — create one from a student profile.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentLessons.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/lessons/${l.id}`}
                      className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover"
                    >
                      <Avatar name={l.studentName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem]">
                          {l.title ?? `Lesson with ${l.studentName}`}
                        </span>
                        <span className="block text-[0.78rem] text-fg-tertiary">
                          {formatDistanceToNow(new Date(l.startedAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </span>
                      <Badge tone={lessonStatusTone[l.status]}>{l.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Students not seen recently"
            actions={
              <Link
                href="/students"
                className="text-[0.8125rem] text-accent-text hover:underline"
              >
                All students
              </Link>
            }
          />
          <div className="px-4 py-3">
            {data.staleStudents.length === 0 ? (
              <p className="text-[0.875rem] text-fg-tertiary">
                All active students had a lesson in the last two weeks.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.staleStudents.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/students/${s.id}`}
                      className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover"
                    >
                      <Avatar name={s.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">
                          {s.name}
                        </span>
                        <span className="block text-[0.78rem] text-fg-tertiary">
                          {s.lastLessonAt
                            ? `last lesson ${formatDistanceToNow(new Date(s.lastLessonAt), { addSuffix: true })}`
                            : "no lessons yet"}
                        </span>
                      </span>
                    </Link>
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
